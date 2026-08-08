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
  await sql`
    CREATE TABLE IF NOT EXISTS doctors (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#60a5fa',
      active     BOOLEAN NOT NULL DEFAULT true,
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

  await sql`
    CREATE TABLE IF NOT EXISTS dental_appointments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id UUID NOT NULL REFERENCES patients(id),
      doctor_id  UUID NOT NULL REFERENCES doctors(id),
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
      doctor_id   UUID NOT NULL REFERENCES doctors(id),
      date        TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `

  // Seed doctors if empty
  const docCount = await sql`SELECT COUNT(*)::int AS cnt FROM doctors`
  if ((docCount[0]?.cnt ?? 0) === 0) {
    await sql`
      INSERT INTO doctors (name, specialty, color) VALUES
        ('Dt. Faruk Mutlu',   'İmplant & Protez', '#60a5fa'),
        ('Dt. Mustafa Çetin', 'Ortodonti',        '#34d399'),
        ('Dt. Osman Kaya',    'Endodonti',        '#a78bfa')
    `
    console.log('[Migration] Varsayılan doktorlar oluşturuldu')
  }

  await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialty TEXT NOT NULL DEFAULT 'Genel'`

  console.log('[Migration] Tamamlandı — şema hazır')
  await sql.end()
}

runMigrations().catch((err) => {
  console.error('[Migration] Hata:', err)
  process.exit(1)
})
