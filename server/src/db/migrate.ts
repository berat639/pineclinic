/**
 * Database migration — raw SQL CREATE TABLE IF NOT EXISTS.
 * No generated files needed. Safe to run multiple times.
 */
import postgres from 'postgres'
import { readFileSync } from 'node:fs'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[Migration] DATABASE_URL tanımlı değil')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { max: 1 })

async function runMigrations() {
  console.log('[Migration] Başlıyor...')

  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`
  await sql`CREATE EXTENSION IF NOT EXISTS vector`

  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                    TEXT NOT NULL,
      credentials             TEXT NOT NULL,
      project_id              TEXT NOT NULL,
      location                TEXT NOT NULL DEFAULT 'europe-west1',
      is_active               BOOLEAN DEFAULT true,
      priority                INTEGER DEFAULT 0,
      daily_token_limit       BIGINT DEFAULT 1000000,
      monthly_token_limit     BIGINT DEFAULT 30000000,
      max_concurrent_sessions INTEGER DEFAULT 20,
      created_at              TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS account_usage (
      account_id          UUID REFERENCES accounts(id),
      date                DATE NOT NULL,
      prompt_tokens       BIGINT DEFAULT 0,
      response_tokens     BIGINT DEFAULT 0,
      total_tokens        BIGINT DEFAULT 0,
      session_count       INTEGER DEFAULT 0,
      concurrent_sessions INTEGER DEFAULT 0,
      PRIMARY KEY (account_id, date)
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id   UUID REFERENCES accounts(id),
      started_at   TIMESTAMPTZ DEFAULT now(),
      ended_at     TIMESTAMPTZ,
      total_tokens BIGINT DEFAULT 0,
      status       TEXT DEFAULT 'active'
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at       TIMESTAMPTZ DEFAULT now(),
      customer_name    TEXT NOT NULL,
      phone            TEXT NOT NULL,
      type             TEXT NOT NULL,
      vehicle_info     TEXT,
      issue_or_request TEXT,
      date             TEXT NOT NULL,
      time             TEXT NOT NULL
    )
  `

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS session_id TEXT
  `
  // If the column existed previously as UUID, drop FK and convert to TEXT (idempotent)
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'appointments' AND column_name = 'session_id'
          AND udt_name = 'uuid'
      ) THEN
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_session_id_sessions_id_fk;
        ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_session_id_fkey;
        ALTER TABLE appointments ALTER COLUMN session_id TYPE TEXT USING session_id::text;
      END IF;
    END $$
  `

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS calendar_event_id TEXT
  `

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS discount_requested BOOLEAN DEFAULT false
  `

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS notes TEXT
  `

  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS extra_fields TEXT
  `

  // Retire the obsolete ATA HSYS integration identifier from databases created
  // by earlier schema revisions. Safe when the legacy column is absent.
  await sql`ALTER TABLE appointments DROP COLUMN IF EXISTS ata_hsys_id`

  // Generic JSONB data column for flow-based appointments
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb
  `

  // Make legacy columns optional (for new flow-based appointments)
  await sql`
    ALTER TABLE appointments ALTER COLUMN customer_name SET DEFAULT ''
  `
  await sql`
    ALTER TABLE appointments ALTER COLUMN phone SET DEFAULT ''
  `
  await sql`
    ALTER TABLE appointments ALTER COLUMN type SET DEFAULT ''
  `
  await sql`
    ALTER TABLE appointments ALTER COLUMN date SET DEFAULT ''
  `
  await sql`
    ALTER TABLE appointments ALTER COLUMN time SET DEFAULT ''
  `

  await sql`
    CREATE TABLE IF NOT EXISTS conversation_flows (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL DEFAULT 'main',
      nodes      JSONB NOT NULL DEFAULT '[]'::jsonb,
      edges      JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`ALTER TABLE conversation_flows ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound'`

  await sql`
    CREATE TABLE IF NOT EXISTS business_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── Knowledge: single-doc model with vector(768) embedding ──────────────
  // If old chunk-model tables exist, drop them safely.
  await sql`DROP TABLE IF EXISTS knowledge_chunks CASCADE`

  // Recreate knowledge_documents in single-doc shape (idempotent on fresh DB).
  // For existing DBs with the old shape, we add missing columns and ignore
  // legacy ones (name/file_type/original_text/chunk_count remain harmless).
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category      TEXT NOT NULL DEFAULT 'genel',
      title         TEXT NOT NULL DEFAULT '',
      content       TEXT NOT NULL DEFAULT '',
      call_direction TEXT NOT NULL DEFAULT 'both',
      active        BOOLEAN NOT NULL DEFAULT true,
      embedding     vector(768),
      embedded_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now()
    )
  `

  // Add columns for legacy databases that had different shape
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS category   TEXT NOT NULL DEFAULT 'genel'`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS title      TEXT NOT NULL DEFAULT ''`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS content    TEXT NOT NULL DEFAULT ''`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS call_direction TEXT NOT NULL DEFAULT 'both'`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT true`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding  vector(768)`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ`
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`

  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_documents_embedding_idx
      ON knowledge_documents USING hnsw (embedding vector_cosine_ops)
  `
  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_documents_active_idx
      ON knowledge_documents (active)
  `

  // ── Recordings (metadata only — .wav files stay on disk) ───────────────
  await sql`
    CREATE TABLE IF NOT EXISTS recordings (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id   TEXT,
      filename     TEXT NOT NULL,
      started_at   TIMESTAMPTZ NOT NULL,
      ended_at     TIMESTAMPTZ NOT NULL,
      duration_ms  BIGINT NOT NULL,
      size_bytes   BIGINT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT now()
    )
  `

  // Bump existing accounts still at old default (5) to new default (20)
  await sql`
    UPDATE accounts SET max_concurrent_sessions = 20
    WHERE max_concurrent_sessions = 5
  `

  // ── Knowledge Categories (dynamic, admin-managed) ─────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug       TEXT NOT NULL UNIQUE,
      label      TEXT NOT NULL,
      icon       TEXT NOT NULL DEFAULT '📁',
      color      TEXT NOT NULL DEFAULT '#60a5fa',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  // Seed default categories if empty
  const catCount = await sql`SELECT COUNT(*)::int AS cnt FROM knowledge_categories`
  if ((catCount[0]?.cnt ?? 0) === 0) {
    await sql`
      INSERT INTO knowledge_categories (slug, label, icon, color, sort_order) VALUES
        ('genel',    'Genel',    '🌐', '#60a5fa', 0),
        ('servis',   'Servis',   '🔧', '#34d399', 1),
        ('galeri',   'Galeri',   '🏪', '#a78bfa', 2),
        ('kampanya', 'Kampanya', '🎯', '#fb923c', 3),
        ('sss',      'SSS',      '❓', '#f59e0b', 4),
        ('arac',     'Araç',     '🚗', '#38bdf8', 5),
        ('musteri',  'Müşteri',  '👤', '#f472b6', 6)
      ON CONFLICT (slug) DO NOTHING
    `
    console.log('[Migration] Varsayılan kategoriler oluşturuldu')
  }

  // ── VIP Assistants & Personal Assistant Numbers ───────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS vip_assistants (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone            TEXT NOT NULL UNIQUE,
      contact_name     TEXT,
      greeting         TEXT NOT NULL DEFAULT 'Merhaba! Ben Berat Bey''in kişisel asistanı Pine Asistan, hoş geldiniz! Nasıl yardımcı olabilirim?',
      custom_prompt    TEXT,
      grounding_enabled BOOLEAN NOT NULL DEFAULT true,
      active           BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ DEFAULT now(),
      updated_at       TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── Dental Clinic Tables ───────────────────────────────────────────────────
  // doctors table removed — hekim users serve as doctors now

  await sql`
    CREATE TABLE IF NOT EXISTS clinics (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name            TEXT NOT NULL,
      netgsm_usercode TEXT,
      netgsm_password TEXT,
      sms_sender_id   TEXT,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id  UUID REFERENCES clinics(id),
      type       TEXT NOT NULL,
      name       TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS patients (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      phone      TEXT,
      balance    INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── RBAC Tables ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT NOT NULL UNIQUE,
      phone         TEXT,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      avatar        TEXT,
      role          TEXT NOT NULL DEFAULT 'host',
      specialty     TEXT,
      color         TEXT,
      active        BOOLEAN NOT NULL DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now()
    )
  `

  // Drop legacy doctor_id column if exists
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS doctor_id`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS color TEXT`

  await sql`
    CREATE TABLE IF NOT EXISTS dental_appointments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      doctor_id  UUID REFERENCES users(id),
      title      TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time   TIMESTAMPTZ NOT NULL,
      status     TEXT NOT NULL DEFAULT 'scheduled',
      type       TEXT NOT NULL DEFAULT 'general',
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS treatment_plans (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id     UUID NOT NULL REFERENCES patients(id),
      procedure_name TEXT NOT NULL,
      tooth_number   TEXT,
      indication     TEXT,
      cost           INTEGER NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'planned',
      created_at     TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS patient_payments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      date       TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      method     TEXT NOT NULL DEFAULT 'Nakit',
      notes      TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS completed_works (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id  UUID NOT NULL REFERENCES patients(id),
      doctor_id   UUID NOT NULL REFERENCES users(id),
      date        TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  // doctors table removed — seeding hekim users happens via seed-users script



  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id),
      token_jti  TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS shifts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id),
      date       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      shift_type TEXT NOT NULL DEFAULT 'tam',
      notes      TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS shift_swap_requests (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_id    UUID NOT NULL REFERENCES users(id),
      target_id       UUID NOT NULL REFERENCES users(id),
      shift_id        UUID NOT NULL REFERENCES shifts(id),
      target_shift_id UUID REFERENCES shifts(id),
      status          TEXT NOT NULL DEFAULT 'pending',
      reason          TEXT,
      reviewed_by     UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ DEFAULT now(),
      reviewed_at     TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id),
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT,
      link       TEXT,
      read       BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID REFERENCES users(id),
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   TEXT,
      metadata    JSONB DEFAULT '{}'::jsonb,
      ip_address  TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category   TEXT NOT NULL DEFAULT 'malzeme',
      item_name  TEXT NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 1,
      unit_cost  INTEGER NOT NULL DEFAULT 0,
      total_cost INTEGER NOT NULL DEFAULT 0,
      entered_by UUID REFERENCES users(id),
      notes      TEXT,
      date       TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name             TEXT NOT NULL,
      category         TEXT NOT NULL DEFAULT 'genel',
      quantity         INTEGER NOT NULL DEFAULT 0,
      min_threshold    INTEGER NOT NULL DEFAULT 5,
      unit             TEXT NOT NULL DEFAULT 'adet',
      cost_per_unit    INTEGER NOT NULL DEFAULT 0,
      last_restocked_at TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS device_maintenances (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_name      TEXT NOT NULL,
      maintenance_type TEXT NOT NULL,
      scheduled_date   TEXT NOT NULL,
      completed_date   TEXT,
      notes            TEXT,
      status           TEXT NOT NULL DEFAULT 'scheduled',
      created_at       TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS waiting_list (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id           UUID NOT NULL REFERENCES patients(id),
      preferred_doctor_id  UUID REFERENCES users(id),
      preferred_date       TEXT,
      preferred_time_range TEXT,
      notes                TEXT,
      status               TEXT NOT NULL DEFAULT 'waiting',
      notified_at          TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS attendance (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id),
      date        TEXT NOT NULL,
      clock_in    TIMESTAMPTZ,
      clock_out   TIMESTAMPTZ,
      total_hours INTEGER,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS tooth_records (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id   UUID NOT NULL REFERENCES patients(id),
      tooth_number INTEGER NOT NULL,
      surface      TEXT,
      condition    TEXT NOT NULL DEFAULT 'healthy',
      treatment_id UUID REFERENCES treatment_plans(id),
      notes        TEXT,
      recorded_by  UUID REFERENCES users(id),
      date         TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS procedure_templates (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id            UUID REFERENCES users(id),
      name                 TEXT NOT NULL,
      default_duration_min INTEGER NOT NULL DEFAULT 30,
      default_cost         INTEGER NOT NULL DEFAULT 0,
      tooth_surfaces       TEXT,
      category             TEXT NOT NULL DEFAULT 'genel',
      created_at           TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS consultations (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_doctor_id UUID NOT NULL REFERENCES users(id),
      to_doctor_id   UUID NOT NULL REFERENCES users(id),
      patient_id     UUID NOT NULL REFERENCES patients(id),
      notes          TEXT,
      status         TEXT NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS doctor_notes (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id  UUID NOT NULL REFERENCES users(id),
      patient_id UUID NOT NULL REFERENCES patients(id),
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS patient_anamnesis (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      form_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
      filled_by  UUID REFERENCES users(id),
      filled_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id   UUID NOT NULL REFERENCES users(id),
      day_of_week INTEGER NOT NULL,
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      is_active   BOOLEAN NOT NULL DEFAULT true
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS calendar_blocks (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id  UUID NOT NULL REFERENCES users(id),
      date       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS material_usages (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      doctor_id         UUID NOT NULL REFERENCES users(id),
      patient_id        UUID REFERENCES patients(id),
      appointment_id    UUID REFERENCES dental_appointments(id),
      inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
      quantity          INTEGER NOT NULL DEFAULT 1,
      date              TEXT NOT NULL,
      created_at        TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS installment_plans (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id        UUID NOT NULL REFERENCES patients(id),
      total_amount      INTEGER NOT NULL,
      installment_count INTEGER NOT NULL,
      paid_count        INTEGER NOT NULL DEFAULT 0,
      installments      JSONB NOT NULL DEFAULT '[]'::jsonb,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS revenue_targets (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      month         INTEGER NOT NULL,
      year          INTEGER NOT NULL,
      target_amount INTEGER NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `

  // Extend patients table
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id)`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date TEXT`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender TEXT`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS tc_identity TEXT`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies TEXT[] DEFAULT '{}'`
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS medications TEXT[] DEFAULT '{}'`

  // Extend treatment_plans for builder steps
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id)`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS is_periodic BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS period_days INTEGER`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS next_notification_date TEXT`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notify_patient BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'sms'`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS total_cost INTEGER DEFAULT 0`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS completed_steps INTEGER DEFAULT 0`

  // Extend dental_appointments: allow nullable doctor_id (already nullable in schema)
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dental_appointments' AND column_name = 'doctor_id'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE dental_appointments ALTER COLUMN doctor_id DROP NOT NULL;
      END IF;
    END $$
  `
  
  // Fix foreign key constraint for doctor_id (it was referencing the removed 'doctors' table)
  await sql`UPDATE dental_appointments SET doctor_id = NULL WHERE doctor_id NOT IN (SELECT id FROM users)`
  await sql`ALTER TABLE dental_appointments DROP CONSTRAINT IF EXISTS dental_appointments_doctor_id_fkey`
  await sql`ALTER TABLE dental_appointments ADD CONSTRAINT dental_appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES users(id)`

  await sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS time_confirmed BOOLEAN NOT NULL DEFAULT true`
  await sql`ALTER TABLE dental_appointments ADD COLUMN IF NOT EXISTS complaint TEXT`

  await sql`ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'`
  await sql`ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS due_date TEXT`


  // Extend inventory_items
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand TEXT`
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS expiry_date TEXT`
  await sql`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_name TEXT`

  // Extend device_maintenances
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS serial_number TEXT`
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS maintenance_firm TEXT`
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS warranty_end TEXT`

  // Extend treatment_plans
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS tooth_number TEXT`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS indication TEXT`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS dcm_url TEXT`

  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS device_status TEXT NOT NULL DEFAULT 'active'`
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS is_periodic BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS periodic_days INTEGER`
  await sql`ALTER TABLE device_maintenances ADD COLUMN IF NOT EXISTS next_maintenance_date TEXT`

  // Inventory movements log
  await sql`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id    UUID NOT NULL REFERENCES inventory_items(id),
      type       TEXT NOT NULL,
      quantity   INTEGER NOT NULL,
      notes      TEXT,
      user_id    UUID REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `

  // Extend patient_payments with treatment_plan_id
  await sql`ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS treatment_plan_id UUID REFERENCES treatment_plans(id)`

  // ── Treatment Groups ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS treatment_groups (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id  UUID NOT NULL REFERENCES patients(id),
      name        TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_by_id UUID REFERENCES users(id),
      updated_by_id UUID REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`ALTER TABLE treatment_groups ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id)`.catch(() => {})
  await sql`ALTER TABLE treatment_groups ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES users(id)`.catch(() => {})
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES treatment_groups(id)`
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES users(id)`

  // ── Appointment Treatments (Junction) ──────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS appointment_treatments (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id    UUID NOT NULL REFERENCES dental_appointments(id) ON DELETE CASCADE,
      treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
      session_number    INTEGER NOT NULL DEFAULT 1,
      session_status    TEXT NOT NULL DEFAULT 'planned',
      notes             TEXT,
      created_at        TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── Patient Diseases ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS patient_diseases (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id  UUID NOT NULL REFERENCES patients(id),
      name        TEXT NOT NULL,
      notes       TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── Consultations Updates ─────────────────────────────────────────────────
  await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id)`.catch(() => {})
  await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES users(id)`.catch(() => {})
  await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consultation_note TEXT`.catch(() => {})
  await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS disease_note TEXT`.catch(() => {})

  // ── Patient Notes ────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS patient_notes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id  UUID REFERENCES patients(id),
      phone       TEXT,
      content     TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'voice',
      status      TEXT NOT NULL DEFAULT 'unread',
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  // ── Unique Constraints ────────────────────────────────────────────────────
  await sql`ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)`.catch(() => {})
  await sql`ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_token_jti_unique UNIQUE (token_jti)`.catch(() => {})

  // ── Drop Deprecated ───────────────────────────────────────────────────────
  await sql`DROP TABLE IF EXISTS doctors CASCADE`.catch(() => {})

  // ── WhatsApp preferences and Evolution API migration ──────────────────────
  await sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT false`.catch(() => {})

  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN NOT NULL DEFAULT false`.catch(() => {})
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false`.catch(() => {})
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false`.catch(() => {})

  await sql`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id         UUID NOT NULL REFERENCES clinics(id),
      patient_phone     TEXT NOT NULL,
      patient_id        UUID REFERENCES patients(id),
      history           JSONB NOT NULL DEFAULT '[]',
      last_message_at   TIMESTAMPTZ DEFAULT now(),
      window_expires_at TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT now(),
      updated_at        TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_wa_conv_clinic_phone ON whatsapp_conversations(clinic_id, patient_phone)`.catch(() => {})

  await sql.begin(async tx => {
    await tx.unsafe(readFileSync(new URL('./evolution-migration.sql', import.meta.url), 'utf8'))
  })

  // ── Multi-tenant clinics and hostname routing ────────────────────────────
  // Existing installations are backfilled into one default clinic. New
  // clinics are provisioned from a verified platform-admin login on a hostname
  // that was already routed to this application by Dokploy.
  const existingClinic = await sql`SELECT id FROM clinics ORDER BY created_at LIMIT 1`
  const defaultClinicId = existingClinic[0]?.id ?? (await sql`
    INSERT INTO clinics (name, is_active)
    VALUES (${process.env.DEFAULT_CLINIC_NAME || 'Varsayılan Klinik'}, true)
    RETURNING id
  `)[0]!.id

  await sql`
    CREATE TABLE IF NOT EXISTS clinic_domains (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      hostname    TEXT NOT NULL UNIQUE,
      is_primary  BOOLEAN NOT NULL DEFAULT true,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT now(),
      updated_at  TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS clinic_domains_clinic_idx ON clinic_domains(clinic_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS clinic_phone_numbers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL UNIQUE,
      label TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS clinic_phone_numbers_clinic_idx ON clinic_phone_numbers(clinic_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS clinic_settings (
      clinic_id  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (clinic_id, key)
    )
  `

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false`
  await sql`
    CREATE TABLE IF NOT EXISTS clinic_memberships (
      clinic_id  UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'host',
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (clinic_id, user_id)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS clinic_memberships_user_idx ON clinic_memberships(user_id)`
  await sql`
    INSERT INTO clinic_memberships (clinic_id, user_id, role, active)
    SELECT ${defaultClinicId}, id, role, active FROM users
    ON CONFLICT (clinic_id, user_id) DO NOTHING
  `

  const tenantTables = [
    'sessions', 'appointments', 'conversation_flows', 'knowledge_documents', 'recordings',
    'knowledge_categories', 'dental_appointments', 'treatment_groups',
    'patient_payments', 'completed_works', 'shifts', 'shift_swap_requests',
    'notifications', 'audit_log', 'expenses', 'inventory_items',
    'device_maintenances', 'inventory_movements', 'waiting_list', 'attendance',
    'tooth_records', 'procedure_templates', 'doctor_notes', 'patient_anamnesis',
    'patient_diseases', 'doctor_availability', 'calendar_blocks',
    'material_usages', 'installment_plans', 'revenue_targets', 'patient_notes',
    'vip_assistants'
  ]
  for (const table of tenantTables) {
    await sql.unsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id)`)
    await sql.unsafe(`UPDATE "${table}" SET clinic_id = $1 WHERE clinic_id IS NULL`, [defaultClinicId])
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "${table}_clinic_idx" ON "${table}" (clinic_id)`)
  }
  await sql`ALTER TABLE sessions ALTER COLUMN clinic_id SET NOT NULL`
  // These legacy tables can contain rows created by older deployments. Keep
  // the startup migration recoverable: the backfill above scopes existing
  // rows, while the application schema requires clinic_id for every new row.
  // Database NOT NULL enforcement can be added later as a verified, offline
  // constraint migration after production data has been audited.
  await sql`UPDATE patients SET clinic_id = ${defaultClinicId} WHERE clinic_id IS NULL`
  await sql`UPDATE treatment_plans SET clinic_id = ${defaultClinicId} WHERE clinic_id IS NULL`
  await sql`UPDATE consultations SET clinic_id = ${defaultClinicId} WHERE clinic_id IS NULL`
  await sql`UPDATE notification_templates SET clinic_id = ${defaultClinicId} WHERE clinic_id IS NULL`

  // Values that only need to be unique inside a clinic must not remain global.
  await sql`ALTER TABLE knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_slug_unique`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS knowledge_categories_clinic_slug_unique ON knowledge_categories (clinic_id, slug)`
  await sql`ALTER TABLE vip_assistants DROP CONSTRAINT IF EXISTS vip_assistants_phone_unique`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS vip_assistants_clinic_phone_unique ON vip_assistants (clinic_id, phone)`

  await sql`
    CREATE TABLE IF NOT EXISTS doctor_leaves (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id   UUID REFERENCES clinics(id) ON DELETE CASCADE,
      doctor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      start_time  TEXT NOT NULL,
      end_time    TEXT NOT NULL,
      is_full_day BOOLEAN NOT NULL DEFAULT false,
      reason      TEXT,
      notes       TEXT,
      created_by  UUID REFERENCES users(id),
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS doctor_leaves_clinic_date_idx ON doctor_leaves (clinic_id, date)`
  await sql`CREATE INDEX IF NOT EXISTS doctor_leaves_doctor_date_idx ON doctor_leaves (doctor_id, date)`

  // Copy legacy global settings into the default clinic without removing the
  // old table yet; this keeps rollback and mixed-version deployments safe.
  await sql`
    INSERT INTO clinic_settings (clinic_id, key, value, updated_at)
    SELECT ${defaultClinicId}, key, value, updated_at FROM business_settings
    ON CONFLICT (clinic_id, key) DO NOTHING
  `

  const configuredHosts = new Set<string>()
  for (const raw of (process.env.DEFAULT_CLINIC_HOSTS || '').split(',')) {
    const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.split(':')[0]
    if (host) configuredHosts.add(host)
  }
  try {
    if (process.env.CLIENT_APP_URL) configuredHosts.add(new URL(process.env.CLIENT_APP_URL).hostname.toLowerCase())
  } catch {}
  for (const hostname of configuredHosts) {
    await sql`
      INSERT INTO clinic_domains (clinic_id, hostname, is_primary, is_active)
      VALUES (${defaultClinicId}, ${hostname}, true, true)
      ON CONFLICT (hostname) DO NOTHING
    `
  }

  console.log('[Migration] Tamamlandı — şema hazır')
  await sql.end()
}

runMigrations().catch((err) => {
  console.error('[Migration] Hata:', err)
  process.exit(1)
})
