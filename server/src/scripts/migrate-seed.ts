/**
 * Migration seed script — run once after database is initialized.
 * Seeds:
 *   1. Default Google Cloud account from .env
 *   2. Existing appointments from data/appointments.json
 *
 * Usage: bun run server/src/scripts/migrate-seed.ts
 * Safe to run multiple times (uses upsert/skip-if-exists logic)
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import postgres from 'postgres'
import { embedText } from '../rag'
import { RAG_PROMPT_DOCS } from '../data/rag-prompts'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { max: 1 })

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

async function seedDefaultAccount() {
  const credentials = process.env.GOOGLE_CREDENTIALS_JSON
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  const location = process.env.GOOGLE_VERTEX_LOCATION || 'europe-west1'

  if (!credentials || !projectId) {
    console.log('[Seed] GOOGLE_CREDENTIALS_JSON veya GOOGLE_CLOUD_PROJECT eksik — hesap seed atlandı')
    return
  }

  // Insert only if no accounts exist yet
  const existing = await sql`SELECT COUNT(*) AS count FROM accounts`
  if (Number(existing[0]?.count) > 0) {
    console.log('[Seed] Hesap zaten mevcut — atlandı')
    return
  }

  await sql`
    INSERT INTO accounts (name, credentials, project_id, location, is_active, priority)
    VALUES ('Varsayılan Hesap', ${credentials}, ${projectId}, ${location}, true, 0)
  `
  console.log('[Seed] Varsayılan hesap eklendi:', projectId)
}

async function seedKnowledgePrompts() {
  // Vertex embedding gerektirir; creds yoksa atla (belge embedding'siz
  // eklenirse retrieveTopK 'embedding IS NOT NULL' filtresinden geçmez).
  if (!process.env.GOOGLE_CREDENTIALS_JSON) {
    console.log('[Seed] GOOGLE_CREDENTIALS_JSON eksik — bilgi bankası prompt seed atlandı')
    return
  }

  let inserted = 0
  let skipped = 0
  let failed = 0
  const nowIso = new Date().toISOString()

  for (const doc of RAG_PROMPT_DOCS) {
    // Idempotent: aynı başlık varsa atla (her redeploy'da duplicate olmasın).
    const existing = await sql`SELECT 1 FROM knowledge_documents WHERE title = ${doc.title} LIMIT 1`
    if (existing.length > 0) {
      skipped++
      continue
    }

    try {
      // Title + content embed → kullanıcı sorusu (title) ile retrieval recall'i artar.
      const embedding = await embedText(`${doc.title}\n${doc.content}`)
      await sql`
        INSERT INTO knowledge_documents (category, title, content, active, embedding, embedded_at, created_at, updated_at)
        VALUES (
          ${doc.category},
          ${doc.title},
          ${doc.content},
          true,
          ${vectorLiteral(embedding)}::vector,
          ${nowIso},
          ${nowIso},
          ${nowIso}
        )
      `
      inserted++
    } catch (err) {
      failed++
      console.error(`[Seed] "${doc.title}" embedding/insert hatası:`, err)
    }
  }

  console.log(`[Seed] Bilgi bankası prompt: ${inserted} yeni, ${skipped} mevcut, ${failed} hata (toplam ${RAG_PROMPT_DOCS.length})`)
}

async function main() {
  console.log('[Seed] Başlıyor...')
  try {
    await seedDefaultAccount()
    await seedKnowledgePrompts()
    console.log('[Seed] Tamamlandı')
  } catch (err) {
    console.error('[Seed] Hata:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
