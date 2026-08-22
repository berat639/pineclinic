/**
 * Database migration — raw SQL CREATE TABLE IF NOT EXISTS.
 * No generated files needed. Safe to run multiple times.
 */
import postgres from 'postgres'

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
    ADD COLUMN IF NOT EXISTS ata_hsys_id TEXT
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
  await sql`ALTER TABLE patients ADD COLUMN IF NOT EXISTS tc_no TEXT`
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
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `
  await sql`ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES treatment_groups(id)`

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

  // ── Unique Constraints ────────────────────────────────────────────────────
  await sql`ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)`.catch(() => {})
  await sql`ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_token_jti_unique UNIQUE (token_jti)`.catch(() => {})
  await sql`ALTER TABLE knowledge_categories ADD CONSTRAINT knowledge_categories_slug_unique UNIQUE (slug)`.catch(() => {})

  // ── Drop Deprecated ───────────────────────────────────────────────────────
  await sql`DROP TABLE IF EXISTS doctors CASCADE`.catch(() => {})

  console.log('[Migration] Tamamlandı — şema hazır')
  await sql.end()
}

runMigrations().catch((err) => {
  console.error('[Migration] Hata:', err)
  process.exit(1)
})
