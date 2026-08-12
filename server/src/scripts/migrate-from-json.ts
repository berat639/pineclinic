/**
 * Mevcut data/*.json dosyalarındaki verileri PostgreSQL'e aktar.
 * Idempotent: aynı script tekrar çalıştırılırsa UUID çakışmalarını atlar (ON CONFLICT DO NOTHING).
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('[Import] DATABASE_URL tanımlı değil')
  process.exit(1)
}

const DATA_DIR = resolve(import.meta.dir, '../../../data')
const sql = postgres(DATABASE_URL, { max: 1 })

function readJson<T>(name: string, fallback: T): T {
  const path = resolve(DATA_DIR, name)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch (err) {
    console.error(`[Import] ${name} okunamadı:`, err)
    return fallback
  }
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string | undefined | null): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

async function importAppointments() {
  type Row = {
    id: string
    createdAt?: string
    customerName: string
    phone: string
    type: string
    vehicleInfo?: string | null
    issueOrRequest?: string | null
    date: string
    time: string
    sessionId?: string | null
    calendarEventId?: string | null
    discountRequested?: boolean
    notes?: string | null
  }
  const list = readJson<Row[]>('appointments.json', [])
  if (list.length === 0) { console.log('[Import] appointments: 0 kayıt'); return }

  let inserted = 0
  for (const a of list) {
    const idValid = isUuid(a.id)
    const result = idValid
      ? await sql`
          INSERT INTO appointments (
            id, created_at, customer_name, phone, type,
            vehicle_info, issue_or_request, date, time,
            session_id, calendar_event_id, discount_requested, notes
          ) VALUES (
            ${a.id},
            ${a.createdAt ? new Date(a.createdAt) : new Date()},
            ${a.customerName}, ${a.phone}, ${a.type},
            ${a.vehicleInfo ?? null}, ${a.issueOrRequest ?? null},
            ${a.date}, ${a.time},
            ${a.sessionId ?? null}, ${a.calendarEventId ?? null},
            ${a.discountRequested ?? false}, ${a.notes ?? null}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `
      : await sql`
          INSERT INTO appointments (
            created_at, customer_name, phone, type,
            vehicle_info, issue_or_request, date, time,
            session_id, calendar_event_id, discount_requested, notes
          ) VALUES (
            ${a.createdAt ? new Date(a.createdAt) : new Date()},
            ${a.customerName}, ${a.phone}, ${a.type},
            ${a.vehicleInfo ?? null}, ${a.issueOrRequest ?? null},
            ${a.date}, ${a.time},
            ${a.sessionId ?? null}, ${a.calendarEventId ?? null},
            ${a.discountRequested ?? false}, ${a.notes ?? null}
          )
          RETURNING id
        `
    if (result.length > 0) inserted++
  }
  console.log(`[Import] appointments: ${inserted}/${list.length} yeni`)
}

async function importKnowledge() {
  type Doc = {
    id: string
    category: string
    title: string
    content: string
    active: boolean
    embedding: number[]
    embeddedAt?: string
    createdAt?: string
    updatedAt?: string
  }
  const store = readJson<{ docs: Doc[] } | Doc[]>('knowledge.json', { docs: [] })
  const docs = Array.isArray(store) ? store : store.docs ?? []
  if (docs.length === 0) { console.log('[Import] knowledge: 0 belge'); return }

  let inserted = 0
  for (const d of docs) {
    const hasEmbedding = Array.isArray(d.embedding) && d.embedding.length > 0
    const embeddedAt = d.embeddedAt ? new Date(d.embeddedAt) : (hasEmbedding ? new Date() : null)
    const createdAt = d.createdAt ? new Date(d.createdAt) : new Date()
    const updatedAt = d.updatedAt ? new Date(d.updatedAt) : new Date()

    const idValid = isUuid(d.id)
    if (hasEmbedding) {
      const params: unknown[] = idValid
        ? [d.id, d.category ?? 'genel', d.title, d.content, d.active !== false, vectorLiteral(d.embedding), embeddedAt, createdAt, updatedAt]
        : [d.category ?? 'genel', d.title, d.content, d.active !== false, vectorLiteral(d.embedding), embeddedAt, createdAt, updatedAt]
      const queryText = idValid
        ? `INSERT INTO knowledge_documents (id, category, title, content, active, embedding, embedded_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`
        : `INSERT INTO knowledge_documents (category, title, content, active, embedding, embedded_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
           RETURNING id`
      const result = await sql.unsafe(queryText, params as any[])
      if (result.length > 0) inserted++
    } else {
      const result = idValid
        ? await sql`
            INSERT INTO knowledge_documents (id, category, title, content, active, embedding, embedded_at, created_at, updated_at)
            VALUES (${d.id}, ${d.category ?? 'genel'}, ${d.title}, ${d.content}, ${d.active !== false}, NULL, ${embeddedAt}, ${createdAt}, ${updatedAt})
            ON CONFLICT (id) DO NOTHING
            RETURNING id
          `
        : await sql`
            INSERT INTO knowledge_documents (category, title, content, active, embedding, embedded_at, created_at, updated_at)
            VALUES (${d.category ?? 'genel'}, ${d.title}, ${d.content}, ${d.active !== false}, NULL, ${embeddedAt}, ${createdAt}, ${updatedAt})
            RETURNING id
          `
      if (result.length > 0) inserted++
    }
  }
  console.log(`[Import] knowledge: ${inserted}/${docs.length} yeni`)
}

async function importRecordings() {
  type Rec = {
    id: string
    filename: string
    startedAt: string
    endedAt: string
    durationMs: number
    sizeBytes: number
    sessionId?: string | null
  }
  const list = readJson<Rec[]>('recordings.json', [])
  if (list.length === 0) { console.log('[Import] recordings: 0 kayıt'); return }

  let inserted = 0
  for (const r of list) {
    // recordings.id JSON tarafında "shortId" (8 chars) — DB UUID gerektiriyor.
    // Yeni UUID üret, filename ile eşleştirme yap.
    const result = await sql`
      INSERT INTO recordings (filename, started_at, ended_at, duration_ms, size_bytes, session_id)
      SELECT ${r.filename}, ${new Date(r.startedAt)}, ${new Date(r.endedAt)}, ${r.durationMs}, ${r.sizeBytes}, ${r.sessionId ?? null}
      WHERE NOT EXISTS (SELECT 1 FROM recordings WHERE filename = ${r.filename})
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  console.log(`[Import] recordings: ${inserted}/${list.length} yeni`)
}

async function importCalendarSettings() {
  type Cal = { refreshToken?: string; email?: string; calendarId?: string }
  const cal = readJson<Cal>('calendar-settings.json', {})
  const entries: Array<[string, string]> = []
  if (cal.refreshToken) entries.push(['calendar.refresh_token', cal.refreshToken])
  if (cal.email) entries.push(['calendar.email', cal.email])
  if (cal.calendarId) entries.push(['calendar.calendar_id', cal.calendarId])

  if (entries.length === 0) { console.log('[Import] calendar settings: yok'); return }

  for (const [key, value] of entries) {
    await sql`
      INSERT INTO business_settings (key, value, updated_at)
      VALUES (${key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `
  }
  console.log(`[Import] calendar settings: ${entries.length} anahtar`)
}

async function importAiSettings() {
  type Ai = { model?: string; updatedAt?: string }
  const ai = readJson<Ai>('ai-settings.json', {})
  if (!ai.model) { console.log('[Import] ai settings: yok'); return }
  await sql`
    INSERT INTO business_settings (key, value, updated_at)
    VALUES ('ai.model', ${ai.model}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
  console.log(`[Import] ai settings: model=${ai.model}`)
}

async function main() {
  console.log('[Import] Başlıyor — data/ → Postgres')
  await importAppointments()
  await importKnowledge()
  await importRecordings()
  await importCalendarSettings()
  await importAiSettings()
  console.log('[Import] Tamamlandı')
  await sql.end()
}

main().catch(err => {
  console.error('[Import] Hata:', err)
  process.exit(1)
})
