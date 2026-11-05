import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { clinics, patients, whatsappConversations, whatsappMessages } from '../schema'
import { openSecret, sealSecret } from '../../services/integration-secrets'
import {
  detectOptOut,
  evolutionRequest,
  EvolutionError,
  EvolutionTransport,
  N8nMetaTransport,
  normalizePhone,
  phonesMatch,
  validateEvolutionUrl,
  validateN8nWebhookUrl,
  type IncomingWhatsAppMessage,
  type WhatsAppCredentials,
  type WhatsAppProviderType,
  type WhatsAppTemplateDefinition,
  type WhatsAppTransport,
} from '../../integrations/whatsapp'

export type Clinic = typeof clinics.$inferSelect
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function getWhatsAppClinic(id: string): Promise<Clinic> {
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, id))
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}
function automaticEvolutionConfig(clinic: Clinic): WhatsAppCredentials | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  return { baseUrl: validateEvolutionUrl(baseUrl), apiKey, instanceName: clinic.evolutionInstanceName || `voiceai-${clinic.id}` }
}
export function credentialsFor(clinic: Clinic): WhatsAppCredentials {
  if (clinic.evolutionBaseUrl && clinic.evolutionApiKey) {
    return {
      baseUrl: clinic.evolutionBaseUrl,
      apiKey: openSecret(clinic.evolutionApiKey),
      instanceName: clinic.evolutionInstanceName || `voiceai-${clinic.id}`,
    }
  }
  const automatic = automaticEvolutionConfig(clinic)
  if (automatic) return automatic
  throw new Error('Evolution API sunucu adresi veya API anahtarı henüz tanımlanmamış. Lütfen Sunucu Bağlantı Ayarları bölümünden Evolution bilgilerini girin.')
}
export function normalizeWhatsAppTemplates(raw: unknown): WhatsAppTemplateDefinition[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: any): WhatsAppTemplateDefinition[] => {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const language = typeof item?.language === 'string' && item.language.trim() ? item.language.trim() : 'tr'
    if (!name || !/^[a-z0-9_]{1,120}$/i.test(name)) return []
    const category = typeof item?.category === 'string' ? item.category.trim() : 'general'
    const bodyPreview = typeof item?.bodyPreview === 'string' ? item.bodyPreview.slice(0, 1000) : undefined
    const paramKeys = Array.isArray(item?.paramKeys)
      ? item.paramKeys.filter((k: unknown): k is string => typeof k === 'string' && Boolean(k.trim())).map((k: string) => k.trim())
      : undefined
    return [{ name, language, category, bodyPreview, paramKeys }]
  })
}

export function resolveActiveWhatsAppInstanceName(clinic: Clinic, providerOverride?: WhatsAppProviderType): string | null {
  const provider = providerOverride ?? (clinic.whatsappProvider === 'n8n_meta' ? 'n8n_meta' : 'evolution')
  if (provider === 'n8n_meta') return 'n8n_meta'
  return clinic.evolutionInstanceName
}

export const DEFAULT_N8N_SEND_WEBHOOK_URL =
  process.env.N8N_SEND_WEBHOOK_URL?.trim() || 'http://voiceai-n8n:5678/webhook/voiceai-whatsapp-send'

export function transportForClinic(clinic: Clinic): WhatsAppTransport {
  if (clinic.whatsappProvider === 'n8n_meta') {
    const sendWebhookUrl = clinic.n8nSendWebhookUrl || DEFAULT_N8N_SEND_WEBHOOK_URL
    const secret = clinic.n8nInboundSecret ? openSecret(clinic.n8nInboundSecret) : 'voiceai-default-secret'
    let accessToken: string | null = null
    if (clinic.metaAccessToken) {
      try { accessToken = openSecret(clinic.metaAccessToken) } catch {}
    }
    return new N8nMetaTransport({
      clinicId: clinic.id,
      sendWebhookUrl,
      secret,
      phoneNumberId: clinic.metaPhoneNumberId,
      wabaId: clinic.metaWabaId,
      accessToken,
    })
  }
  return new EvolutionTransport(credentialsFor(clinic))
}

export function publicWhatsAppConfig(clinic: Clinic) {
  const provider: WhatsAppProviderType = clinic.whatsappProvider === 'n8n_meta' ? 'n8n_meta' : 'evolution'
  const automatic = automaticEvolutionConfig(clinic)
  const configured = Boolean((clinic.evolutionBaseUrl && clinic.evolutionApiKey) || automatic)
  return {
    clinicId: clinic.id, clinicName: clinic.name,
    provider,
    configured,
    baseUrl: clinic.evolutionBaseUrl || automatic?.baseUrl || process.env.EVOLUTION_API_URL?.trim() || '',
    instanceName: clinic.evolutionInstanceName || automatic?.instanceName || `voiceai-${clinic.id}`,
    hasApiKey: Boolean(clinic.evolutionApiKey || automatic?.apiKey),
    enabled: clinic.whatsappEnabled, aiEnabled: clinic.whatsappAiEnabled,
    connectionState: provider === 'n8n_meta'
      ? ((clinic.n8nSendWebhookUrl || DEFAULT_N8N_SEND_WEBHOOK_URL) && clinic.n8nInboundSecret ? 'open' : 'unconfigured')
      : clinic.evolutionConnectionState,
    setupStatus: clinic.whatsappSetupStatus,
    expectedPhone: clinic.whatsappExpectedPhone,
    linkedPhone: clinic.whatsappLinkedPhone,
    numberVerifiedAt: clinic.whatsappNumberVerifiedAt?.toISOString() || null,
    testPhone: clinic.whatsappTestPhone,
    testVerifiedAt: clinic.whatsappTestVerifiedAt?.toISOString() || null,
    activatedAt: clinic.whatsappActivatedAt?.toISOString() || null,
    n8nConfigured: Boolean((clinic.n8nSendWebhookUrl || DEFAULT_N8N_SEND_WEBHOOK_URL) && clinic.n8nInboundSecret),
    metaPhoneNumberId: clinic.metaPhoneNumberId || null,
    metaWabaId: clinic.metaWabaId || null,
  }
}

export function publicN8nWhatsAppConfig(clinic: Clinic, revealedInboundSecret?: string | null) {
  let inboundSecretPreview: string | null = null
  let plainSecret: string | null = revealedInboundSecret || null
  if (clinic.n8nInboundSecret) {
    try {
      const plain = openSecret(clinic.n8nInboundSecret)
      inboundSecretPreview = `${plain.slice(0, 6)}...${plain.slice(-4)}`
      if (!plainSecret) plainSecret = plain
    } catch {
      inboundSecretPreview = '••••'
    }
  }
  let metaAccessTokenPreview: string | null = null
  if (clinic.metaAccessToken) {
    try {
      const plainToken = openSecret(clinic.metaAccessToken)
      metaAccessTokenPreview = plainToken.length > 10
        ? `${plainToken.slice(0, 4)}••••${plainToken.slice(-4)}`
        : '••••'
    } catch {
      metaAccessTokenPreview = '••••'
    }
  }
  const verifyToken = clinic.metaVerifyToken || `pine_verify_${clinic.id.replace(/-/g, '').slice(0, 12)}`
  return {
    clinicId: clinic.id,
    clinicName: clinic.name,
    provider: (clinic.whatsappProvider === 'n8n_meta' ? 'n8n_meta' : 'evolution') as WhatsAppProviderType,
    enabled: clinic.whatsappEnabled,
    aiEnabled: clinic.whatsappAiEnabled,
    n8nSendWebhookUrl: clinic.n8nSendWebhookUrl || DEFAULT_N8N_SEND_WEBHOOK_URL,
    metaPhoneNumberId: clinic.metaPhoneNumberId || '',
    metaWabaId: clinic.metaWabaId || '',
    hasMetaAccessToken: Boolean(clinic.metaAccessToken),
    metaAccessTokenPreview,
    metaVerifyToken: verifyToken,
    businessPhone: clinic.whatsappExpectedPhone || '',
    n8nWebhookPath: `/api/whatsapp/n8n-webhook/${clinic.id}`,
    inboundWebhookPath: `/api/whatsapp/n8n/${clinic.id}/inbound`,
    statusWebhookPath: `/api/whatsapp/n8n/${clinic.id}/status`,
    hasInboundSecret: Boolean(clinic.n8nInboundSecret),
    inboundSecretPreview,
    revealedInboundSecret: plainSecret,
    templates: normalizeWhatsAppTemplates(clinic.whatsappTemplates),
  }
}

export async function getOrInitN8nWhatsAppConfig(id: string) {
  await ensureWhatsAppSetupSchema()
  const clinic = await getWhatsAppClinic(id)
  const defaultVerifyToken = `pine_verify_${id.replace(/-/g, '').slice(0, 12)}`
  if (!clinic.n8nInboundSecret || !clinic.metaVerifyToken || !clinic.n8nSendWebhookUrl) {
    const plain = clinic.n8nInboundSecret ? null : randomBytes(32).toString('hex')
    const [updated] = await db.update(clinics).set({
      ...(plain ? { n8nInboundSecret: sealSecret(plain) } : {}),
      ...(!clinic.metaVerifyToken ? { metaVerifyToken: defaultVerifyToken } : {}),
      ...(!clinic.n8nSendWebhookUrl ? { n8nSendWebhookUrl: DEFAULT_N8N_SEND_WEBHOOK_URL } : {}),
    }).where(eq(clinics.id, id)).returning()
    return publicN8nWhatsAppConfig(updated, plain)
  }
  return publicN8nWhatsAppConfig(clinic, null)
}

export async function saveN8nWhatsAppConfig(
  id: string,
  input: {
    provider?: WhatsAppProviderType
    n8nSendWebhookUrl?: string
    metaPhoneNumberId?: string
    metaWabaId?: string
    metaAccessToken?: string
    clearMetaAccessToken?: boolean
    metaVerifyToken?: string
    businessPhone?: string
    enabled?: boolean
    aiEnabled?: boolean
    rotateSecret?: boolean
    templates?: WhatsAppTemplateDefinition[]
  },
) {
  await ensureWhatsAppSetupSchema()
  const clinic = await getWhatsAppClinic(id)
  const provider: WhatsAppProviderType = input.provider ?? (clinic.whatsappProvider === 'n8n_meta' ? 'n8n_meta' : 'evolution')
  const sendUrlRaw = input.n8nSendWebhookUrl !== undefined
    ? (input.n8nSendWebhookUrl.trim() || DEFAULT_N8N_SEND_WEBHOOK_URL)
    : (clinic.n8nSendWebhookUrl || DEFAULT_N8N_SEND_WEBHOOK_URL)
  const sendWebhookUrl = sendUrlRaw ? validateN8nWebhookUrl(sendUrlRaw) : DEFAULT_N8N_SEND_WEBHOOK_URL
  const metaPhoneNumberId = input.metaPhoneNumberId !== undefined
    ? (input.metaPhoneNumberId.trim() || null)
    : clinic.metaPhoneNumberId
  const metaWabaId = input.metaWabaId !== undefined
    ? (input.metaWabaId.trim() || null)
    : clinic.metaWabaId
  const metaVerifyToken = input.metaVerifyToken !== undefined
    ? (input.metaVerifyToken.trim() || `pine_verify_${id.replace(/-/g, '').slice(0, 12)}`)
    : (clinic.metaVerifyToken || `pine_verify_${id.replace(/-/g, '').slice(0, 12)}`)

  let metaAccessTokenCipher = clinic.metaAccessToken
  if (input.clearMetaAccessToken) {
    metaAccessTokenCipher = null
  } else if (input.metaAccessToken !== undefined && input.metaAccessToken.trim()) {
    metaAccessTokenCipher = sealSecret(input.metaAccessToken.trim())
  }

  let expectedPhone = clinic.whatsappExpectedPhone
  if (input.businessPhone !== undefined) {
    expectedPhone = input.businessPhone.trim() ? normalizePhone(input.businessPhone.trim()) : null
  }

  let revealedSecret: string | null = null
  let secretCipher = clinic.n8nInboundSecret
  if (!secretCipher || input.rotateSecret) {
    revealedSecret = randomBytes(32).toString('hex')
    secretCipher = sealSecret(revealedSecret)
  }

  const nextEnabled = input.enabled !== undefined ? input.enabled : clinic.whatsappEnabled
  const nextAiEnabled = input.aiEnabled !== undefined ? input.aiEnabled : clinic.whatsappAiEnabled

  if (provider === 'n8n_meta' && (nextEnabled || nextAiEnabled) && !sendWebhookUrl) {
    throw new Error('n8n Meta WhatsApp gönderimlerini açmak için n8n gönderim webhook adresini girin.')
  }

  const templates = input.templates !== undefined
    ? normalizeWhatsAppTemplates(input.templates)
    : normalizeWhatsAppTemplates(clinic.whatsappTemplates)

  const [updated] = await db.update(clinics).set({
    whatsappProvider: provider,
    n8nSendWebhookUrl: sendWebhookUrl,
    metaPhoneNumberId,
    metaWabaId,
    metaAccessToken: metaAccessTokenCipher,
    metaVerifyToken,
    whatsappExpectedPhone: expectedPhone,
    n8nInboundSecret: secretCipher,
    whatsappTemplates: templates,
    whatsappEnabled: nextEnabled,
    whatsappAiEnabled: nextEnabled && nextAiEnabled,
  }).where(eq(clinics.id, id)).returning()

  return publicN8nWhatsAppConfig(updated, revealedSecret)
}
export async function saveWhatsAppConfig(
  id: string,
  input: {
    baseUrl?: string
    instanceName?: string
    apiKey?: string
    expectedPhone?: string
    enabled?: boolean
    aiEnabled?: boolean
  },
) {
  await ensureWhatsAppSetupSchema()
  const clinic = await ensureAutomaticEvolutionConfig(id)
  const automatic = automaticEvolutionConfig(clinic)
  const rawBaseUrl = input.baseUrl?.trim() || clinic.evolutionBaseUrl || automatic?.baseUrl || process.env.EVOLUTION_API_URL?.trim() || ''
  if (!rawBaseUrl) throw new Error('Evolution sunucu adresini (Base URL) girin.')
  const baseUrl = validateEvolutionUrl(rawBaseUrl)
  const instanceName = (input.instanceName?.trim() || clinic.evolutionInstanceName || automatic?.instanceName || `voiceai-${clinic.id}`).trim()
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instanceName)) throw new Error('Bağlantı adı 1–80 harf, rakam, tire veya alt çizgi içermeli.')
  const identityChanged = clinic.evolutionBaseUrl !== baseUrl || clinic.evolutionInstanceName !== instanceName
  if (identityChanged && clinic.evolutionInstanceName) {
    const [active] = await db.select({ id: whatsappMessages.id }).from(whatsappMessages)
      .innerJoin(whatsappConversations, eq(whatsappMessages.conversationId, whatsappConversations.id))
      .where(and(eq(whatsappConversations.clinicId, id), sql`${whatsappMessages.status} IN ('pending','processing','reply_ready','sending','uncertain')`)).limit(1)
    if (active) throw new Error('Bağlantıyı değiştirmeden önce bekleyen gönderimleri sonuçlandırın.')
  }
  const apiKey = input.apiKey?.trim()
    ? sealSecret(input.apiKey.trim())
    : clinic.evolutionApiKey || (automatic ? sealSecret(automatic.apiKey) : null)
  if (!apiKey) throw new Error('Evolution API anahtarını girin.')
  const expectedPhone = input.expectedPhone !== undefined
    ? (input.expectedPhone.trim() ? normalizePhone(input.expectedPhone.trim()) : null)
    : clinic.whatsappExpectedPhone
  const nextEnabled = input.enabled !== undefined ? input.enabled : clinic.whatsappEnabled
  const nextAiEnabled = input.aiEnabled !== undefined ? input.aiEnabled : clinic.whatsappAiEnabled
  const [updated] = await db.update(clinics).set({
    evolutionBaseUrl: baseUrl,
    evolutionInstanceName: instanceName,
    evolutionApiKey: apiKey,
    evolutionWebhookSecret: identityChanged || !clinic.evolutionWebhookSecret ? sealSecret(randomBytes(32).toString('hex')) : clinic.evolutionWebhookSecret,
    evolutionConnectionState: identityChanged ? 'unconfigured' : clinic.evolutionConnectionState,
    whatsappExpectedPhone: expectedPhone,
    whatsappSetupStatus: expectedPhone && clinic.whatsappSetupStatus === 'not_started' ? 'ready' : clinic.whatsappSetupStatus,
    whatsappEnabled: nextEnabled,
    whatsappAiEnabled: nextAiEnabled,
  }).where(eq(clinics.id, id)).returning()
  return publicWhatsAppConfig(updated)
}

/** Fill missing tenant settings from the shared Evolution configuration or existing clinics. */
export async function ensureAutomaticEvolutionConfig(id: string): Promise<Clinic> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`evolution:${id}`}, 0))`)
    const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, id))
    if (!clinic) throw new Error('Klinik bulunamadı.')
    if (clinic.evolutionBaseUrl && clinic.evolutionApiKey && clinic.evolutionInstanceName && clinic.evolutionWebhookSecret) return clinic

    const automatic = automaticEvolutionConfig(clinic)
    let donorBaseUrl: string | null = null
    let donorApiKey: string | null = null
    if (!clinic.evolutionBaseUrl || !clinic.evolutionApiKey) {
      const [donor] = await tx.select({
        evolutionBaseUrl: clinics.evolutionBaseUrl,
        evolutionApiKey: clinics.evolutionApiKey,
      }).from(clinics).where(sql`${clinics.evolutionBaseUrl} IS NOT NULL AND ${clinics.evolutionApiKey} IS NOT NULL`).limit(1)
      donorBaseUrl = donor?.evolutionBaseUrl || null
      donorApiKey = donor?.evolutionApiKey || null
    }

    const envUrlRaw = process.env.EVOLUTION_API_URL?.trim()
    let envBaseUrl: string | null = null
    if (envUrlRaw) {
      try { envBaseUrl = validateEvolutionUrl(envUrlRaw) } catch {}
    }

    const nextBaseUrl = clinic.evolutionBaseUrl || automatic?.baseUrl || donorBaseUrl || envBaseUrl || null
    const nextApiKey = clinic.evolutionApiKey || (automatic?.apiKey ? sealSecret(automatic.apiKey) : null) || donorApiKey || null
    const nextInstanceName = clinic.evolutionInstanceName || automatic?.instanceName || `voiceai-${clinic.id}`
    const nextWebhookSecret = clinic.evolutionWebhookSecret || sealSecret(randomBytes(32).toString('hex'))

    const [updated] = await tx.update(clinics).set({
      evolutionBaseUrl: nextBaseUrl,
      evolutionApiKey: nextApiKey,
      evolutionInstanceName: nextInstanceName,
      evolutionWebhookSecret: nextWebhookSecret,
    }).where(eq(clinics.id, id)).returning()
    return updated
  })
}

/** Saves operator-supplied numbers; provider credentials remain platform-owned. */
export async function configureWhatsAppSetup(id: string, input: { expectedPhone: string }) {
  const expectedPhone = normalizePhone(input.expectedPhone)
  const [clinic] = await db.update(clinics).set({
    whatsappExpectedPhone: expectedPhone,
    whatsappLinkedPhone: null,
    whatsappNumberVerifiedAt: null,
    whatsappTestPhone: null,
    whatsappSetupStatus: 'ready',
    whatsappEnabled: false,
    whatsappAiEnabled: false,
    whatsappTestCodeHash: null,
    whatsappTestExpiresAt: null,
    whatsappTestVerifiedAt: null,
    whatsappActivatedAt: null,
    whatsappActivatedBy: null,
  }).where(eq(clinics.id, id)).returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return publicWhatsAppConfig(clinic)
}

type EvolutionInstanceInfo = {
  name?: string
  instanceName?: string
  number?: string | number | null
  ownerJid?: string | null
  owner?: string | null
  wuid?: string | null
  instance?: {
    name?: string
    instanceName?: string
    number?: string | number | null
    ownerJid?: string | null
    owner?: string | null
    wuid?: string | null
  }
}

function linkedWhatsAppPhone(entry: EvolutionInstanceInfo | undefined): string | null {
  if (!entry) return null
  const inst = entry.instance ?? entry
  const rawCandidate =
    inst.number ??
    entry.number ??
    inst.ownerJid ??
    entry.ownerJid ??
    inst.owner ??
    entry.owner ??
    inst.wuid ??
    entry.wuid
  if (rawCandidate === undefined || rawCandidate === null) return null
  const cleaned = String(rawCandidate).split('@')[0].split(':')[0].trim()
  if (!cleaned) return null
  try { return normalizePhone(cleaned) } catch { return null }
}

async function resolveLinkedWhatsAppPhone(creds: WhatsAppCredentials): Promise<string | null> {
  try {
    const data = await evolutionRequest<unknown>(creds,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(creds.instanceName)}`)
    const list: EvolutionInstanceInfo[] = Array.isArray(data)
      ? (data as EvolutionInstanceInfo[])
      : Array.isArray((data as any)?.instances)
        ? ((data as any).instances as EvolutionInstanceInfo[])
        : data && typeof data === 'object'
          ? [data as EvolutionInstanceInfo]
          : []
    const matched = list.find(item => {
      const inst = item?.instance ?? item
      return (inst?.name || inst?.instanceName || item?.name || item?.instanceName) === creds.instanceName
    }) ?? list[0]
    return linkedWhatsAppPhone(matched)
  } catch {
    return null
  }
}

/** Reads provider state only. It never creates an instance or rewrites its webhook. */
export async function refreshWhatsAppConnection(id: string) {
  await ensureWhatsAppSetupSchema()
  const clinic = await ensureAutomaticEvolutionConfig(id)
  let creds: WhatsAppCredentials
  try {
    creds = credentialsFor(clinic)
  } catch {
    return publicWhatsAppConfig(clinic)
  }
  let connectionState = 'unconfigured'
  try {
    const state = await evolutionRequest<{ instance?: { state?: string; status?: string }; state?: string }>(creds,
      `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`)
    connectionState = state.instance?.state || state.instance?.status || state.state || 'unknown'
  } catch (error) {
    if (!(error instanceof EvolutionError) || ![400, 404].includes(error.status)) throw error
  }
  let linkedPhone: string | null = clinic.whatsappLinkedPhone
  let setupStatus = clinic.whatsappSetupStatus
  let numberVerifiedAt = clinic.whatsappNumberVerifiedAt
  let whatsappEnabled = clinic.whatsappEnabled
  let whatsappAiEnabled = clinic.whatsappAiEnabled
  let adoptedExpectedPhone: string | null = clinic.whatsappExpectedPhone
  if (connectionState === 'open') {
    const resolvedPhone = await resolveLinkedWhatsAppPhone(creds)
    linkedPhone = resolvedPhone || clinic.whatsappLinkedPhone || clinic.whatsappExpectedPhone || null
    if (!adoptedExpectedPhone && linkedPhone) {
      adoptedExpectedPhone = linkedPhone
    }
    const expectedPhone = adoptedExpectedPhone || linkedPhone
    if (linkedPhone && expectedPhone && !phonesMatch(linkedPhone, expectedPhone)) {
      setupStatus = 'phone_mismatch'
      numberVerifiedAt = null
      whatsappEnabled = false
      whatsappAiEnabled = false
    } else {
      numberVerifiedAt = clinic.whatsappNumberVerifiedAt || new Date()
      if (['not_started', 'ready', 'phone_verifying', 'phone_mismatch', 'test_pending', 'test_verified'].includes(setupStatus)) {
        setupStatus = 'phone_verified'
      }
    }
  }
  const [updated] = await db.update(clinics).set({
    evolutionConnectionState: connectionState,
    whatsappLinkedPhone: linkedPhone,
    whatsappExpectedPhone: adoptedExpectedPhone,
    whatsappSetupStatus: setupStatus,
    whatsappNumberVerifiedAt: numberVerifiedAt,
    whatsappEnabled,
    whatsappAiEnabled,
  })
    .where(eq(clinics.id, clinic.id)).returning()
  return publicWhatsAppConfig(updated)
}

export async function activateWhatsApp(id: string, userId: string) {
  await refreshWhatsAppConnection(id).catch(() => {})
  const clinic = await getWhatsAppClinic(id)
  if (clinic.evolutionConnectionState !== 'open') throw new Error('WhatsApp bağlantısı açık değil.')
  if (clinic.whatsappExpectedPhone && clinic.whatsappLinkedPhone && !phonesMatch(clinic.whatsappLinkedPhone, clinic.whatsappExpectedPhone)) {
    throw new Error('Gönderimleri açmak için QR ile bağlanan klinik telefonunu doğrulayın.')
  }
  const verifiedPhone = clinic.whatsappLinkedPhone || clinic.whatsappExpectedPhone
  const [updated] = await db.update(clinics).set({
    whatsappSetupStatus: 'active',
    whatsappEnabled: true,
    whatsappAiEnabled: clinic.whatsappAiEnabled,
    whatsappExpectedPhone: clinic.whatsappExpectedPhone || verifiedPhone,
    whatsappLinkedPhone: verifiedPhone,
    whatsappNumberVerifiedAt: clinic.whatsappNumberVerifiedAt || new Date(),
    whatsappActivatedAt: new Date(),
    whatsappActivatedBy: userId,
  }).where(eq(clinics.id, id)).returning()
  return publicWhatsAppConfig(updated)
}

/** Updates clinic-controlled delivery preferences without exposing provider credentials. */
export async function updateWhatsAppPreferences(id: string, input: { enabled: boolean; aiEnabled: boolean }) {
  const state = await refreshWhatsAppConnection(id)
  const clinic = await getWhatsAppClinic(id)
  if ((input.enabled || input.aiEnabled) && state.connectionState !== 'open') {
    throw new Error('Bu ayarları açmak için aktif bir WhatsApp bağlantısı gerekli.')
  }
  if (
    (input.enabled || input.aiEnabled) &&
    clinic.whatsappExpectedPhone &&
    clinic.whatsappLinkedPhone &&
    !phonesMatch(clinic.whatsappLinkedPhone, clinic.whatsappExpectedPhone)
  ) {
    throw new Error('Bağlı WhatsApp numarası klinik için tanımlanan numarayla eşleşmiyor.')
  }
  const nextEnabled = Boolean(input.enabled || input.aiEnabled)
  const nextAiEnabled = Boolean(nextEnabled && input.aiEnabled)

  if (nextEnabled && clinic.whatsappProvider !== 'n8n_meta') {
    await ensureEvolutionInstance(id).catch(() => {})
  }

  if (nextAiEnabled) {
    // Ensure any previously auto-paused conversations are unpaused when AI auto-replies are enabled.
    await db.update(whatsappConversations)
      .set({ aiPaused: false, updatedAt: new Date() })
      .where(eq(whatsappConversations.clinicId, id))
      .catch(() => {})
  }

  const verifiedPhone = clinic.whatsappLinkedPhone || clinic.whatsappExpectedPhone
  const [updated] = await db.update(clinics).set({
    whatsappEnabled: nextEnabled,
    whatsappAiEnabled: nextAiEnabled,
    whatsappSetupStatus: nextEnabled ? 'active' : clinic.whatsappSetupStatus,
    whatsappNumberVerifiedAt: clinic.whatsappNumberVerifiedAt || (state.connectionState === 'open' ? new Date() : null),
    whatsappExpectedPhone: clinic.whatsappExpectedPhone || verifiedPhone,
    whatsappLinkedPhone: verifiedPhone,
  }).where(eq(clinics.id, id)).returning()
  return publicWhatsAppConfig(updated)
}

/** Logs out the linked device but retains the clinic instance for a later QR reconnect. */
export async function disconnectWhatsApp(id: string) {
  const clinic = await ensureAutomaticEvolutionConfig(id)
  const creds = credentialsFor(clinic)
  try { await evolutionRequest(creds, `/instance/logout/${encodeURIComponent(creds.instanceName)}`, undefined, 'DELETE') }
  catch (error) { if (!(error instanceof EvolutionError) || error.status !== 404) throw error }
  const [updated] = await db.update(clinics).set({
    evolutionConnectionState: 'close', whatsappSetupStatus: 'ready', whatsappLinkedPhone: null,
    whatsappNumberVerifiedAt: null, whatsappEnabled: false, whatsappAiEnabled: false,
  }).where(eq(clinics.id, id)).returning()
  return publicWhatsAppConfig(updated)
}

/** Clears the clinic's WhatsApp phone number and disconnects any active Evolution session. */
export async function clearWhatsAppSetup(id: string) {
  try {
    const clinic = await ensureAutomaticEvolutionConfig(id)
    const creds = credentialsFor(clinic)
    await evolutionRequest(creds, `/instance/logout/${encodeURIComponent(creds.instanceName)}`, undefined, 'DELETE')
  } catch {}
  const [updated] = await db.update(clinics).set({
    evolutionConnectionState: 'close',
    whatsappSetupStatus: 'not_started',
    whatsappExpectedPhone: null,
    whatsappLinkedPhone: null,
    whatsappNumberVerifiedAt: null,
    whatsappTestPhone: null,
    whatsappTestCodeHash: null,
    whatsappTestExpiresAt: null,
    whatsappTestVerifiedAt: null,
    whatsappEnabled: false,
    whatsappAiEnabled: false,
    whatsappActivatedAt: null,
    whatsappActivatedBy: null,
  }).where(eq(clinics.id, id)).returning()
  if (!updated) throw new Error('Klinik bulunamadı.')
  return publicWhatsAppConfig(updated)
}

/** Keeps a delayed migration from turning a WhatsApp setup request into a 500. */
export async function ensureWhatsAppSetupSchema() {
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_setup_status text NOT NULL DEFAULT 'not_started'`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_expected_phone text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_linked_phone text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_number_verified_at timestamptz`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_test_phone text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_test_code_hash text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_test_expires_at timestamptz`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_test_verified_at timestamptz`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_activated_at timestamptz`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_activated_by uuid REFERENCES users(id)`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'evolution'`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS n8n_inbound_secret text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS n8n_send_webhook_url text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_phone_number_id text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_waba_id text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_access_token text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_verify_token text`)
  await db.execute(sql`ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_templates jsonb NOT NULL DEFAULT '[]'::jsonb`)
  await db.execute(sql`ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz`)
}

/** An explicit QR retry replaces a previously mismatched linked device first. */
export async function prepareWhatsAppQr(
  id: string,
  options?: { expectedPhone?: string; baseUrl?: string; apiKey?: string; instanceName?: string },
): Promise<Clinic> {
  await ensureWhatsAppSetupSchema()
  let clinic = await ensureAutomaticEvolutionConfig(id)
  if (options && (options.expectedPhone !== undefined || options.baseUrl || options.apiKey || options.instanceName)) {
    const patch: Partial<typeof clinics.$inferInsert> = {}
    if (options.expectedPhone && options.expectedPhone.trim()) {
      patch.whatsappExpectedPhone = normalizePhone(options.expectedPhone.trim())
      if (clinic.whatsappSetupStatus === 'not_started') patch.whatsappSetupStatus = 'ready'
    }
    if (options.baseUrl && options.baseUrl.trim()) {
      patch.evolutionBaseUrl = validateEvolutionUrl(options.baseUrl.trim())
    }
    if (options.apiKey && options.apiKey.trim()) {
      patch.evolutionApiKey = sealSecret(options.apiKey.trim())
    }
    if (options.instanceName && options.instanceName.trim()) {
      const cleanInst = options.instanceName.trim()
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cleanInst)) {
        throw new Error('Bağlantı adı 1–80 harf, rakam, tire veya alt çizgi içermeli.')
      }
      patch.evolutionInstanceName = cleanInst
    }
    if (Object.keys(patch).length > 0) {
      const [saved] = await db.update(clinics).set(patch).where(eq(clinics.id, id)).returning()
      if (saved) clinic = saved
    }
  }
  if (clinic.whatsappSetupStatus === 'phone_mismatch') {
    const creds = credentialsFor(clinic)
    await evolutionRequest(creds, `/instance/logout/${encodeURIComponent(creds.instanceName)}`, undefined, 'DELETE').catch(() => {})
    const [updated] = await db.update(clinics).set({
      evolutionConnectionState: 'close', whatsappSetupStatus: 'ready', whatsappLinkedPhone: null,
      whatsappNumberVerifiedAt: null, whatsappEnabled: false, whatsappAiEnabled: false,
    }).where(eq(clinics.id, id)).returning()
    clinic = updated
  }
  return ensureEvolutionInstance(clinic.id)
}

/** Idempotently create the clinic instance and keep its webhook up to date. */
export async function ensureEvolutionInstance(id: string): Promise<Clinic> {
  await ensureWhatsAppSetupSchema()
  const clinic = await ensureAutomaticEvolutionConfig(id)
  const creds = credentialsFor(clinic)
  const secretCipher = clinic.evolutionWebhookSecret || sealSecret(randomBytes(32).toString('hex'))
  if (!clinic.evolutionWebhookSecret) {
    await db.update(clinics).set({ evolutionWebhookSecret: secretCipher }).where(eq(clinics.id, clinic.id))
    clinic.evolutionWebhookSecret = secretCipher
  }
  const base = (process.env.EVOLUTION_WEBHOOK_BASE_URL || process.env.APP_URL || `http://localhost:${Number(process.env.PORT) || 3001}`).trim()
  const webhook = {
    enabled: true, url: `${base.replace(/\/$/, '')}/api/whatsapp/evolution/${clinic.id}`,
    byEvents: false, base64: false,
    headers: { 'x-voiceai-webhook-secret': openSecret(secretCipher) },
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  }

  let exists = false
  try {
    await evolutionRequest(creds, `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`)
    exists = true
  } catch (error) {
    if (!(error instanceof EvolutionError) || ![400, 404].includes(error.status)) throw error
  }

  if (!exists) {
    try {
      await evolutionRequest(creds, '/instance/create', {
        instanceName: creds.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        groupsIgnore: true,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      })
    } catch (createError) {
      if (!(createError instanceof EvolutionError) || ![400, 403, 409].includes(createError.status)) throw createError
      if (createError.status === 400) {
        try {
          await evolutionRequest(creds, '/instance/create', {
            instanceName: creds.instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          })
        } catch (retryErr) {
          if (!(retryErr instanceof EvolutionError) || ![403, 409].includes(retryErr.status)) throw retryErr
        }
      }
    }
  }

  try {
    await evolutionRequest(creds, `/webhook/set/${encodeURIComponent(creds.instanceName)}`, { webhook })
  } catch {
    try {
      await evolutionRequest(creds, `/webhook/set/${encodeURIComponent(creds.instanceName)}`, {
        enabled: true,
        url: webhook.url,
        webhookByEvents: false,
        webhookBase64: false,
        headers: webhook.headers,
        events: webhook.events,
      })
    } catch {
      try {
        await evolutionRequest(creds, `/event/webhook/set/${encodeURIComponent(creds.instanceName)}`, { webhook })
      } catch {
        try {
          await evolutionRequest(creds, '/webhook/instance', { instanceName: creds.instanceName, ...webhook })
        } catch {
          // Webhook configuration format varies across custom Evolution API versions
        }
      }
    }
  }
  return clinic
}

export function patientPhoneMatches(phone: string) {
  const normalized = normalizePhone(phone).slice(1)
  // Existing Turkish records may use +90, 90, 0 or a ten-digit mobile number.
  const variants = normalized.startsWith('90') && normalized.length === 12
    ? [normalized, `0${normalized.slice(2)}`, normalized.slice(2)] : [normalized]
  return sql`regexp_replace(${patients.phone}, '[^0-9]', '', 'g') IN (${sql.join(variants.map(v => sql`${v}`), sql`, `)})`
}

export async function ensureConversation(
  tx: DbTransaction,
  clinic: Clinic,
  remoteJid: string,
  phone: string | null,
  providerOverride?: WhatsAppProviderType,
) {
  const instanceName = resolveActiveWhatsAppInstanceName(clinic, providerOverride)
  const identity = `${clinic.id}:${instanceName}:${remoteJid}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`)
  let [conversation] = await tx.select().from(whatsappConversations).where(and(
    eq(whatsappConversations.clinicId, clinic.id), eq(whatsappConversations.instanceName, instanceName!), eq(whatsappConversations.remoteJid, remoteJid),
  )).limit(1)
  if (conversation) return conversation
  if (phone) {
    const [legacy] = await tx.select().from(whatsappConversations).where(and(
      eq(whatsappConversations.clinicId, clinic.id), isNull(whatsappConversations.instanceName),
      sql`regexp_replace(${whatsappConversations.patientPhone}, '[^0-9]', '', 'g') = ${phone.slice(1)}`,
    )).orderBy(desc(whatsappConversations.updatedAt)).limit(1)
    if (legacy) {
      [conversation] = await tx.update(whatsappConversations).set({ instanceName, remoteJid, patientPhone: phone })
        .where(eq(whatsappConversations.id, legacy.id)).returning()
      return conversation
    }
  }
  const [patient] = phone ? await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.clinicId, clinic.id), patientPhoneMatches(phone))).limit(1) : []
  ;[conversation] = await tx.insert(whatsappConversations).values({
    clinicId: clinic.id, instanceName, remoteJid, patientPhone: phone, patientId: patient?.id,
  }).returning()
  return conversation
}

export async function recordIncomingMessage(
  clinic: Clinic,
  message: IncomingWhatsAppMessage,
  providerOverride?: WhatsAppProviderType,
): Promise<string | null> {
  return db.transaction(async tx => {
    const conversation = await ensureConversation(tx, clinic, message.remoteJid, message.phone, providerOverride)
    if (message.fromMe) {
      const [own] = await tx.select({ id: whatsappMessages.id }).from(whatsappMessages).where(and(
        eq(whatsappMessages.conversationId, conversation.id),
        sql`(${whatsappMessages.providerMessageId} = ${message.externalId} OR (${whatsappMessages.status} IN ('sending','uncertain','sent','reply_ready') AND ${whatsappMessages.replyText} = ${message.text}))`,
      )).limit(1)
      if (own) return null
    }
    const [inserted] = await tx.insert(whatsappMessages).values({
      conversationId: conversation.id, externalId: message.externalId, text: message.text,
      direction: message.fromMe ? 'outbound' : 'inbound',
      status: message.fromMe ? 'received' : detectOptOut(message.text) || (clinic.whatsappAiEnabled && !conversation.aiPaused) ? 'pending' : 'held',
    }).onConflictDoNothing().returning()
    if (!inserted) return null
    const msgDate = new Date(message.timestamp)
    await tx.update(whatsappConversations).set({
      lastMessageAt: msgDate,
      ...(message.fromMe ? {} : { lastInboundAt: msgDate }),
      updatedAt: new Date(),
    }).where(eq(whatsappConversations.id, conversation.id))
    return conversation.id
  })
}

export async function enqueueWhatsAppNotification(clinic: Clinic, phone: string, text: string, deduplicationKey: string, patientId: string): Promise<void> {
  const normalized = normalizePhone(phone)
  await db.transaction(async tx => {
    const matchingPatients = await tx.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.clinicId, clinic.id), patientPhoneMatches(normalized))).limit(2)
    if (matchingPatients.length !== 1 || matchingPatients[0].id !== patientId) throw new Error('Telefon hastaya tekil olarak eşleşmiyor.')
    const conversation = await ensureConversation(tx, clinic, `${normalized.slice(1)}@s.whatsapp.net`, normalized)
    if (conversation.patientId && conversation.patientId !== patientId) throw new Error('Konuşma farklı bir hastaya bağlı.')
    if (!conversation.patientId) await tx.update(whatsappConversations).set({ patientId }).where(eq(whatsappConversations.id, conversation.id))
    await tx.insert(whatsappMessages).values({ conversationId: conversation.id, externalId: deduplicationKey,
      direction: 'notification', text, replyText: text, status: 'reply_ready' }).onConflictDoUpdate({
      target: [whatsappMessages.conversationId, whatsappMessages.externalId],
      set: { status: 'reply_ready', error: null, availableAt: new Date(), updatedAt: new Date() },
      setWhere: sql`${whatsappMessages.status} IN ('skipped', 'held')`,
    })
  })
}
