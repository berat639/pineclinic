import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { clinics, patients, whatsappConversations, whatsappMessages } from '../schema'
import { openSecret, sealSecret } from '../../services/integration-secrets'
import { detectOptOut, evolutionRequest, EvolutionError, normalizePhone, validateEvolutionUrl, type IncomingWhatsAppMessage, type WhatsAppCredentials } from '../../integrations/whatsapp'

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
  return { baseUrl: validateEvolutionUrl(baseUrl), apiKey, instanceName: `voiceai-${clinic.id}` }
}
export function credentialsFor(clinic: Clinic): WhatsAppCredentials {
  if (!clinic.evolutionBaseUrl || !clinic.evolutionApiKey || !clinic.evolutionInstanceName) throw new Error('Evolution bağlantı ayarları eksik.')
  return { baseUrl: clinic.evolutionBaseUrl, apiKey: openSecret(clinic.evolutionApiKey), instanceName: clinic.evolutionInstanceName }
}
export function publicWhatsAppConfig(clinic: Clinic) {
  const automatic = automaticEvolutionConfig(clinic)
  return {
    clinicId: clinic.id, clinicName: clinic.name, baseUrl: clinic.evolutionBaseUrl || automatic?.baseUrl || '',
    instanceName: clinic.evolutionInstanceName || automatic?.instanceName || '', hasApiKey: !!clinic.evolutionApiKey || !!automatic,
    enabled: clinic.whatsappEnabled, aiEnabled: clinic.whatsappAiEnabled,
    connectionState: clinic.evolutionConnectionState,
  }
}
export async function saveWhatsAppConfig(id: string, input: { baseUrl: string; instanceName: string; apiKey?: string; enabled: boolean; aiEnabled: boolean }) {
  const clinic = await getWhatsAppClinic(id)
  const automatic = automaticEvolutionConfig(clinic)
  const baseUrl = validateEvolutionUrl(input.baseUrl.trim())
  const instanceName = input.instanceName.trim()
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instanceName)) throw new Error('Bağlantı adı 1–80 harf, rakam, tire veya alt çizgi içermeli.')
  const identityChanged = clinic.evolutionBaseUrl !== baseUrl || clinic.evolutionInstanceName !== instanceName
  if (identityChanged && clinic.evolutionInstanceName) {
    const [active] = await db.select({ id: whatsappMessages.id }).from(whatsappMessages)
      .innerJoin(whatsappConversations, eq(whatsappMessages.conversationId, whatsappConversations.id))
      .where(and(eq(whatsappConversations.clinicId, id), sql`${whatsappMessages.status} IN ('pending','processing','reply_ready','sending','uncertain')`)).limit(1)
    if (active) throw new Error('Bağlantıyı değiştirmeden önce bekleyen gönderimleri sonuçlandırın.')
  }
  const apiKey = input.apiKey?.trim() ? sealSecret(input.apiKey.trim()) : clinic.evolutionApiKey || (automatic ? sealSecret(automatic.apiKey) : null)
  if (!apiKey) throw new Error('Evolution API anahtarını girin.')
  const [updated] = await db.update(clinics).set({
    evolutionBaseUrl: baseUrl, evolutionInstanceName: instanceName, evolutionApiKey: apiKey,
    evolutionWebhookSecret: identityChanged || !clinic.evolutionWebhookSecret ? sealSecret(randomBytes(32).toString('hex')) : clinic.evolutionWebhookSecret,
    evolutionConnectionState: identityChanged ? 'unconfigured' : clinic.evolutionConnectionState,
    whatsappEnabled: input.enabled, whatsappAiEnabled: input.aiEnabled,
  }).where(eq(clinics.id, id)).returning()
  return publicWhatsAppConfig(updated)
}

/** Fill missing tenant settings from the shared Evolution configuration. */
export async function ensureAutomaticEvolutionConfig(id: string): Promise<Clinic> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`evolution:${id}`}, 0))`)
    const [clinic] = await tx.select().from(clinics).where(eq(clinics.id, id))
    if (!clinic) throw new Error('Klinik bulunamadı.')
    const automatic = automaticEvolutionConfig(clinic)
    if (!automatic) return clinic
    if (clinic.evolutionBaseUrl && clinic.evolutionApiKey && clinic.evolutionInstanceName && clinic.evolutionWebhookSecret) return clinic

    const [updated] = await tx.update(clinics).set({
      evolutionBaseUrl: clinic.evolutionBaseUrl || automatic.baseUrl,
      evolutionApiKey: clinic.evolutionApiKey || sealSecret(automatic.apiKey),
      evolutionInstanceName: clinic.evolutionInstanceName || automatic.instanceName,
      evolutionWebhookSecret: clinic.evolutionWebhookSecret || sealSecret(randomBytes(32).toString('hex')),
    }).where(eq(clinics.id, id)).returning()
    return updated
  })
}

/** Idempotently create the clinic instance and keep its webhook up to date. */
export async function ensureEvolutionInstance(id: string): Promise<Clinic> {
  const clinic = await ensureAutomaticEvolutionConfig(id)
  const creds = credentialsFor(clinic)
  if (!clinic.evolutionWebhookSecret) throw new Error('Önce Evolution ayarlarını kaydedin.')
  const base = process.env.EVOLUTION_WEBHOOK_BASE_URL || process.env.APP_URL
  if (!base) throw new Error('Sunucuda EVOLUTION_WEBHOOK_BASE_URL tanımlanmalı.')
  const webhook = {
    enabled: true, url: `${base.replace(/\/$/, '')}/api/whatsapp/evolution/${clinic.id}`,
    byEvents: false, base64: false,
    headers: { 'x-voiceai-webhook-secret': openSecret(clinic.evolutionWebhookSecret) },
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  }

  try { await evolutionRequest(creds, `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`) }
  catch (error) {
    if (!(error instanceof EvolutionError) || error.status !== 404) throw error
    try {
      await evolutionRequest(creds, '/instance/create', { instanceName: creds.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook,
        groupsIgnore: true, readMessages: false, readStatus: false, syncFullHistory: false })
    } catch (createError) {
      // Another request may have created the deterministic instance meanwhile.
      if (!(createError instanceof EvolutionError) || ![403, 409].includes(createError.status)) throw createError
      await evolutionRequest(creds, `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`)
    }
  }
  try { await evolutionRequest(creds, `/webhook/set/${encodeURIComponent(creds.instanceName)}`, { webhook }) }
  catch (error) {
    if (!(error instanceof EvolutionError) || error.status !== 404) throw error
    await evolutionRequest(creds, `/event/webhook/set/${encodeURIComponent(creds.instanceName)}`, { webhook })
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

export async function ensureConversation(tx: DbTransaction, clinic: Clinic, remoteJid: string, phone: string | null) {
  const identity = `${clinic.id}:${clinic.evolutionInstanceName}:${remoteJid}`
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`)
  let [conversation] = await tx.select().from(whatsappConversations).where(and(
    eq(whatsappConversations.clinicId, clinic.id), eq(whatsappConversations.instanceName, clinic.evolutionInstanceName!), eq(whatsappConversations.remoteJid, remoteJid),
  )).limit(1)
  if (conversation) return conversation
  if (phone) {
    const [legacy] = await tx.select().from(whatsappConversations).where(and(
      eq(whatsappConversations.clinicId, clinic.id), isNull(whatsappConversations.instanceName),
      sql`regexp_replace(${whatsappConversations.patientPhone}, '[^0-9]', '', 'g') = ${phone.slice(1)}`,
    )).orderBy(desc(whatsappConversations.updatedAt)).limit(1)
    if (legacy) {
      [conversation] = await tx.update(whatsappConversations).set({ instanceName: clinic.evolutionInstanceName, remoteJid, patientPhone: phone })
        .where(eq(whatsappConversations.id, legacy.id)).returning()
      return conversation
    }
  }
  const [patient] = phone ? await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.clinicId, clinic.id), patientPhoneMatches(phone))).limit(1) : []
  ;[conversation] = await tx.insert(whatsappConversations).values({
    clinicId: clinic.id, instanceName: clinic.evolutionInstanceName, remoteJid, patientPhone: phone, patientId: patient?.id,
  }).returning()
  return conversation
}

export async function recordIncomingMessage(clinic: Clinic, message: IncomingWhatsAppMessage): Promise<string | null> {
  return db.transaction(async tx => {
    const conversation = await ensureConversation(tx, clinic, message.remoteJid, message.phone)
    if (message.fromMe) {
      const [own] = await tx.select({ id: whatsappMessages.id }).from(whatsappMessages).where(and(
        eq(whatsappMessages.conversationId, conversation.id),
        sql`(${whatsappMessages.providerMessageId} = ${message.externalId} OR (${whatsappMessages.status} IN ('sending','uncertain') AND ${whatsappMessages.replyText} = ${message.text}))`,
      )).limit(1)
      if (own) return null
    }
    const [inserted] = await tx.insert(whatsappMessages).values({
      conversationId: conversation.id, externalId: message.externalId, text: message.text,
      direction: message.fromMe ? 'outbound' : 'inbound',
      status: message.fromMe ? 'received' : detectOptOut(message.text) || (clinic.whatsappAiEnabled && !conversation.aiPaused) ? 'pending' : 'held',
    }).onConflictDoNothing().returning()
    if (!inserted) return null
    await tx.update(whatsappConversations).set({
      lastMessageAt: new Date(message.timestamp), updatedAt: new Date(), ...(message.fromMe ? { aiPaused: true } : {}),
    }).where(eq(whatsappConversations.id, conversation.id))
    return conversation.id
  })
}

export async function enqueueWhatsAppNotification(clinic: Clinic, phone: string, text: string, deduplicationKey: string): Promise<void> {
  const normalized = normalizePhone(phone)
  await db.transaction(async tx => {
    const conversation = await ensureConversation(tx, clinic, `${normalized.slice(1)}@s.whatsapp.net`, normalized)
    await tx.insert(whatsappMessages).values({ conversationId: conversation.id, externalId: deduplicationKey,
      direction: 'notification', text, replyText: text, status: 'reply_ready' }).onConflictDoNothing()
  })
}
