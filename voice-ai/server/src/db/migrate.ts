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

  // Add session_id to appointments if not exists (idempotent)
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id)
  `

  // Add calendar_event_id to appointments if not exists (idempotent)
  await sql`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS calendar_event_id TEXT
  `

  await sql`
    CREATE TABLE IF NOT EXISTS business_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`CREATE EXTENSION IF NOT EXISTS vector`

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      file_type     TEXT NOT NULL DEFAULT 'txt',
      original_text TEXT NOT NULL,
      chunk_count   INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id  UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      chunk_index  INTEGER NOT NULL,
      chunk_text   TEXT NOT NULL,
      embedding    vector(768),
      created_at   TIMESTAMPTZ DEFAULT now()
    )
  `

  // Migrate existing embedding column to vector(768) for text-embedding-004
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'
          AND udt_name = 'vector'
      ) THEN
        ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(768) USING NULL;
        DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
      END IF;
    END $$
  `

  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
      ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  `

  // Bump existing accounts still at old default (5) to new default (20)
  await sql`
    UPDATE accounts SET max_concurrent_sessions = 20
    WHERE max_concurrent_sessions = 5
  `

  console.log('[Migration] Tamamlandı — 7 tablo hazır')
  await sql.end()
}

runMigrations().catch((err) => {
  console.error('[Migration] Hata:', err)
  process.exit(1)
})
