import { createHash } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { auditLog, clinics } from '../db/schema'
import { currentClinicId } from '../tenancy/context'
import { openSecret, sealSecret } from './integration-secrets'

const CLIENT_CACHE_TTL_MS = 60_000

interface CachedClientEntry {
  keyHash: string
  client: GoogleGenAI
  source: 'clinic' | 'shared'
  expiresAt: number
}

const clientCache = new Map<string, CachedClientEntry>()
let schemaReady = false

export async function ensureClinicGeminiKeyColumns(): Promise<void> {
  if (schemaReady) return
  try {
    await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gemini_api_key TEXT`)
    await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gemini_key_last4 TEXT`)
    await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gemini_key_updated_at TIMESTAMPTZ`)
    await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gemini_key_updated_by UUID REFERENCES users(id)`)
    await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS gemini_key_fingerprint TEXT`)
    schemaReady = true
    await backfillGeminiKeyFingerprints()
    await ensureGeminiKeyUniqueIndex()
  } catch {
    // Non-fatal during early boot
  }
}

export const KEY_IN_USE_MESSAGE = 'Bu anahtar başka bir klinikte kullanılıyor. Her klinik kendine ait ayrı bir anahtar kullanmalıdır.'

/** Anahtarın tam SHA-256 özeti (kimlik karşılaştırması için; anahtarın kendisi değildir). */
export function fingerprintKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex')
}

/** Parmak izi boş kayıtları doldurur. Tek kayıt hata verirse atlanır; asla fırlatmaz. */
export async function backfillGeminiKeyFingerprints(): Promise<void> {
  try {
    const rows = await db.execute<{ id: string; gemini_api_key: string }>(
      sql`SELECT id, gemini_api_key FROM clinics WHERE gemini_api_key IS NOT NULL AND gemini_key_fingerprint IS NULL`,
    )
    for (const row of rows) {
      try {
        const plain = openSecret(row.gemini_api_key).trim()
        if (!plain) continue
        await db.execute(sql`UPDATE clinics SET gemini_key_fingerprint = ${fingerprintKey(plain)} WHERE id = ${row.id}::uuid`)
      } catch {
        // Bu kayıt atlanır.
      }
    }
  } catch {
    // Non-fatal
  }
}

/** Kısmi benzersiz index yalnızca çakışma YOKSA oluşturulur; aksi halde uyarı loglanır. */
export async function ensureGeminiKeyUniqueIndex(): Promise<void> {
  try {
    const dupes = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT gemini_key_fingerprint FROM clinics
        WHERE gemini_key_fingerprint IS NOT NULL
        GROUP BY gemini_key_fingerprint HAVING COUNT(*) > 1
      ) d
    `)
    if (Number(dupes[0]?.n ?? 0) > 0) {
      console.warn('[GeminiClient] Aynı API anahtarı birden fazla klinikte kayıtlı; benzersiz index oluşturulmadı. Çakışan kliniklere yeni anahtar tanımlanmalı.')
      return
    }
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS clinics_gemini_key_fingerprint_uniq
      ON clinics (gemini_key_fingerprint) WHERE gemini_key_fingerprint IS NOT NULL
    `)
  } catch (err) {
    console.warn('[GeminiClient] Benzersiz index oluşturulamadı:', err instanceof Error ? err.message : 'unknown')
  }
}

/** Aynı anahtar başka bir klinikte kayıtlı mı? (Hangi klinik olduğu döndürülmez.) */
export async function isKeyUsedByAnotherClinic(clinicId: string, key: string): Promise<boolean> {
  await ensureClinicGeminiKeyColumns()
  const rows = await db.execute<{ id: string }>(sql`
    SELECT id FROM clinics
    WHERE gemini_key_fingerprint = ${fingerprintKey(key)} AND id <> ${clinicId}::uuid
    LIMIT 1
  `)
  return rows.length > 0
}

/** Bu klinik, başka bir klinikle aynı anahtarı paylaşıyor mu? */
async function clinicKeyConflicts(clinicId: string): Promise<boolean> {
  try {
    const rows = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n FROM clinics c
      WHERE c.gemini_key_fingerprint IS NOT NULL
        AND c.gemini_key_fingerprint = (SELECT gemini_key_fingerprint FROM clinics WHERE id = ${clinicId}::uuid)
        AND c.id <> ${clinicId}::uuid
    `)
    return Number(rows[0]?.n ?? 0) > 0
  } catch {
    return false
  }
}

export function invalidateGeminiClientCache(clinicId?: string): void {
  if (!clinicId) {
    clientCache.clear()
    return
  }
  clientCache.delete(clinicId)
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

export async function resolveClinicGeminiKey(clinicId?: string): Promise<{
  apiKey: string
  source: 'clinic' | 'shared'
}> {
  const effectiveClinicId = clinicId ?? currentClinicId()
  if (effectiveClinicId) {
    try {
      await ensureClinicGeminiKeyColumns()
      const [row] = await db
        .select({ geminiApiKey: clinics.geminiApiKey })
        .from(clinics)
        .where(eq(clinics.id, effectiveClinicId))
        .limit(1)
      if (row?.geminiApiKey) {
        const decrypted = openSecret(row.geminiApiKey).trim()
        if (decrypted) {
          return { apiKey: decrypted, source: 'clinic' }
        }
      }
    } catch (err) {
      console.warn(`[GeminiClient] Klinik anahtarı çözümlenemedi (${effectiveClinicId}), ortak anahtara dönülüyor:`, err instanceof Error ? err.message : 'unknown')
    }
  }

  const shared = process.env.GEMINI_API_KEY?.trim()
  if (!shared) {
    throw new Error('GEMINI_API_KEY tanımlı değil (ne klinik anahtarı ne de sunucu ortam değişkeni bulundu).')
  }
  return { apiKey: shared, source: 'shared' }
}

export async function getGeminiClient(clinicId?: string): Promise<GoogleGenAI> {
  const effectiveClinicId = clinicId ?? currentClinicId() ?? '__shared__'
  const now = Date.now()
  const cached = clientCache.get(effectiveClinicId)

  const resolved = await resolveClinicGeminiKey(effectiveClinicId === '__shared__' ? undefined : effectiveClinicId)
  const keyHash = hashKey(resolved.apiKey)

  if (cached && cached.keyHash === keyHash && cached.expiresAt > now) {
    return cached.client
  }

  const client = new GoogleGenAI({ apiKey: resolved.apiKey })
  clientCache.set(effectiveClinicId, {
    keyHash,
    client,
    source: resolved.source,
    expiresAt: now + CLIENT_CACHE_TTL_MS,
  })
  return client
}

export async function resolveClinicGeminiKeyInfo(clinicId?: string): Promise<{
  configured: boolean
  source: 'clinic' | 'shared' | 'missing'
  last4: string | null
  updatedAt: string | null
  conflict?: boolean
}> {
  const effectiveClinicId = clinicId ?? currentClinicId()
  await ensureClinicGeminiKeyColumns()
  if (effectiveClinicId) {
    const [row] = await db
      .select({
        geminiApiKey: clinics.geminiApiKey,
        geminiKeyLast4: clinics.geminiKeyLast4,
        geminiKeyUpdatedAt: clinics.geminiKeyUpdatedAt,
      })
      .from(clinics)
      .where(eq(clinics.id, effectiveClinicId))
      .limit(1)
    if (row?.geminiApiKey) {
      return {
        configured: true,
        source: 'clinic',
        last4: row.geminiKeyLast4 || '••••',
        updatedAt: row.geminiKeyUpdatedAt?.toISOString() ?? null,
        conflict: await clinicKeyConflicts(effectiveClinicId),
      }
    }
  }
  const hasShared = Boolean(process.env.GEMINI_API_KEY?.trim())
  return {
    configured: false,
    source: hasShared ? 'shared' : 'missing',
    last4: null,
    updatedAt: null,
  }
}

export async function setClinicGeminiKey(clinicId: string, rawKey: string, userId: string, ipAddress?: string | null) {
  await ensureClinicGeminiKeyColumns()
  const trimmed = rawKey.trim()
  if (trimmed.length < 20 || trimmed.length > 256 || /\s/.test(trimmed)) {
    throw new Error('Geçerli bir API anahtarı girin (boşluksuz, en az 20 karakter).')
  }
  if (await isKeyUsedByAnotherClinic(clinicId, trimmed)) throw new Error(KEY_IN_USE_MESSAGE)
  const encrypted = sealSecret(trimmed)
  const last4 = trimmed.slice(-4)
  const now = new Date()

  let updated: { id: string } | undefined
  try {
    ;[updated] = await db
    .update(clinics)
    .set({
      geminiApiKey: encrypted,
      geminiKeyLast4: last4,
      geminiKeyUpdatedAt: now,
      geminiKeyUpdatedBy: userId,
    })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id })
    await db.execute(sql`UPDATE clinics SET gemini_key_fingerprint = ${fingerprintKey(trimmed)} WHERE id = ${clinicId}::uuid`)
  } catch (err) {
    if (err instanceof Error && /clinics_gemini_key_fingerprint_uniq|duplicate key/i.test(err.message)) throw new Error(KEY_IN_USE_MESSAGE)
    throw err
  }

  if (!updated) throw new Error('Klinik bulunamadı.')
  invalidateGeminiClientCache(clinicId)

  await db.insert(auditLog).values({
    clinicId,
    userId,
    action: 'platform.clinic.gemini_key.set',
    targetType: 'clinic',
    targetId: clinicId,
    metadata: { last4 },
    ipAddress: ipAddress || null,
  }).catch(() => {})

  return resolveClinicGeminiKeyInfo(clinicId)
}

export async function deleteClinicGeminiKey(clinicId: string, userId: string, ipAddress?: string | null) {
  await ensureClinicGeminiKeyColumns()
  const [updated] = await db
    .update(clinics)
    .set({
      geminiApiKey: null,
      geminiKeyLast4: null,
      geminiKeyUpdatedAt: new Date(),
      geminiKeyUpdatedBy: userId,
    })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id })
  await db.execute(sql`UPDATE clinics SET gemini_key_fingerprint = NULL WHERE id = ${clinicId}::uuid`)

  if (!updated) throw new Error('Klinik bulunamadı.')
  invalidateGeminiClientCache(clinicId)

  await db.insert(auditLog).values({
    clinicId,
    userId,
    action: 'platform.clinic.gemini_key.delete',
    targetType: 'clinic',
    targetId: clinicId,
    metadata: {},
    ipAddress: ipAddress || null,
  }).catch(() => {})

  return resolveClinicGeminiKeyInfo(clinicId)
}

export async function testClinicGeminiKey(clinicId: string, candidateKey?: string) {
  const startedAt = Date.now()
  let apiKey: string
  let source: 'clinic' | 'shared' = 'clinic'
  if (candidateKey?.trim()) {
    apiKey = candidateKey.trim()
    if (await isKeyUsedByAnotherClinic(clinicId, apiKey)) throw new Error(KEY_IN_USE_MESSAGE)
  } else {
    const resolved = await resolveClinicGeminiKey(clinicId)
    apiKey = resolved.apiKey
    source = resolved.source
  }

  const client = new GoogleGenAI({ apiKey })
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
  await client.models.embedContent({
    model: embeddingModel,
    contents: 'merhaba',
    config: { outputDimensionality: 768 },
  })
  const latencyMs = Date.now() - startedAt
  return {
    ok: true,
    latencyMs,
    source,
    message: `API anahtarı doğrulandı (${latencyMs} ms, kaynak: ${source === 'clinic' ? 'Kliniğe Özel' : 'Ortak Sunucu'}).`,
  }
}

