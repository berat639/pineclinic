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
    schemaReady = true
  } catch {
    // Non-fatal during early boot
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
    throw new Error('Geçerli bir Gemini API anahtarı girin (boşluksuz, en az 20 karakter).')
  }
  const encrypted = sealSecret(trimmed)
  const last4 = trimmed.slice(-4)
  const now = new Date()

  const [updated] = await db
    .update(clinics)
    .set({
      geminiApiKey: encrypted,
      geminiKeyLast4: last4,
      geminiKeyUpdatedAt: now,
      geminiKeyUpdatedBy: userId,
    })
    .where(eq(clinics.id, clinicId))
    .returning({ id: clinics.id })

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
    message: `Gemini API anahtarı doğrulandı (${latencyMs} ms, kaynak: ${source === 'clinic' ? 'Kliniğe Özel' : 'Ortak Sunucu'}).`,
  }
}

