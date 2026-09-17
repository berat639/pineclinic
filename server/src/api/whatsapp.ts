import { Elysia, t } from 'elysia'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { clinics, whatsappConversations, whatsappMessages } from '../db/schema'
import { credentialsFor, ensureEvolutionInstance, getWhatsAppClinic, publicWhatsAppConfig, recordIncomingMessage, saveWhatsAppConfig } from '../db/repositories/whatsapp'
import { authenticateRequest } from '../middleware/auth'
import { evolutionRequest, EvolutionError, parseEvolutionMessages, verifyWebhookSecret } from '../integrations/whatsapp'
import { openSecret } from '../services/integration-secrets'
import { requireClinicId } from '../tenancy/context'

const clinicParams = t.Object({ clinicId: t.String({ format: 'uuid' }) })
const messageParams = t.Object({ clinicId: t.String({ format: 'uuid' }), id: t.String({ format: 'uuid' }) })
function assertCurrentClinic(clinicId: string): void {
  if (clinicId !== requireClinicId()) throw new Error('Bu kliniğe erişim yetkiniz yok.')
}
const admin = new Elysia({ prefix: '/api/admin/whatsapp' })
  .onBeforeHandle(async ({ cookie, request, set }) => {
    const user = await authenticateRequest(cookie.token?.value as string | undefined, request)
    if (!user || !['yonetici', 'moderator'].includes(user.role)) {
      set.status = user ? 403 : 401
      return { error: 'WhatsApp yönetimi için yönetici girişi gerekli.' }
    }
  })
  .onError(({ error, set }) => {
    set.status = error instanceof EvolutionError ? 502 : 400
    return { error: error instanceof Error && !('query' in error) && !('code' in error) ? error.message : 'İşlem tamamlanamadı.' }
  })
  .get('/', async () => {
    const rows = await db.select().from(clinics).where(and(
      eq(clinics.id, requireClinicId()),
      eq(clinics.isActive, true),
    )).orderBy(clinics.name)
    return rows.map(publicWhatsAppConfig)
  })
  .put('/:clinicId', async ({ params, body }) => {
    assertCurrentClinic(params.clinicId)
    return saveWhatsAppConfig(params.clinicId, body)
  }, {
    params: clinicParams,
    body: t.Object({ baseUrl: t.String({ maxLength: 500 }), instanceName: t.String({ maxLength: 80 }),
      apiKey: t.Optional(t.String({ maxLength: 512 })), enabled: t.Boolean(), aiEnabled: t.Boolean() }),
  })
  .get('/:clinicId/status', async ({ params }) => {
    assertCurrentClinic(params.clinicId)
    const clinic = await ensureEvolutionInstance(params.clinicId)
    const creds = credentialsFor(clinic)
    const state = await evolutionRequest<{ instance?: { state?: string } }>(creds, `/instance/connectionState/${encodeURIComponent(creds.instanceName)}`)
    const connectionState = state.instance?.state || 'unknown'
    await db.update(clinics).set({ evolutionConnectionState: connectionState }).where(eq(clinics.id, clinic.id))
    return { connectionState }
  }, { params: clinicParams })
  .post('/:clinicId/connect', async ({ params }) => {
    assertCurrentClinic(params.clinicId)
    const clinic = await ensureEvolutionInstance(params.clinicId)
    const creds = credentialsFor(clinic)
    const result = await evolutionRequest<{ base64?: string; qrcode?: { base64?: string }; instance?: { state?: string } }>(creds,
      `/instance/connect/${encodeURIComponent(creds.instanceName)}`)
    const qr = result.base64 || result.qrcode?.base64
    return { qrcode: qr && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr) && qr.length < 200_000 ? qr : null,
      connectionState: result.instance?.state || 'connecting' }
  }, { params: clinicParams })
  .get('/:clinicId/conversations', async ({ params }) => {
    assertCurrentClinic(params.clinicId)
    return db.select({ id: whatsappConversations.id, phone: whatsappConversations.patientPhone, remoteJid: whatsappConversations.remoteJid,
      aiPaused: whatsappConversations.aiPaused, lastMessageAt: whatsappConversations.lastMessageAt })
      .from(whatsappConversations).where(eq(whatsappConversations.clinicId, params.clinicId)).orderBy(desc(whatsappConversations.lastMessageAt)).limit(100)
  }, { params: clinicParams })
  .put('/:clinicId/conversations/:id', async ({ params, body }) => {
    assertCurrentClinic(params.clinicId)
    const rows = await db.transaction(async tx => {
      const changed = await tx.update(whatsappConversations).set({ aiPaused: body.paused, updatedAt: new Date() })
        .where(and(eq(whatsappConversations.id, params.id), eq(whatsappConversations.clinicId, params.clinicId))).returning({ id: whatsappConversations.id })
      if (!changed.length) throw new Error('Sohbet bulunamadı.')
      // Resume applies to future messages; do not replay messages handled by a member of staff.
      await tx.update(whatsappMessages).set({ status: 'held', updatedAt: new Date() })
        .where(and(eq(whatsappMessages.conversationId, params.id), sql`${whatsappMessages.status} IN ('pending','reply_ready')`))
      return changed
    })
    return { success: !!rows.length }
  }, { params: messageParams, body: t.Object({ paused: t.Boolean() }) })
  .get('/:clinicId/conversations/:id/messages', async ({ params }) => {
    assertCurrentClinic(params.clinicId)
    const [conversation] = await db.select({ id: whatsappConversations.id }).from(whatsappConversations)
      .where(and(eq(whatsappConversations.id, params.id), eq(whatsappConversations.clinicId, params.clinicId)))
    if (!conversation) throw new Error('Sohbet bulunamadı.')
    return db.select().from(whatsappMessages).where(eq(whatsappMessages.conversationId, params.id)).orderBy(desc(whatsappMessages.sequence)).limit(60)
  }, { params: messageParams })
  .post('/:clinicId/messages/:id/resolve', async ({ params, body }) => {
    assertCurrentClinic(params.clinicId)
    const [message] = await db.select({ message: whatsappMessages }).from(whatsappMessages)
      .innerJoin(whatsappConversations, eq(whatsappMessages.conversationId, whatsappConversations.id))
      .where(and(eq(whatsappMessages.id, params.id), eq(whatsappConversations.clinicId, params.clinicId)))
    if (!message) throw new Error('Mesaj bulunamadı.')
    const current = message.message
    if (body.action === 'retry' && current.status !== 'failed') throw new Error('Yalnızca başarısızlığı doğrulanmış mesajlar yeniden denenebilir.')
    if (body.action === 'resolve' && !['failed', 'uncertain'].includes(current.status)) throw new Error('Bu mesaj kontrol beklemiyor.')
    await db.update(whatsappMessages).set(body.action === 'retry'
      ? { status: current.replyText ? 'reply_ready' : 'pending', attempts: 0, availableAt: new Date(), error: null }
      : { status: 'resolved', error: null }).where(and(eq(whatsappMessages.id, params.id), eq(whatsappMessages.status, current.status)))
    if (body.action === 'retry') await db.update(whatsappConversations).set({ aiPaused: false }).where(eq(whatsappConversations.id, current.conversationId))
    return { success: true }
  }, { params: messageParams, body: t.Object({ action: t.Union([t.Literal('retry'), t.Literal('resolve')]) }) })

export const whatsappPlugin = new Elysia()
  .post('/api/whatsapp/evolution/:clinicId', async ({ params, body, request, set }) => {
    const clinic = await getWhatsAppClinic(params.clinicId)
    if (!clinic.evolutionWebhookSecret || !verifyWebhookSecret(request.headers.get('x-voiceai-webhook-secret'), openSecret(clinic.evolutionWebhookSecret))) {
      set.status = 401; return { error: 'Yetkisiz webhook.' }
    }
    const payload = body as any
    if (payload?.instance !== clinic.evolutionInstanceName) { set.status = 403; return { error: 'Bağlantı eşleşmiyor.' } }
    const event = String(payload?.event).replace(/[.-]/g, '_').toUpperCase()
    if (event === 'CONNECTION_UPDATE') {
      const state = ['open', 'close', 'connecting'].includes(payload.data?.state) ? payload.data.state : 'unknown'
      await db.update(clinics).set({ evolutionConnectionState: state }).where(eq(clinics.id, clinic.id))
    } else if (event === 'MESSAGES_UPDATE') {
      const updates = Array.isArray(payload.data) ? payload.data : [payload.data]
      for (const update of updates.slice(0, 100)) {
        const id = update?.key?.id || update?.keyId
        if (typeof id !== 'string') continue
        await db.update(whatsappMessages).set({ deliveryStatus: String(update.status || update.update?.status || '').slice(0, 40), updatedAt: new Date() })
          .where(and(eq(whatsappMessages.providerMessageId, id), sql`${whatsappMessages.conversationId} IN (SELECT id FROM whatsapp_conversations WHERE clinic_id = ${clinic.id} AND instance_name = ${clinic.evolutionInstanceName})`))
      }
    } else {
      for (const message of parseEvolutionMessages(payload)) await recordIncomingMessage(clinic, message)
    }
    // Acknowledge only after the inbox has committed. The worker recovers independently of Redis.
    return { status: 'ok' }
  }, { params: clinicParams })
  .use(admin)
