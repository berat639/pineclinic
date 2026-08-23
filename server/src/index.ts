import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { randomUUID } from 'crypto'
import { createReadStream, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { GoogleGenAI } from '@google/genai'
import { createLiveSession, validateLiveCustomerIdentity } from './gemini'
import {
  readAppointments,
  deleteAppointment,
  createAppointment,
  getCustomerByPhone,
  getAppointmentsByDateRange,
} from './db/repositories/appointments'
import {
  listRecordings,
  saveRecording,
  deleteRecording,
  RECORDINGS_DIR,
} from './db/repositories/recordings'
import {
  listDocs,
  createDoc,
  updateDoc,
  deleteDoc,
  toggleDoc,
  updateDocEmbedding,
  countEmbedded,
  retrieveTopK as retrieveDocsByEmbedding,
  findCustomerDocByPhone,
} from './db/repositories/knowledge'
import {
  getCalendarSettings,
  setCalendarSettings,
  disconnectCalendar,
  getAiModel,
  setAiModel,
  getGreeting,
  setGreeting,
  getConnectionMode,
  setConnectionMode,
  getAllPromptSections,
  setPromptSection,
  resetPromptSection,
  getBranding,
  setBranding,
} from './db/repositories/settings'
import { embedText, buildRagPrompt, PRE_WARM_QUERY, getEmbeddingModel, getEmbeddingDimensions } from './rag'
import { PROMPT_SECTIONS, PROMPT_SECTION_KEYS, getDefaultPromptValue } from './data/default-prompts'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
// Ensure public/uploads/dcm directory exists at startup
mkdirSync(resolve(PUBLIC_DIR, 'uploads/dcm'), { recursive: true })
import { listCategories, createCategory, updateCategory, deleteCategory, seedCategories } from './db/repositories/categories'
import { authPlugin } from './api/auth'
import { shiftsPlugin } from './api/shifts'
import { notificationsPlugin } from './api/notifications'
import { yoneticiPlugin } from './api/yonetici'
import { startReminderCron } from './cron/reminders'

const callerRegistry = new Map<string, { phone: string; channel?: string; direction?: string }>()

const PORT = Number(process.env.PORT) || 3001

function getTodayTurkish(): string {
  const now = new Date()
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
  return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} ${days[now.getDay()]}`
}

const ALLOWED_LIVE_MODELS = [
  'gemini-3.1-flash-live-preview',
] as const
const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview'

async function resolveLiveModel(): Promise<string> {
  const saved = await getAiModel()
  if (saved && (ALLOWED_LIVE_MODELS as readonly string[]).includes(saved)) return saved
  const fromEnv = process.env.GEMINI_LIVE_MODEL
  if (fromEnv && (ALLOWED_LIVE_MODELS as readonly string[]).includes(fromEnv)) return fromEnv
  return DEFAULT_LIVE_MODEL
}

// ── GoogleGenAI client ────────────────────────────────────────────────────────
function createAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY tanımlı değil')
  console.log('[AI] Gemini API key modu')
  return new GoogleGenAI({ apiKey })
}

const ai = createAI()

// ── SYSTEM_PROMPT ─────────────────────────────────────────────────────────────
const DEFAULT_GREETING = 'Merhaba, hoş geldiniz! Ben Pine Clinic asistanınızım. Size daha iyi yardımcı olabilmem için telefon numaranızı öğrenebilir miyim?'

/**
 * Build system prompt dynamically from DB sections.
 * No cache — always reads fresh from DB for instant updates.
 */
async function buildSystemPrompt(greeting: string, direction: string = 'inbound'): Promise<string> {
  let dbSections: Record<string, string> = {}
  try {
    const rows = await getAllPromptSections()
    dbSections = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.value]))
  } catch {}

  const parts: string[] = []
  for (const key of PROMPT_SECTION_KEYS) {
    let value = dbSections[key] ?? getDefaultPromptValue(key) ?? ''
    if (key === 'prompt.greeting_flow') {
      if (direction === 'outbound') {
        value = `GIDEN ARAMA (OUTBOUND) KARŞILAMA VE GÖREV TALİMATI:
Sen dış arama (outbound call) yapıyorsun. Karşı taraf telefonu açtığında İLK CÜMLE olarak KESİNLİKLE şu giden karşılama mesajını söyle:
"${greeting}"
Ardından konuşma akışındaki adımları sırasıyla uygula.`
      } else {
        value = value.includes('{{greeting}}')
          ? value.replace(/\{\{greeting\}\}/g, greeting)
          : `GELEN ARAMA (INBOUND) KARŞILAMA:\nMüşteri aradığında şu karşılama mesajını söyle: "${greeting}"\nSonra müşterinin ne istediğini dinle ve yardımcı ol.`
      }
    }
    if (value) parts.push(value)
  }

  // Inject conversation flow as prompt text
  try {
    const { getActiveFlow, flowToPromptText } = await import('./db/repositories/flows')
    const flow = await getActiveFlow(direction)
    if (flow) {
      const flowText = flowToPromptText(flow)
      if (flowText) parts.push(flowText)
    }
  } catch {}

  return parts.join('\n\n')
}

// ── Session tracking ──────────────────────────────────────────────────────────
interface TimedChunk {
  buffer: Buffer
  offsetMs: number
}

interface SessionInfo {
  session: Awaited<ReturnType<typeof createLiveSession>>
  startedAt: Date
  startedAtMs: number
  audioChunks: TimedChunk[]      // AI (24 kHz)
  userAudioChunks: TimedChunk[]  // User (16 kHz)
  shortId: string
}

const sessions = new Map<string, SessionInfo>()

// ── SSE: Admin real-time notifications ───────────────────────────────────────
import { sseClients as sharedSseClients } from './events'
type SseClient = { id: string; send: (data: string) => void }
const sseClients = new Set<SseClient>()

function notifyAdmins(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    try { client.send(data) } catch { sseClients.delete(client) }
  }
}

// Bridge events.ts broadcastSSE → actual SSE clients
sharedSseClients.add((event: string, data: unknown) => {
  notifyAdmins(event, data)
})

// ── WAV helper: time-aligned stereo (user=L, AI=R) ──────────────────────────
/**
 * 16 kHz → 24 kHz linear-interpolation upsampling.
 */
function upsample16to24(buf: Buffer): Buffer {
  const inSamples = buf.length / 2
  const outSamples = Math.ceil(inSamples * 24000 / 16000)
  const out = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const srcF = i * 16000 / 24000
    const srcI = Math.floor(srcF)
    const frac = srcF - srcI
    const s0 = buf.readInt16LE(Math.min(srcI, inSamples - 1) * 2)
    const s1 = buf.readInt16LE(Math.min(srcI + 1, inSamples - 1) * 2)
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2)
  }
  return out
}

/**
 * Build a stereo WAV (user=L, AI=R) at 24 kHz using offset-based placement.
 * Each chunk is written at its real time offset; silences are zero-filled.
 * This keeps the user/AI tracks SYNCHRONIZED with the actual conversation timeline,
 * so playback reflects when each side actually spoke.
 */
function buildStereoWav(aiChunks: TimedChunk[], userChunks: TimedChunk[], totalDurationMs: number): Buffer {
  const sampleRate = 24000
  const numChannels = 2
  const bitsPerSample = 16
  const totalSamples = Math.ceil(totalDurationMs / 1000 * sampleRate)
  const dataSize = totalSamples * numChannels * 2
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8

  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8); header.write('fmt ', 12)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(numChannels, 22); header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28); header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34); header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  const data = Buffer.alloc(dataSize, 0)

  // Place user chunks on left channel (offset 0 in each frame)
  // User audio is 16 kHz PCM — upsample each chunk to 24 kHz before placing
  for (const ch of userChunks) {
    const pcm24 = upsample16to24(ch.buffer)
    const startSample = Math.round(ch.offsetMs / 1000 * sampleRate)
    const samples = pcm24.length / 2
    for (let i = 0; i < samples; i++) {
      const frame = startSample + i
      if (frame >= totalSamples) break
      const byteOffset = frame * 4 // 2 channels * 2 bytes
      const s = pcm24.readInt16LE(i * 2)
      data.writeInt16LE(s, byteOffset)
    }
  }

  // Place AI chunks on right channel (offset 2 in each frame)
  // AI audio is already 24 kHz PCM
  for (const ch of aiChunks) {
    const startSample = Math.round(ch.offsetMs / 1000 * sampleRate)
    const samples = ch.buffer.length / 2
    for (let i = 0; i < samples; i++) {
      const frame = startSample + i
      if (frame >= totalSamples) break
      const byteOffset = frame * 4 + 2 // right channel
      const s = ch.buffer.readInt16LE(i * 2)
      data.writeInt16LE(s, byteOffset)
    }
  }

  return Buffer.concat([header, data])
}

// ── Elysia app ────────────────────────────────────────────────────────────────
const defaultCorsOrigins = ['http://localhost:3000', 'http://localhost:3001']
const corsFromEnv = process.env.CORS_ORIGIN?.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) ?? []
const corsOrigins = [...new Set([...defaultCorsOrigins, ...corsFromEnv])]

const app = new Elysia()
  .use(cors({ origin: corsOrigins }))
  .use(staticPlugin({ assets: PUBLIC_DIR, prefix: '/' }))
  .use(authPlugin)
  .use(shiftsPlugin)
  .use(notificationsPlugin)
  .use(yoneticiPlugin)

  // ── Public Opt-out API ─────────────────────────────────────────────────────
  .get('/api/public/optout/:id', async ({ params, set }: any) => {
    try {
      const { db } = await import('./db/client')
      const { patients } = await import('./db/schema')
      const { eq } = await import('drizzle-orm')
      
      const patientId = params.id
      const patient = await db.query.patients.findFirst({
        where: eq(patients.id, patientId)
      })
      if (!patient) {
        set.status = 404
        return { error: 'Hasta bulunamadı' }
      }
      return { 
        id: patient.id,
        name: patient.name,
        smsOptOut: patient.smsOptOut,
        emailOptOut: patient.emailOptOut,
        whatsappOptOut: patient.whatsappOptOut 
      }
    } catch (e: any) {
      set.status = 500
      return { error: 'Sunucu hatası' }
    }
  })
  .post('/api/public/optout/:id', async ({ params, body, set }: any) => {
    try {
      const { db } = await import('./db/client')
      const { patients } = await import('./db/schema')
      const { eq } = await import('drizzle-orm')
      
      const patientId = params.id
      const b = body as any
      
      await db.update(patients).set({
        smsOptOut: !!b.smsOptOut,
        emailOptOut: !!b.emailOptOut,
        whatsappOptOut: !!b.whatsappOptOut
      }).where(eq(patients.id, patientId))
      
      return { success: true }
    } catch (e: any) {
      set.status = 500
      return { error: 'Sunucu hatası' }
    }
  })

  // ── WhatsApp Webhook ───────────────────────────────────────────────────────
  // GET: Meta webhook verification (hub.challenge)
  .get('/api/whatsapp/webhook', ({ query, set }: any) => {
    const mode = query['hub.mode']
    const token = query['hub.verify_token']
    const challenge = query['hub.challenge']
    // We allow per-clinic verify tokens — check all enabled clinics
    // For simplicity we also accept a global env fallback
    const globalToken = process.env.WA_VERIFY_TOKEN
    if (mode === 'subscribe' && (token === globalToken)) {
      console.log('[WA Webhook] Verification success')
      set.headers['content-type'] = 'text/plain'
      return challenge
    }
    set.status = 403
    return 'Forbidden'
  })

  // POST: Incoming messages from Meta
  .post('/api/whatsapp/webhook', async ({ body, set }: any) => {
    try {
      const payload = body as any
      if (payload?.object !== 'whatsapp_business_account') {
        set.status = 400
        return { error: 'Not a WhatsApp event' }
      }

      // Acknowledge immediately (Meta requires < 5s response)
      // Process async
      ;(async () => {
        try {
          const { handleIncomingWhatsAppMessage } = await import('./services/whatsapp-conversation')
          const { db } = await import('./db/client')
          const { clinics } = await import('./db/schema')
          const { eq } = await import('drizzle-orm')

          for (const entry of payload.entry ?? []) {
            for (const change of entry.changes ?? []) {
              const val = change.value
              const phoneNumberId = val?.metadata?.phone_number_id

              if (!phoneNumberId) continue

              // Find which clinic this phone number belongs to
              const clinicRows = await db.select()
                .from(clinics)
                .where(eq(clinics.whatsappPhoneNumberId, phoneNumberId))
                .limit(1)
              const clinic = clinicRows[0]
              if (!clinic?.whatsappEnabled) continue

              // Handle status updates (delivery receipts, errors)
              for (const status of val.statuses ?? []) {
                if (status.status === 'failed' && status.errors?.[0]?.code === 131026) {
                  // Patient blocked/opted out
                  const { patients } = await import('./db/schema')
                  const { and } = await import('drizzle-orm')
                  await db.update(patients)
                    .set({ whatsappOptOut: true })
                    .where(and(
                      eq(patients.clinicId, clinic.id),
                      eq(patients.phone, status.recipient_id)
                    ))
                  console.log(`[WA Webhook] Opt-out via failed delivery: ${status.recipient_id}`)
                }
              }

              // Handle incoming messages
              for (const msg of val.messages ?? []) {
                const from = msg.from  // Sender phone (E.164 without +)
                let text = ''

                if (msg.type === 'text') {
                  text = msg.text?.body ?? ''
                } else if (msg.type === 'interactive') {
                  text = msg.interactive?.button_reply?.title
                    ?? msg.interactive?.list_reply?.title
                    ?? ''
                } else {
                  // Unsupported type (image, document etc.) — acknowledge politely
                  text = '[medya mesajı]'
                }

                if (text) {
                  console.log(`[WA Webhook] Message from +${from}: "${text.slice(0, 80)}"`)
                  await handleIncomingWhatsAppMessage(clinic.id, `+${from}`, text)
                }
              }
            }
          }
        } catch (err: any) {
          console.error('[WA Webhook] Async processing error:', err.message)
        }
      })()

      return { status: 'ok' }
    } catch (err: any) {
      console.error('[WA Webhook] Parse error:', err.message)
      set.status = 200  // Always return 200 to Meta
      return { status: 'ok' }
    }
  })

  // ── Users API (admin) ──────────────────────────────────────────────────────
  .get('/api/admin/users', async () => {
    const { listUsers } = await import('./db/repositories/users')
    return await listUsers()
  })

  // ── Dental Calendar API ────────────────────────────────────────────────────
  .get('/api/dental/doctors', async () => {
    const { db } = await import('./db/client')
    const { users } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    return db.select({ id: users.id, name: users.name, specialty: users.specialty, color: users.color, active: users.active })
      .from(users).where(eq(users.role, 'hekim'))
  })
  .post('/api/dental/doctors', async ({ body, set }) => {
    const { createUser } = await import('./db/repositories/users')
    const b = body as any
    if (!b.name || !b.specialty) { set.status = 400; return { error: 'Name and specialty required' } }
    const hash = await Bun.password.hash('Hekim123!')
    const user = await createUser({ email: `hekim.${Date.now()}@klinik.com`, passwordHash: hash, name: b.name, role: 'hekim' })
    const { db } = await import('./db/client')
    const { users } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    await db.update(users).set({ specialty: b.specialty, color: b.color || '#60a5fa' }).where(eq(users.id, user.id))
    return { id: user.id, name: user.name, specialty: b.specialty, color: b.color || '#60a5fa', active: true }
  })
  .get('/api/dental/appointments', async ({ query }) => {
    const { listDentalAppointments } = await import('./db/repositories/dental')
    return await listDentalAppointments(query.date as string | undefined)
  })
  .post('/api/dental/appointments', async ({ body, set }) => {
    const { createDentalAppointment } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.patientId || !b.title || !b.startTime || !b.endTime) {
      set.status = 400; return { error: 'Missing required fields' }
    }
    return await createDentalAppointment({
      patientId: b.patientId, doctorId: b.doctorId || null, title: b.title,
      startTime: new Date(b.startTime), endTime: new Date(b.endTime),
      status: b.status, type: b.type, notes: b.notes,
    })
  })
  .delete('/api/dental/appointments/:id', async ({ params, set }) => {
    const { deleteDentalAppointment } = await import('./db/repositories/dental')
    const ok = await deleteDentalAppointment(params.id)
    if (!ok) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })
  .put('/api/dental/appointments/:id', async ({ params, body, set }) => {
    const { updateDentalAppointment } = await import('./db/repositories/dental')
    const b = body as Record<string, unknown>
    const updated = await updateDentalAppointment(params.id, {
      doctorId: b.doctorId !== undefined ? (b.doctorId as string | null) : undefined,
      timeConfirmed: b.timeConfirmed !== undefined ? (b.timeConfirmed as boolean) : undefined,
      status: b.status as string | undefined,
      startTime: b.startTime ? new Date(b.startTime as string) : undefined,
      endTime: b.endTime ? new Date(b.endTime as string) : undefined,
      type: b.type as string | undefined,
      complaint: b.complaint as string | undefined,
      notes: b.notes as string | undefined,
    })
    if (!updated) { set.status = 404; return { error: 'Not found' } }
    return updated
  })
  .get('/api/dental/payments', async ({ query }) => {
    const { listAllPayments } = await import('./db/repositories/dental')
    return await listAllPayments({
      page: Number((query as any).page || 1),
      pageSize: Number((query as any).pageSize || 25),
      status: (query as any).status,
      search: (query as any).search,
    })
  })
  .put('/api/dental/payments/:id', async ({ params, body, set }) => {
    const { updatePayment } = await import('./db/repositories/dental')
    const b = body as Record<string, unknown>
    const updated = await updatePayment(params.id, {
      date: b.date as string | undefined,
      amount: b.amount !== undefined ? Number(b.amount) : undefined,
      method: b.method as string | undefined,
      notes: b.notes as string | undefined,
      status: b.status as string | undefined,
      dueDate: b.dueDate !== undefined ? (b.dueDate as string | null) : undefined,
      treatmentPlanId: b.treatmentPlanId !== undefined ? (b.treatmentPlanId as string | null) : undefined,
    })
    if (!updated) { set.status = 404; return { error: 'Not found' } }
    return updated
  })
  .delete('/api/dental/payments/:id', async ({ params, set }) => {
    const { deletePayment } = await import('./db/repositories/dental')
    const ok = await deletePayment(params.id)
    if (!ok) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })
  .get('/api/dental/patients', async () => {
    const { listPatients } = await import('./db/repositories/dental')
    return await listPatients()
  })
  .post('/api/dental/patients', async ({ body, set }) => {
    const { createPatient } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.name) { set.status = 400; return { error: 'Name required' } }
    return await createPatient({ 
      name: b.name, 
      phone: b.phone, 
      email: b.email,
      tcIdentity: b.tcIdentity,
      gender: b.gender,
      birthDate: b.birthDate,
      balance: b.balance 
    })
  })
  .post("/api/dental/patients/bulk", async ({ body, set }) => {
    const { createPatientsBulk } = await import("./db/repositories/dental")
    const b = body as any
    if (!b.patients || !Array.isArray(b.patients)) { set.status = 400; return { error: "Geçersiz veri" } }
    return await createPatientsBulk(b.patients)
  })
  .get('/api/dental/patients/:id', async ({ params, set }) => {
    const { getPatient } = await import('./db/repositories/dental')
    const p = await getPatient(params.id)
    if (!p) { set.status = 404; return { error: 'Patient not found' } }
    return p
  })
  .get('/api/dental/patients/:id/profile', async ({ params, set }) => {
    const { getPatientFullProfile } = await import('./db/repositories/dental')
    const p = await getPatientFullProfile(params.id)
    if (!p) { set.status = 404; return { error: 'Patient not found' } }
    return p
  })
  .put('/api/dental/patients/:id', async ({ params, body, set }) => {
    const { db } = await import('./db/client')
    const { patients } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const b = body as any
    const updateData: any = {}
    if (b.phone !== undefined) updateData.phone = b.phone
    if (b.email !== undefined) updateData.email = b.email
    if (b.whatsappOptOut !== undefined) updateData.whatsappOptOut = b.whatsappOptOut
    if (b.smsOptOut !== undefined) updateData.smsOptOut = b.smsOptOut
    if (b.emailOptOut !== undefined) updateData.emailOptOut = b.emailOptOut
    if (Object.keys(updateData).length === 0) return { success: true }
    
    await db.update(patients).set(updateData).where(eq(patients.id, params.id))
    return { success: true }
  })
  .get('/api/dental/patients/:id/treatment-groups', async ({ params }) => {
    const { getPatientTreatmentGroups } = await import('./db/repositories/dental')
    return await getPatientTreatmentGroups(params.id)
  })
  .post('/api/dental/patients/:id/treatment-groups', async ({ params, body, set }) => {
    const { createTreatmentGroup } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.name) { set.status = 400; return { error: 'name gerekli' } }
    return await createTreatmentGroup({ patientId: params.id, name: b.name, description: b.description })
  })
  .put("/api/dental/treatment-groups/:id/full", async ({ params, body, set }) => {
    const { updateTreatmentGroupFull } = await import("./db/repositories/dental")
    const b = body as any
    if (!b.name || !b.patientId || !b.treatments) { set.status = 400; return { error: "Missing fields" } }
    return await updateTreatmentGroupFull(params.id, { name: b.name, description: b.description, patientId: b.patientId, treatments: b.treatments })
  })
  .put('/api/dental/treatment-groups/:id', async ({ params, body }) => {
    const { updateTreatmentGroup } = await import('./db/repositories/dental')
    const b = body as any
    return await updateTreatmentGroup(params.id, { name: b.name, description: b.description, status: b.status })
  })
  .delete('/api/dental/treatment-groups/:id', async ({ params, set }) => {
    const { deleteTreatmentGroup } = await import('./db/repositories/dental')
    const success = await deleteTreatmentGroup(params.id)
    if (!success) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })
  .get('/api/dental/patients/:id/treatments', async ({ params }) => {
    const { getPatientTreatments, getPatientTreatmentGroups } = await import('./db/repositories/dental')
    const treatments = await getPatientTreatments(params.id)
    const groups = await getPatientTreatmentGroups(params.id)
    return { treatments, groups: groups.groups }
  })
  .post('/api/dental/patients/:id/treatments/bulk', async ({ params, body, set }) => {
    const { createTreatmentGroup, createTreatmentPlan } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.treatments || !Array.isArray(b.treatments)) { set.status = 400; return { error: 'Missing treatments array' } }
    
    // Create treatment group
    const groupName = b.groupName || `Tedavi Planı - ${new Date().toLocaleDateString('tr-TR')}`
    const group = await createTreatmentGroup({ patientId: params.id, name: groupName })
    if (!group) { set.status = 500; return { error: 'Failed to create group' } }
    
    const results = []
    
    const { db } = await import('./db/client')
    const { inventoryItems, inventoryMovements, materialUsages, expenses } = await import('./db/schema')
    const { eq, sql } = await import('drizzle-orm')
    
    for (const t of b.treatments) {
      const treatmentResult = await createTreatmentPlan({
        patientId: params.id,
        doctorId: t.doctorId || b.doctorId,
        procedureName: t.procedureName,
        toothNumber: t.toothNumber,
        indication: t.indication,
        cost: t.cost,
        status: t.status || 'planned',
        dcmUrl: t.dcmUrl,
        clinicId: t.clinicId || b.clinicId,
        groupId: group.id,
        isPeriodic: t.isPeriodic,
        periodDays: t.periodDays,
        nextNotificationDate: t.nextNotificationDate,
        notifyPatient: t.notifyPatient,
        notificationType: t.notificationType
      })
      results.push(treatmentResult)
      
      // Process materials for this treatment
      if (t.materials && Array.isArray(t.materials) && t.materials.length > 0) {
        try {
          for (const mat of t.materials) {
            if (!mat.inventoryItemId || !mat.quantity) continue
            await db.update(inventoryItems)
              .set({ quantity: sql`quantity - ${mat.quantity}` })
              .where(eq(inventoryItems.id, mat.inventoryItemId))
            
            await db.insert(inventoryMovements).values({
              itemId: mat.inventoryItemId,
              type: 'cikis',
              quantity: mat.quantity,
              notes: `Tedavi (Toplu): ${t.procedureName}`,
            })
            
            const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, mat.inventoryItemId)).limit(1)
            if (item) {
              if (t.doctorId || b.doctorId) {
                await db.insert(materialUsages).values({
                  doctorId: t.doctorId || b.doctorId,
                  patientId: params.id,
                  inventoryItemId: mat.inventoryItemId,
                  quantity: mat.quantity,
                  date: new Date().toISOString().split('T')[0]
                })
              }
              await db.insert(expenses).values({
                category: 'malzeme',
                itemName: item.name,
                quantity: mat.quantity,
                unitCost: item.costPerUnit,
                totalCost: mat.quantity * item.costPerUnit,
                date: new Date().toISOString().split('T')[0],
                notes: `Tedavi (Toplu): ${t.procedureName}`
              })
            }
          }
        } catch (err) {
          console.error("Error processing materials for bulk:", err)
        }
      }
    }
    
    return { success: true, groupId: group.id, count: results.length }
  })
  .post('/api/dental/patients/:id/treatments', async ({ params, body, set }) => {
    const { createTreatmentPlan } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.procedureName || b.cost === undefined) { set.status = 400; return { error: 'Missing fields' } }
    const treatmentResult = await createTreatmentPlan({ 
      patientId: params.id, 
      doctorId: b.doctorId,
      procedureName: b.procedureName, 
      toothNumber: b.toothNumber, 
      indication: b.indication, 
      cost: b.cost, 
      status: b.status,
      dcmUrl: b.dcmUrl,
      clinicId: b.clinicId,
      groupId: b.groupId,
      isPeriodic: b.isPeriodic,
      periodDays: b.periodDays,
      nextNotificationDate: b.nextNotificationDate,
      notifyPatient: b.notifyPatient,
      notificationType: b.notificationType
    })
    
    // Process used materials if any
    if (b.materials && Array.isArray(b.materials) && b.materials.length > 0) {
      try {
        const { db } = await import('./db/client')
        const { inventoryItems, inventoryMovements, materialUsages, expenses } = await import('./db/schema')
        const { eq, sql } = await import('drizzle-orm')
        
        for (const mat of b.materials) {
          if (!mat.inventoryItemId || !mat.quantity) continue
          
          // Deduct stock
          await db.update(inventoryItems)
            .set({ quantity: sql`quantity - ${mat.quantity}` })
            .where(eq(inventoryItems.id, mat.inventoryItemId))
            
          // Record movement
          await db.insert(inventoryMovements).values({
            itemId: mat.inventoryItemId,
            type: 'cikis',
            quantity: mat.quantity,
            notes: `Tedavi (Modal): ${b.procedureName}`,
          })
          
          // Fetch item to get cost
          const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, mat.inventoryItemId)).limit(1)
          
          if (item) {
            // Record usage
            if (b.doctorId) {
              await db.insert(materialUsages).values({
                doctorId: b.doctorId,
                patientId: params.id,
                inventoryItemId: mat.inventoryItemId,
                quantity: mat.quantity,
                date: new Date().toISOString().split('T')[0]
              })
            }
            
            // Record expense
            await db.insert(expenses).values({
              category: 'malzeme',
              itemName: item.name,
              quantity: mat.quantity,
              unitCost: item.costPerUnit,
              totalCost: mat.quantity * item.costPerUnit,
              date: new Date().toISOString().split('T')[0],
              notes: `Tedavi (Modal): ${b.procedureName}`
            })
          }
        }
      } catch (err) {
        console.error("Error processing materials:", err)
      }
    }
    return treatmentResult;
    
  })
  .get('/api/dental/inventory', async () => {
    const { db } = await import('./db/client')
    const { inventoryItems } = await import('./db/schema')
    return db.select().from(inventoryItems).orderBy(inventoryItems.name)
  })
  .get('/api/dental/patients/:id/consultations', async ({ params }) => {
    const { getPatientConsultations } = await import('./db/repositories/dental')
    return await getPatientConsultations(params.id)
  })
  .post('/api/dental/patients/:id/consultations', async ({ params, body, set }) => {
    const { createConsultation } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.consultationNote && !b.diseaseNote) { set.status = 400; return { error: 'Missing fields' } }
    return await createConsultation({
      patientId: params.id,
      clinicId: b.clinicId || undefined,
      doctorId: b.doctorId || undefined,
      consultationNote: b.consultationNote || "",
      diseaseNote: b.diseaseNote || undefined
    })
  })
  .put('/api/dental/consultations/:id', async ({ params, body }) => {
    const { db } = await import('./db/client')
    const { consultations } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const b = body as any
    const updateData: any = {}
    if (b.consultationNote !== undefined) updateData.consultationNote = b.consultationNote || ""
    if (b.diseaseNote !== undefined) updateData.diseaseNote = b.diseaseNote
    if (Object.keys(updateData).length === 0) return { success: true }
    await db.update(consultations).set(updateData).where(eq(consultations.id, params.id))
    return { success: true }
  })
  .get('/api/dental/clinics/:id/consultations/autocomplete', async ({ params }) => {
    const { getClinicConsultationAutocomplete } = await import('./db/repositories/dental')
    return await getClinicConsultationAutocomplete(params.id)
  })
  .post('/api/dental/upload-dcm', async ({ body, set }) => {
    const MAX_DCM_SIZE = 20 * 1024 * 1024; // 20 MB
    const b = body as any
    if (!b.file) {
      set.status = 400;
      return { error: 'No file uploaded' };
    }
    const file = b.file as File;
    if (!file.name.toLowerCase().endsWith('.dcm')) {
      set.status = 400;
      return { error: 'Only .dcm files are allowed' };
    }
    if (file.size > MAX_DCM_SIZE) {
      set.status = 413;
      return { error: `Dosya boyutu çok büyük (maks ${MAX_DCM_SIZE / 1024 / 1024} MB)` };
    }
    
    const uuid = crypto.randomUUID();
    const fileName = `${uuid}_${file.name}.gz`;
    const filePath = resolve(PUBLIC_DIR, 'uploads/dcm', fileName);
    
    const raw = new Uint8Array(await file.arrayBuffer());
    const compressed = Bun.gzipSync(raw);
    await Bun.write(filePath, compressed);
    
    const savedKB = ((raw.byteLength - compressed.byteLength) / 1024).toFixed(0);
    return { url: `/api/dental/dcm/${fileName}`, originalSize: raw.byteLength, compressedSize: compressed.byteLength, savedKB };
  })
  .get('/api/dental/dcm/:filename', async ({ params, set }) => {
    const safeName = params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const filePath = resolve(PUBLIC_DIR, 'uploads/dcm', safeName);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return { error: 'Dosya bulunamadı' };
    }
    const compressed = new Uint8Array(await file.arrayBuffer());
    const raw = safeName.endsWith('.gz') ? Bun.gunzipSync(compressed) : compressed;
    set.headers['content-type'] = 'application/dicom';
    set.headers['content-disposition'] = `inline; filename="${safeName.replace('.gz', '')}"`;
    return new Response(raw);
  })
  .put('/api/dental/treatments/:id', async ({ params, body }) => {
    const { updateTreatmentPlan } = await import('./db/repositories/dental')
    const b = body as any
    return await updateTreatmentPlan(params.id, { status: b.status, groupId: b.groupId })
  })
  .delete('/api/dental/treatments/:id', async ({ params, set }) => {
    const { deleteTreatmentPlan } = await import('./db/repositories/dental')
    const success = await deleteTreatmentPlan(params.id)
    if (!success) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })
  .get('/api/dental/patients/:id/payments', async ({ params }) => {
    const { getPatientPayments } = await import('./db/repositories/dental')
    return await getPatientPayments(params.id)
  })
  .post('/api/dental/patients/:id/payments', async ({ params, body, set }) => {
    const { createPayment } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.date || !b.amount) { set.status = 400; return { error: 'Missing fields' } }
    return await createPayment({ patientId: params.id, date: b.date, amount: b.amount, method: b.method || 'Nakit', notes: b.notes, status: b.status, dueDate: b.dueDate, treatmentPlanId: b.treatmentPlanId })
  })
  .get('/api/dental/patients/:id/works', async ({ params }) => {
    const { getPatientCompletedWorks } = await import('./db/repositories/dental')
    return await getPatientCompletedWorks(params.id)
  })
  .post('/api/dental/patients/:id/works', async ({ params, body, set }) => {
    const { createCompletedWork } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.doctorId || !b.date || !b.description) { set.status = 400; return { error: 'Missing fields' } }
    return await createCompletedWork({ patientId: params.id, doctorId: b.doctorId, date: b.date, description: b.description })
  })
  .get('/api/dental/patients/:id/consultations', async ({ params }) => {
    const { getPatientConsultations } = await import('./db/repositories/dental')
    return await getPatientConsultations(params.id)
  })
  .post('/api/dental/patients/:id/consultations', async ({ params, body, set }) => {
    const { createConsultation } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.consultationNote && !b.diseaseNote) { set.status = 400; return { error: 'Missing fields' } }
    return await createConsultation({ 
      patientId: params.id, 
      doctorId: b.doctorId || undefined,
      clinicId: b.clinicId || undefined,
      consultationNote: b.consultationNote || "",
      diseaseNote: b.diseaseNote || undefined
    })
  })
  .delete('/api/dental/consultations/:id', async ({ params, set }) => {
    const { deleteConsultation } = await import('./db/repositories/dental')
    const success = await deleteConsultation(params.id)
    if (!success) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })
  .get('/api/dental/patients/:id/diseases', async ({ params }) => {
    const { getPatientDiseases } = await import('./db/repositories/dental')
    return await getPatientDiseases(params.id)
  })
  .post('/api/dental/patients/:id/diseases', async ({ params, body, set }) => {
    const { createPatientDisease } = await import('./db/repositories/dental')
    const b = body as any
    if (!b.name) { set.status = 400; return { error: 'Missing fields' } }
    return await createPatientDisease({ patientId: params.id, name: b.name, notes: b.notes })
  })
  .delete('/api/dental/diseases/:id', async ({ params, set }) => {
    const { deletePatientDisease } = await import('./db/repositories/dental')
    const success = await deletePatientDisease(params.id)
    if (!success) { set.status = 404; return { error: 'Not found' } }
    return { success: true }
  })

  // ── Patient Notes ──────────────────────────────────────────────────────────
  .get('/api/patient-notes', async ({ query }) => {
    const { listPatientNotes } = await import('./db/repositories/dental')
    return await listPatientNotes(query.status as string | undefined)
  })

  .post('/api/patient-notes', async ({ body, set }) => {
    const b = (body ?? {}) as { phone?: string; content?: string; patientId?: string; source?: string }
    if (!b.content || !b.content.trim()) {
      set.status = 400
      return { error: 'Not içeriği zorunludur' }
    }
    const { createPatientNote } = await import('./db/repositories/dental')
    return await createPatientNote({
      phone: b.phone || '',
      content: b.content.trim(),
      patientId: b.patientId,
      source: b.source || 'manual',
    })
  })

  .patch('/api/patient-notes/:id/read', async ({ params, set }) => {
    const { markPatientNoteRead } = await import('./db/repositories/dental')
    const updated = await markPatientNoteRead(params.id)
    if (!updated) { set.status = 404; return { error: 'Not bulunamadı' } }
    return { success: true, note: updated }
  })

  .get('/api/appointments', async () => await readAppointments())

  .delete('/api/appointments/:id', async ({ params, set }) => {
    const deleted = await deleteAppointment(params.id)
    if (!deleted) { set.status = 404; return { error: 'Appointment not found' } }
    return { success: true, id: params.id }
  })

  .get('/api/stats', async () => ({
    activeSessions: sessions.size,
    totalAppointments: (await readAppointments()).length,
    totalRecordings: (await listRecordings()).length,
  }))

  // ── /api/admin/* aliases ─────────────────────────────────────────────────
  .get('/api/admin/stats', async () => ({
    concurrent: { active: sessions.size },
    accounts:   { active: 1 },
    tokens:     { today: 0 },
    appointments: (await readAppointments()).length,
    recordings: (await listRecordings()).length,
  }))

  .get('/api/admin/knowledge', async () => {
    const docs = await listDocs()
    const { total, embedded } = await countEmbedded()
    return { docs, totalEmbedded: embedded, total }
  })

  /** FormData: name?, category?, file? | text? — admin panel quick upload */
  .post('/api/admin/knowledge/upload', async ({ request, set }) => {
    const ALLOWED_CATEGORIES = ['genel', 'servis', 'galeri', 'kampanya', 'sss', 'arac'] as const
    type Category = typeof ALLOWED_CATEGORIES[number]

    let content: string
    let title: string
    try {
      const form = await request.formData()
      const name = String(form.get('name') ?? '').trim()
      const categoryRaw = String(form.get('category') ?? '').trim().toLowerCase()
      const category: Category = (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
        ? (categoryRaw as Category)
        : 'genel'
      const textField = form.get('text')
      const fileEntry = form.get('file')

      if (fileEntry instanceof File && fileEntry.size > 0) {
        title = (name || fileEntry.name || 'Yüklenen belge').slice(0, 200)
        const mime = fileEntry.type || 'application/octet-stream'
        const textMimes = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
        if (textMimes.some(t => mime === t || mime.startsWith(`${t};`))) {
          content = await fileEntry.text()
        } else {
          set.status = 400
          return {
            error:
              'Bu dosya türü için şimdilik yalnızca düz metin desteklenir (.txt, .md, .csv, .json). PDF veya Word için metni kopyalayıp aşağıdaki kutuya yapıştırın.',
          }
        }
      } else if (typeof textField === 'string' && textField.trim()) {
        title = (name || 'Yüklenen metin').slice(0, 200)
        content = textField.trim()
      } else {
        set.status = 400
        return { error: 'Dosya veya metin gerekli' }
      }

      if (content.trim().length < 10) {
        set.status = 400
        return { error: 'İçerik en az 10 karakter olmalı' }
      }

      let embedding: number[] = []
      try {
        embedding = await embedText(content)
      } catch (e) {
        console.error('[RAG] knowledge/upload embedding:', e)
        set.status = 500
        return { error: 'Gömme (embedding) başarısız — GEMINI_API_KEY ayarını kontrol edin.' }
      }

      const doc = await createDoc(
        { category, title, content, callDirection: 'both', active: true },
        embedding,
      )
      return { success: true, id: doc.id, name: doc.title, category: doc.category, message: 'Belge indekslendi' }
    } catch (e) {
      console.error('[Admin] knowledge/upload:', e)
      set.status = 500
      return { error: String(e) }
    }
  })

  .post('/api/admin/knowledge', async ({ body, set }) => {
    const { category, title, content, callDirection, active } = body as any
    if (!category || !title || !content) { set.status = 400; return { error: 'category, title ve content zorunludur' } }
    try {
      let embedding: number[] = []
      try { embedding = await embedText(content) } catch (e) { console.error('[RAG] Embedding hatası:', e) }
      const doc = await createDoc({ category, title, content, callDirection, active: active !== false }, embedding)
      return { success: true, doc }
    } catch (e) { set.status = 500; return { error: String(e) } }
  })

  .delete('/api/admin/knowledge/:id', async ({ params, set }) => {
    const deleted = await deleteDoc(params.id)
    if (!deleted) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, id: params.id }
  })

  .put('/api/admin/knowledge/:id', async ({ params, body, set }) => {
    const { category, title, content, callDirection, active } = body as any
    let newEmbedding: number[] | undefined
    if (content) {
      try { newEmbedding = await embedText(content) } catch (e) { console.error('[RAG] Admin Re-embed hatası:', e); newEmbedding = [] }
    }
    const doc = await updateDoc(params.id, { category, title, content, callDirection, active }, newEmbedding)
    if (!doc) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, doc }
  })

  .patch('/api/admin/knowledge/:id/toggle', async ({ params, set }) => {
    const doc = await toggleDoc(params.id)
    if (!doc) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, doc }
  })

  .post('/api/admin/knowledge/reindex', async () => {
    const docs = await listDocs()
    const results = { success: 0, failed: 0, total: docs.length }
    for (const doc of docs) {
      try {
        const embedding = await embedText(doc.content)
        await updateDocEmbedding(doc.id, embedding)
        results.success++
        console.log(`[RAG] Admin Reindex: "${doc.title}" ✓`)
      } catch (e) { results.failed++; console.error(`[RAG] "${doc.title}":`, e) }
    }
    return { success: true, results }
  })

  .get('/api/telephony/register', ({ query }) => {
    const uuid = query.uuid as string | undefined
    const caller = query.caller as string | undefined
    const channel = query.channel as string | undefined
    const direction = (query.direction as string) || 'inbound'
    if (uuid && caller) {
      callerRegistry.set(uuid, { phone: caller, channel, direction })
      setTimeout(() => callerRegistry.delete(uuid), 5 * 60 * 1000)
    }
    return { ok: true }
  })

  // ── Outbound Calls ─────────────────────────────────────────────────────────
  .post('/api/admin/calls/outbound', async ({ body, set }) => {
    const b = (body ?? {}) as { phone?: string; to?: string; target?: string }
    const phone = b.phone || b.to || b.target
    if (!phone) { set.status = 400; return { error: 'phone numarası zorunludur' } }
    const { getSetting } = await import('./db/repositories/settings')
    const callerId = await getSetting('outbound_caller_id') || '08503096119'
    const { initiateOutboundCall } = await import('./services/asterisk-ami')
    const res = await initiateOutboundCall(phone, callerId)
    if (!res.success) { set.status = 500; return { error: res.message } }
    return { success: true, message: 'Dış arama başlatıldı' }
  })

  .get('/api/events', ({ set }) => {
    const clientId = randomUUID().slice(0, 8)
    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Cache-Control'] = 'no-cache'
    set.headers['Connection'] = 'keep-alive'
    set.headers['Access-Control-Allow-Origin'] = '*'
    return new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (data: string) => controller.enqueue(enc.encode(data))
        const client: SseClient = { id: clientId, send }
        sseClients.add(client)
        send(`: connected ${clientId}\n\n`)
        const hb = setInterval(() => {
          try { send(`: ping\n\n`) } catch { clearInterval(hb); sseClients.delete(client) }
        }, 20000)
        ;(client as any).hb = hb
      },
      cancel() {
        for (const c of sseClients) {
          if (c.id === clientId) { clearInterval((c as any).hb); sseClients.delete(c); break }
        }
      },
    })
  })

  // User-scoped SSE for notifications
  .get('/api/notifications/stream', async ({ cookie, set }) => {
    const { authenticateRequest } = await import('./middleware/auth')
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    set.headers['Content-Type'] = 'text/event-stream'
    set.headers['Cache-Control'] = 'no-cache'
    set.headers['Connection'] = 'keep-alive'

    const { registerSSEClient } = await import('./services/notification')
    return new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (data: string) => { try { controller.enqueue(enc.encode(data)) } catch {} }
        const unregister = registerSSEClient(user.id, send)
        send(`: connected\n\n`)
        const hb = setInterval(() => send(`: ping\n\n`), 25000)
        ;(controller as any).__cleanup = () => { clearInterval(hb); unregister() }
      },
      cancel(controller: any) {
        controller?.__cleanup?.()
      },
    })
  })

  .get('/api/recordings', async () => await listRecordings())

  .get('/api/recordings/:filename', ({ params, set }) => {
    try {
      const filePath = resolve(RECORDINGS_DIR, params.filename)
      if (!filePath.startsWith(RECORDINGS_DIR)) { set.status = 403; return 'Forbidden' }
      set.headers['Content-Type'] = 'audio/wav'
      set.headers['Content-Disposition'] = `inline; filename="${params.filename}"`
      return createReadStream(filePath)
    } catch { set.status = 404; return 'Not found' }
  })

  .delete('/api/recordings/:id', async ({ params, set }) => {
    const deleted = await deleteRecording(params.id)
    if (!deleted) { set.status = 404; return { error: 'Recording not found' } }
    return { success: true, id: params.id }
  })

  // ── Knowledge (RAG) endpoints ─────────────────────────────────────────────
  .get('/api/knowledge', async () => {
    const docs = await listDocs()
    const { total, embedded } = await countEmbedded()
    return { docs, totalEmbedded: embedded, total }
  })

  .post('/api/knowledge', async ({ body, set }) => {
    const { category, title, content, callDirection, active } = body as any
    if (!category || !title || !content) { set.status = 400; return { error: 'category, title ve content zorunludur' } }
    try {
      let embedding: number[] = []
      try { embedding = await embedText(content) } catch (e) { console.error('[RAG] Embedding hatası:', e) }
      const doc = await createDoc({ category, title, content, callDirection, active: active !== false }, embedding)
      return { success: true, doc }
    } catch (e) { set.status = 500; return { error: String(e) } }
  })

  .put('/api/knowledge/:id', async ({ params, body, set }) => {
    const { category, title, content, callDirection, active } = body as any
    let newEmbedding: number[] | undefined
    if (content) {
      try { newEmbedding = await embedText(content) } catch (e) { console.error('[RAG] Re-embed hatası:', e); newEmbedding = [] }
    }
    const doc = await updateDoc(params.id, { category, title, content, callDirection, active }, newEmbedding)
    if (!doc) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, doc }
  })

  .delete('/api/knowledge/:id', async ({ params, set }) => {
    const deleted = await deleteDoc(params.id)
    if (!deleted) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, id: params.id }
  })

  .patch('/api/knowledge/:id/toggle', async ({ params, set }) => {
    const doc = await toggleDoc(params.id)
    if (!doc) { set.status = 404; return { error: 'Belge bulunamadı' } }
    return { success: true, doc }
  })

  .post('/api/knowledge/reindex', async () => {
    const docs = await listDocs()
    const results = { success: 0, failed: 0, total: docs.length }
    for (const doc of docs) {
      try {
        const embedding = await embedText(doc.content)
        await updateDocEmbedding(doc.id, embedding)
        results.success++
        console.log(`[RAG] Reindex: "${doc.title}" ✓`)
      } catch (e) { results.failed++; console.error(`[RAG] "${doc.title}":`, e) }
    }
    return { success: true, results }
  })

  // ── Google Calendar OAuth ──────────────────────────────────────────────────
  // Sabit callback URL (Google Console'a kayıtlı) + state parametresi ile
  // dinamik geri dönüş orijini. Böylece kullanıcı localhost, ngrok-X, ngrok-Y
  // gibi farklı kaynaklardan OAuth başlatsa bile flow tek bir kayıtlı URI ile
  // çalışır ve sonunda geldiği yere döner.
  .get('/api/admin/settings/calendar/auth', ({ request, set }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    if (!clientId) {
      set.status = 400
      return { error: 'GOOGLE_OAUTH_CLIENT_ID tanımlı değil' }
    }

    const redirectUri =
      process.env.OAUTH_REDIRECT_URI
      || `${process.env.APP_URL || 'http://localhost:3001'}/api/admin/settings/calendar/callback`

    // Kullanıcının geldiği orijini state'e koy (token alındıktan sonra dönüş için)
    const referer = request.headers.get('referer') || request.headers.get('origin') || ''
    let returnOrigin = process.env.CLIENT_APP_URL || 'http://localhost:3000'
    try { if (referer) returnOrigin = new URL(referer).origin } catch {}
    const state = Buffer.from(JSON.stringify({ returnOrigin })).toString('base64url')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }
  })

  .get('/api/admin/settings/calendar/callback', async ({ query, redirect, set }) => {
    const code = query.code as string
    const stateRaw = query.state as string | undefined
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!

    // state'ten dönüş orijinini çöz, fallback olarak env'i kullan
    let clientUrl = process.env.CLIENT_APP_URL || 'http://localhost:3000'
    if (stateRaw) {
      try {
        const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
        if (typeof parsed.returnOrigin === 'string') clientUrl = parsed.returnOrigin
      } catch {}
    }

    const redirectUri =
      process.env.OAUTH_REDIRECT_URI
      || `${process.env.APP_URL || 'http://localhost:3001'}/api/admin/settings/calendar/callback`

    if (!code) {
      set.status = 400
      return redirect(`${clientUrl}/admin?calendar=error`)
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      })
      const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; error?: string; error_description?: string }
      if (tokens.error) {
        console.error('[Calendar] Token exchange hatası:', tokens.error, tokens.error_description)
        return redirect(`${clientUrl}/admin?calendar=error&reason=${encodeURIComponent(tokens.error)}`)
      }
      const patch: { refreshToken?: string; email?: string } = {}
      if (tokens.refresh_token) patch.refreshToken = tokens.refresh_token
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const userInfo = await userRes.json() as { email?: string }
        if (userInfo.email) patch.email = userInfo.email
      } catch {}
      await setCalendarSettings(patch)
      console.log('[Calendar] OAuth bağlantısı kuruldu:', patch.email)
      return redirect(`${clientUrl}/admin?calendar=connected`)
    } catch (e) {
      console.error('[Calendar] OAuth callback hatası:', e)
      return redirect(`${clientUrl}/admin?calendar=error`)
    }
  })

  .get('/api/admin/settings/calendar/status', async () => {
    const s = await getCalendarSettings()
    return {
      connected: !!s.refreshToken,
      authType: s.refreshToken ? 'oauth2' : null,
      email: s.email ?? null,
      calendarId: s.calendarId ?? null,
    }
  })

  .delete('/api/admin/settings/calendar/disconnect', async () => {
    await disconnectCalendar()
    return { success: true }
  })

  .post('/api/admin/settings/calendar', async ({ body }) => {
    const { calendarId } = body as { calendarId: string }
    await setCalendarSettings({ calendarId })
    return { success: true }
  })

  .put('/api/admin/settings/calendar', async ({ body }) => {
    const { calendarId } = body as { calendarId: string }
    await setCalendarSettings({ calendarId })
    return { success: true }
  })

  .get('/api/admin/settings/calendar/calendars', async () => {
    try {
      const s = await getCalendarSettings()
      if (!s.refreshToken) return { calendars: [] }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: s.refreshToken,
          client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        }),
      })
      const { access_token } = await tokenRes.json() as { access_token: string }
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const data = await calRes.json() as { items?: Array<{ id: string; summary: string }> }
      return { calendars: (data.items ?? []).map(c => ({ id: c.id, name: c.summary })) }
    } catch { return { calendars: [] } }
  })

  // ── AI Model Settings ───────────────────────────────────────────────────────
  .get('/api/admin/settings/ai', async () => {
    return {
      current: await resolveLiveModel(),
      default: DEFAULT_LIVE_MODEL,
      available: ALLOWED_LIVE_MODELS,
    }
  })

  .put('/api/admin/settings/ai', async ({ body, set }) => {
    const { model } = (body ?? {}) as { model?: string }
    if (!model || !(ALLOWED_LIVE_MODELS as readonly string[]).includes(model)) {
      set.status = 400
      return { error: 'Geçersiz model. İzin verilen: ' + ALLOWED_LIVE_MODELS.join(', ') }
    }
    const saved = await setAiModel(model)
    return { success: true, ...saved }
  })

  // ── Greeting Settings ─────────────────────────────────────────────────────
  .get('/api/admin/settings/greeting', async () => {
    const greeting = await getGreeting('inbound')
    const greetingOutbound = await getGreeting('outbound')
    return {
      greeting: greeting ?? DEFAULT_GREETING,
      greetingOutbound: greetingOutbound ?? DEFAULT_GREETING
    }
  })

  .put('/api/admin/settings/greeting', async ({ body, set }) => {
    const { greeting, greetingOutbound } = (body ?? {}) as { greeting?: string; greetingOutbound?: string }
    let updatedInbound = undefined
    let updatedOutbound = undefined
    if (greeting !== undefined) {
      if (greeting.trim().length < 3) {
        set.status = 400
        return { error: 'Gelen Karşılama mesajı en az 3 karakter olmalıdır.' }
      }
      await setGreeting(greeting.trim(), 'inbound')
      updatedInbound = greeting.trim()
    }
    if (greetingOutbound !== undefined) {
      if (greetingOutbound.trim().length < 3) {
        set.status = 400
        return { error: 'Giden Karşılama mesajı en az 3 karakter olmalıdır.' }
      }
      await setGreeting(greetingOutbound.trim(), 'outbound')
      updatedOutbound = greetingOutbound.trim()
    }
    return { success: true, greeting: updatedInbound, greetingOutbound: updatedOutbound }
  })

  // ── Outbound Caller ID Settings ──────────────────────────────────────────────
  .get('/api/admin/settings/outbound-caller-id', async () => {
    const { getOutboundCallerId } = await import('./db/repositories/settings')
    return { callerId: await getOutboundCallerId() }
  })

  .put('/api/admin/settings/outbound-caller-id', async ({ body, set }) => {
    const { callerId } = (body ?? {}) as { callerId?: string }
    if (!callerId) {
      set.status = 400
      return { error: 'Caller ID boş olamaz.' }
    }
    const { setOutboundCallerId } = await import('./db/repositories/settings')
    const saved = await setOutboundCallerId(callerId)
    return { success: true, ...saved }
  })

  // ── Connection Mode Settings ─────────────────────────────────────────────────
  .get('/api/admin/settings/connection-mode', async () => {
    const mode = await getConnectionMode()
    return { mode }
  })

  .put('/api/admin/settings/connection-mode', async ({ body, set }) => {
    const { mode } = (body ?? {}) as { mode?: string }
    if (mode !== 'server' && mode !== 'direct') {
      set.status = 400
      return { error: 'Geçersiz mod. İzin verilen: server, direct' }
    }
    const saved = await setConnectionMode(mode)
    return { success: true, ...saved }
  })

  // ── Branding Settings ──────────────────────────────────────────────────────
  .get('/api/admin/settings/branding', async () => {
    return getBranding()
  })

  .put('/api/admin/settings/branding', async ({ body, set }) => {
    const { title, subtitle, logoUrl } = (body ?? {}) as { title?: string; subtitle?: string; logoUrl?: string }
    if (!title && !subtitle && !logoUrl) {
      set.status = 400
      return { error: 'En az bir alan gerekli (title, subtitle, logoUrl)' }
    }
    const result = await setBranding({ title, subtitle, logoUrl })
    return { success: true, ...result }
  })

  // ── Prompt Section Settings ─────────────────────────────────────────────────
  .get('/api/admin/settings/prompts', async () => {
    const dbSections = await getAllPromptSections()
    return PROMPT_SECTIONS.map(section => ({
      key: section.key,
      label: section.label,
      description: section.description,
      sortOrder: section.sortOrder,
      value: dbSections[section.key]?.value ?? section.defaultValue,
      isCustom: !!dbSections[section.key],
      updatedAt: dbSections[section.key]?.updatedAt ?? null,
    }))
  })

  .put('/api/admin/settings/prompts/:key', async ({ params, body, set }) => {
    const { key } = params
    const { value } = (body ?? {}) as { value?: string }
    if (!key.startsWith('prompt.')) { set.status = 400; return { error: 'Geçersiz key' } }
    if (!value || value.trim().length < 5) { set.status = 400; return { error: 'Değer en az 5 karakter olmalı' } }
    await setPromptSection(key, value.trim())
    return { success: true, key, updatedAt: new Date().toISOString() }
  })

  .delete('/api/admin/settings/prompts/:key', async ({ params, set }) => {
    const { key } = params
    if (!key.startsWith('prompt.')) { set.status = 400; return { error: 'Geçersiz key' } }
    await resetPromptSection(key)
    const defaultVal = getDefaultPromptValue(key)
    return { success: true, key, value: defaultVal }
  })

  .post('/api/admin/settings/prompts/preview', async () => {
    const greeting = await getGreeting() ?? DEFAULT_GREETING
    const dateHeader = `BUGÜNÜN TARİHİ: ${getTodayTurkish()}. Randevu tarihlerini söylerken mutlaka bu tarihe göre gün hesapla — asla tahmin yapma.\n\n`
    const prompt = await buildSystemPrompt(greeting)
    return { prompt: dateHeader + prompt }
  })

  // ── Transfer Phonebook Settings ─────────────────────────────────────────────
  .get('/api/admin/settings/transfer-phonebook', async () => {
    const { getSetting } = await import('./db/repositories/settings')
    const raw = await getSetting('transfer.phonebook')
    if (!raw) {
      // Default phonebook seeds if not configured yet
      return [
        { label: 'Resepsiyon', number: '08503096119' },
        { label: 'Banko', number: '08503096119' },
        { label: 'Acil Hat', number: '08503096119' }
      ]
    }
    try { return JSON.parse(raw) } catch { return [] }
  })

  .put('/api/admin/settings/transfer-phonebook', async ({ body, set }) => {
    const { phonebook } = (body ?? {}) as { phonebook?: Array<{ label: string; number: string }> }
    if (!Array.isArray(phonebook)) {
      set.status = 400
      return { error: 'phonebook dizisi zorunludur' }
    }
    const { setSetting } = await import('./db/repositories/settings')
    await setSetting('transfer.phonebook', JSON.stringify(phonebook))
    return { success: true, phonebook }
  })

  // ── Tool Description Settings ───────────────────────────────────────────────
  .get('/api/admin/settings/tools', async () => {
    const { getToolDescriptions } = await import('./db/repositories/settings')
    const { TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, getDefaultToolDescription } = await import('./data/default-tools')
    const dbDescs = await getToolDescriptions()
    const allItems = [
      ...TOOL_DESCRIPTIONS.map(t => ({
        key: t.key,
        toolName: t.toolName,
        label: t.label,
        type: 'tool' as const,
        value: dbDescs[t.key] ?? t.defaultDescription,
        isCustom: !!dbDescs[t.key],
      })),
      ...TOOL_PARAM_DESCRIPTIONS.map(p => ({
        key: p.key,
        toolName: p.toolName,
        label: `${p.toolName} → ${p.label}`,
        type: 'param' as const,
        value: dbDescs[p.key] ?? p.defaultDescription,
        isCustom: !!dbDescs[p.key],
      })),
    ]
    // Include custom_fields entry so frontend can load it
    if (dbDescs['tools.custom_fields']) {
      allItems.push({
        key: 'tools.custom_fields',
        toolName: 'randevuOlustur',
        label: 'Özel Alanlar JSON',
        type: 'param' as const,
        value: dbDescs['tools.custom_fields'],
        isCustom: true,
      })
    }
    return allItems
  })

  .put('/api/admin/settings/tools/:key', async ({ params, body, set }) => {
    const { key } = params
    const { value } = (body ?? {}) as { value?: string }
    if (!key.startsWith('tools.')) { set.status = 400; return { error: 'Geçersiz key' } }
    if (!value) { set.status = 400; return { error: 'Değer boş olamaz' } }
    // custom_fields can be "[]" (2 chars), other keys need 3+
    if (key !== 'tools.custom_fields' && value.trim().length < 3) { set.status = 400; return { error: 'Değer en az 3 karakter olmalı' } }
    const { setToolDescription } = await import('./db/repositories/settings')
    await setToolDescription(key, value.trim())
    return { success: true, key, updatedAt: new Date().toISOString() }
  })

  .delete('/api/admin/settings/tools/:key', async ({ params, set }) => {
    const { key } = params
    if (!key.startsWith('tools.')) { set.status = 400; return { error: 'Geçersiz key' } }
    const { resetToolDescription } = await import('./db/repositories/settings')
    const { getDefaultToolDescription } = await import('./data/default-tools')
    await resetToolDescription(key)
    return { success: true, key, value: getDefaultToolDescription(key) }
  })

  // ── Voice AI Settings ────────────────────────────────────────────────────────
  .get('/api/admin/settings/voice', async () => {
    const { getSetting } = await import('./db/repositories/settings')
    return {
      googleSearchGrounding: (await getSetting('ai.google_search_grounding')) === 'true',
      codeExecution: (await getSetting('ai.code_execution')) === 'true',
      urlContext: (await getSetting('ai.url_context')) === 'true',
      
      startWaitSeconds: Number(await getSetting('ai.start_wait_seconds')) || 0.4,
      startOnPunctuationSeconds: Number(await getSetting('ai.start_punctuation_seconds')) || 0.1,
      startNoPunctuationSeconds: Number(await getSetting('ai.start_no_punctuation_seconds')) || 1.5,
      
      stopNumWords: Number(await getSetting('ai.stop_num_words')) || 0,
      stopVoiceSeconds: Number(await getSetting('ai.stop_voice_seconds')) || 0.2,
      stopBackoffSeconds: Number(await getSetting('ai.stop_backoff_seconds')) || 0.2,
      
      callSilenceTimeout: Number(await getSetting('ai.call_silence_timeout')) || 30,
      callMaxDuration: Number(await getSetting('ai.call_max_duration')) || 600,
      voiceName: (await getSetting('ai.voice_name')) || 'Aoede',
    }
  })
  .put('/api/admin/settings/voice', async ({ body }) => {
    const { setSetting } = await import('./db/repositories/settings')
    const config = body as any
    if (config.googleSearchGrounding !== undefined) await setSetting('ai.google_search_grounding', String(config.googleSearchGrounding))
    if (config.codeExecution !== undefined) await setSetting('ai.code_execution', String(config.codeExecution))
    if (config.urlContext !== undefined) await setSetting('ai.url_context', String(config.urlContext))
    
    if (config.startWaitSeconds !== undefined) await setSetting('ai.start_wait_seconds', String(config.startWaitSeconds))
    if (config.startOnPunctuationSeconds !== undefined) await setSetting('ai.start_punctuation_seconds', String(config.startOnPunctuationSeconds))
    if (config.startNoPunctuationSeconds !== undefined) await setSetting('ai.start_no_punctuation_seconds', String(config.startNoPunctuationSeconds))
    
    if (config.stopNumWords !== undefined) await setSetting('ai.stop_num_words', String(config.stopNumWords))
    if (config.stopVoiceSeconds !== undefined) await setSetting('ai.stop_voice_seconds', String(config.stopVoiceSeconds))
    if (config.stopBackoffSeconds !== undefined) await setSetting('ai.stop_backoff_seconds', String(config.stopBackoffSeconds))
    
    if (config.callSilenceTimeout !== undefined) await setSetting('ai.call_silence_timeout', String(config.callSilenceTimeout))
    if (config.callMaxDuration !== undefined) await setSetting('ai.call_max_duration', String(config.callMaxDuration))
    if (config.voiceName !== undefined) await setSetting('ai.voice_name', String(config.voiceName))
    
    return { success: true }
  })

  .get('/api/admin/settings/roles', async () => {
    const { getSetting } = await import('./db/repositories/settings')
    let permsStr = await getSetting('role_tab_permissions')
    let perms = {}
    if (permsStr) {
      try { perms = JSON.parse(permsStr) } catch (e) {}
    } else {
      // Default permissions if none exist
      perms = {
        hekim: ['calendar', 'patients', 'knowledge'],
        sekreter: ['calendar', 'patients', 'payments'],
        asistan: ['calendar', 'patients']
      }
    }
    return perms
  })
  .put('/api/admin/settings/roles', async ({ body }) => {
    const { setSetting } = await import('./db/repositories/settings')
    await setSetting('role_tab_permissions', JSON.stringify(body))
    return { success: true }
  })

  // ── Knowledge Categories ────────────────────────────────────────────────────
  .get('/api/admin/categories', async () => {
    return await listCategories()
  })

  .post('/api/admin/categories', async ({ body, set }) => {
    const { slug, label, icon, color, sortOrder } = (body ?? {}) as {
      slug?: string; label?: string; icon?: string; color?: string; sortOrder?: number
    }
    if (!slug || !label) { set.status = 400; return { error: 'slug ve label zorunludur' } }
    if (!/^[a-z0-9_-]+$/.test(slug)) { set.status = 400; return { error: 'slug sadece küçük harf, rakam, tire ve alt çizgi içerebilir' } }
    try {
      const cat = await createCategory({ slug, label, icon, color, sortOrder })
      return cat
    } catch (e: any) {
      if (e?.message?.includes('unique') || e?.code === '23505') {
        set.status = 409; return { error: 'Bu slug zaten mevcut' }
      }
      throw e
    }
  })

  .put('/api/admin/categories/:id', async ({ params, body, set }) => {
    const { label, icon, color, sortOrder } = (body ?? {}) as {
      label?: string; icon?: string; color?: string; sortOrder?: number
    }
    const updated = await updateCategory(params.id, { label, icon, color, sortOrder })
    if (!updated) { set.status = 404; return { error: 'Kategori bulunamadı' } }
    return updated
  })

  .delete('/api/admin/categories/:id', async ({ params }) => {
    return await deleteCategory(params.id)
  })

  // ── Conversation Flow API ─────────────────────────────────────────────────
  .get('/api/admin/flow', async ({ query }) => {
    const { getActiveFlow } = await import('./db/repositories/flows')
    const direction = (query.direction as string) || 'inbound'
    const flow = await getActiveFlow(direction)
    return flow ?? { nodes: [], edges: [] }
  })

  .put('/api/admin/flow', async ({ body, query, set }) => {
    const { nodes, edges } = (body ?? {}) as { nodes?: unknown[]; edges?: unknown[] }
    const direction = (query.direction as string) || 'inbound'
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      set.status = 400
      return { error: 'nodes ve edges array olmalı' }
    }
    const { saveFlow } = await import('./db/repositories/flows')
    const flow = await saveFlow(nodes as any[], edges as any[], direction)
    return { success: true, flow }
  })

  // ── Direct Mode: Session Config ──────────────────────────────────────────────
  // Client bağlanmadan önce dinamik system prompt, RAG context ve tool declarations alır
  .get('/api/direct-session-config', async () => {
    const { buildToolDeclarations } = await import('./gemini')
    const greeting = await getGreeting() ?? DEFAULT_GREETING
    const dateHeader = `BUGÜNÜN TARİHİ: ${getTodayTurkish()}. Randevu tarihlerini söylerken mutlaka bu tarihe göre gün hesapla — asla tahmin yapma.\n\n`
    const systemPrompt = dateHeader + await buildSystemPrompt(greeting)

    // RAG pre-warm
    let ragContext = ''
    try {
      const preWarmEmbedding = await embedText(PRE_WARM_QUERY)
      const topDocs = await retrieveDocsByEmbedding(preWarmEmbedding, 5)
      if (topDocs.length > 0) {
        ragContext = await buildRagPrompt(topDocs)
      }
    } catch { /* ignore */ }

    const toolDeclarations = (await buildToolDeclarations())
      .filter(t => t.name !== 'cagriySonlandir')
    const model = await resolveLiveModel()
    const branding = await getBranding()

    return {
      systemPrompt: systemPrompt + ragContext,
      toolDeclarations,
      model,
      greeting,
      branding,
    }
  })

  // ── Direct Mode: Tool Call HTTP Endpoints ───────────────────────────────────
  // Bu endpoint'ler doğrudan (direct) modda çalışan client-side Gemini
  // bağlantısının tool call'larını karşılar. Ses direkt Gemini'ye gider,
  // ama tool call'lar bu HTTP endpoint'ler üzerinden sunucuya gelir.

  .post('/api/tools/search-knowledge', async ({ body, set }) => {
    const { sorgu } = (body ?? {}) as { sorgu?: string }
    if (!sorgu?.trim()) { set.status = 400; return { error: 'sorgu parametresi zorunlu' } }
    try {
      const { searchKnowledge } = await import('./services/knowledge')
      const results = await searchKnowledge(sorgu, 5)
      if (results.length === 0) return { sonuc: 'Bilgi tabanında ilgili bilgi bulunamadı.' }
      const content = results
        .map((r, i) => `[${i + 1}] (${r.documentName})\n${r.chunkText}`)
        .join('\n\n---\n\n')
      return { sonuc: content }
    } catch (err) {
      console.error('[Tools/Knowledge]', err)
      return { sonuc: 'Bilgi tabanı şu an kullanılamıyor.' }
    }
  })

  .post('/api/tools/customer-query', async ({ body, set }) => {
    const { telefon } = (body ?? {}) as { telefon?: string }
    if (!telefon?.trim()) { set.status = 400; return { error: 'telefon parametresi zorunlu' } }
    const digits = telefon.replace(/\D/g, '')
    if (digits.length < 10) return { sonuc: 'Geçerli bir telefon numarası değil. En az 10 hane gerekli.' }
    try {
      const customer = await getCustomerByPhone(telefon)
      if (!customer) {
        const knowledgeCustomer = await findCustomerDocByPhone(telefon)
        if (knowledgeCustomer) {
          return { kayitli: true, musteri_adi: knowledgeCustomer.name, sonuc: `Ad Soyad: ${knowledgeCustomer.name}\n${knowledgeCustomer.content}` }
        }
        return { kayitli: false, sonuc: 'Bu numara ile kayıtlı müşteri bulunamadı.' }
      }
      const info: string[] = [`Ad Soyad: ${customer.name}`, `Telefon: ${customer.phone}`]
      const pastAppointments = customer.appointmentHistory.filter(a => a.isPast)
      if (pastAppointments.length > 0) {
        const last = pastAppointments[0]
        info.push(`Son Randevu: ${last.date} ${last.time} — ${last.issueOrRequest || last.type}`)
      }
      const vehicleInfo = customer.appointmentHistory.find(a => a.vehicleInfo)?.vehicleInfo
      if (vehicleInfo) info.push(`Araç: ${vehicleInfo}`)
      return { kayitli: true, musteri_adi: customer.name, sonuc: info.join('\n') }
    } catch (err) {
      console.error('[Tools/CustomerQuery]', err)
      return { kayitli: false, sonuc: 'Müşteri sorgu servisi şu an kullanılamıyor.' }
    }
  })

  .post('/api/tools/create-appointment', async ({ body, set }) => {
    const args = (body ?? {}) as Record<string, string>
    const name = args.musteri_adi || args.ad_soyad || args.hasta_adi || ''
    const phone = args.telefon || args.phone || ''
    const tarih = args.tarih || args.date || ''
    const saat = args.saat || args.time || ''
    const type = args.randevu_turu || args.islem_turu || args.tur || 'kontrol'

    if (!name || name.length < 2) return { success: false, message: 'Müşteri adı zorunludur; müşteriden adını soyadını sor.' }
    if (!phone || phone.replace(/\D/g, '').length < 10) return { success: false, message: 'Geçerli telefon numarası zorunludur (en az 10 hane).' }
    if (!tarih || !saat) return { success: false, message: 'Tarih ve saat zorunludur.' }

    try {
      const { createFlowAppointment } = await import('./db/repositories/appointments')
      const appointment = await createFlowAppointment(
        { ...args, musteri_adi: name, telefon: phone, tarih, saat },
        `direct-${randomUUID().slice(0, 8)}`,
      )
      console.log('[Tools/Appointment]', appointment.id, appointment.customerName)

      // Dental calendar sync
      void (async () => {
        try {
          const { createDentalAppointmentFromVoice } = await import('./db/repositories/dental')
          await createDentalAppointmentFromVoice({
            customerName: name,
            phone,
            type,
            date: tarih,
            time: saat,
            doctorId: args.doktor_id || null,
          })
        } catch (e) { console.error('[Tools/Appointment:CalendarSync]', e) }
      })()

      return { success: true, message: `Randevu ${tarih} ${saat} için kaydedildi.`, id: appointment.id }
    } catch (err) {
      console.error('[Tools/Appointment]', err)
      set.status = 500
      return { success: false, message: 'Randevu oluşturma hatası.' }
    }
  })

  .post('/api/tools/check-availability', async ({ body }) => {
    const args = (body ?? {}) as { tarih?: string; baslangic_tarih?: string; bitis_tarih?: string }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const hasValidDate = (args.tarih && dateRegex.test(args.tarih)) || (args.baslangic_tarih && dateRegex.test(args.baslangic_tarih))
    if (!hasValidDate) return { sonuc: 'Geçerli bir tarih belirtilmedi.' }
    try {
      const result = await getAppointmentsByDateRange({
        date: args.tarih,
        from: args.baslangic_tarih,
        to: args.bitis_tarih || args.baslangic_tarih,
      })
      if (result.length === 0) return { sonuc: `${args.tarih || `${args.baslangic_tarih} - ${args.bitis_tarih}`} tarihinde henüz randevu yok — müsait.` }
      return { sonuc: `${result.length} randevu mevcut.`, count: result.length }
    } catch (err) {
      console.error('[Tools/Availability]', err)
      return { sonuc: 'Müsaitlik kontrol servisi şu an kullanılamıyor.' }
    }
  })

// ── Web session koruma sabitleri ──────────────────────────────────────────────
const WS_IDLE_TIMEOUT_MS  = 5 * 60_000   // 5 dk ses yoksa kapat
const WS_MAX_SESSION_MS   = 30 * 60_000  // 30 dk max session ömrü
const WS_PING_INTERVAL_MS = 30_000       // 30s ping

// ── WebSocket: Voice streaming ──────────────────────────────────────────────
app.ws('/ws', {
    idleTimeout: 120, // Elysia seviyesi idle (saniye) — ek güvenlik ağı

    async open(ws) {
      const shortId = randomUUID().slice(0, 8)
      console.log(`[${shortId}] Client connected`)
      const startedAt = new Date()
      const startedAtMs = Date.now()
      const info: SessionInfo = {
        session: null as any,
        startedAt,
        startedAtMs,
        audioChunks: [],
        userAudioChunks: [],
        shortId,
      }
      // ── Idle + max session timer'ları ──
      let lastActivityAt = Date.now()
      const idleTimer = setInterval(() => {
        const idleMs = Date.now() - lastActivityAt
        const totalMs = Date.now() - startedAtMs
        if (totalMs > WS_MAX_SESSION_MS) {
          console.log(`[${shortId}] Max session süresi aşıldı (${Math.round(totalMs / 60_000)}dk) — kapatılıyor`)
          ws.send(JSON.stringify({ type: 'error', message: 'Maksimum oturum süresi doldu.' }))
          ws.close()
          return
        }
        if (idleMs > WS_IDLE_TIMEOUT_MS) {
          console.log(`[${shortId}] WS idle timeout (${Math.round(idleMs / 60_000)}dk ses yok) — kapatılıyor`)
          ws.send(JSON.stringify({ type: 'error', message: 'Uzun süredir ses alınamadı, oturum kapatıldı.' }))
          ws.close()
        }
      }, 30_000)
      ;(ws.data as any).idleTimer = idleTimer
      ;(ws.data as any).touchActivity = () => { lastActivityAt = Date.now() }

      // Heartbeat — ölü bağlantıları tespit et
      const pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ type: 'ping' })) } catch {}
      }, WS_PING_INTERVAL_MS)
      ;(ws.data as any).pingTimer = pingTimer

      try {
        // RAG pre-warm
        let ragContext = ''
        try {
          const preWarmEmbedding = await embedText(PRE_WARM_QUERY)
          const topDocs = await retrieveDocsByEmbedding(preWarmEmbedding, 5)
          if (topDocs.length > 0) {
            ragContext = await buildRagPrompt(topDocs)
            console.log(`[${shortId}] RAG: ${topDocs.length} belge → ${topDocs.map(d => d.title).join(', ')}`)
          }
        } catch (e) { console.error(`[${shortId}] RAG hatası:`, e) }

        const dateHeader = `BUGÜNÜN TARİHİ: ${getTodayTurkish()}. Randevu tarihlerini söylerken mutlaka bu tarihe göre gün hesapla — asla tahmin yapma.\n\n`
        const greeting = await getGreeting() ?? DEFAULT_GREETING
        const systemPrompt = dateHeader + await buildSystemPrompt(greeting) + ragContext
        const model = await resolveLiveModel()
        const { getSetting } = await import('./db/repositories/settings')
        const voiceName = (await getSetting('ai.voice_name')) || 'Aoede'
        console.log(`[${shortId}] Gemini Live model: ${model}, voice: ${voiceName}`)

        const session = await createLiveSession(ai, {
          onReady: () => { console.log(`[${shortId}] Gemini Live ready`); ws.send(JSON.stringify({ type: 'ready' })) },
          onAudio: (pcm) => {
            ws.send(pcm)
            info.audioChunks.push({ buffer: pcm, offsetMs: Date.now() - startedAtMs })
          },
          onTranscript: (role, text) => {
            const trimmed = text.trim()
            if (trimmed) {
              const label = role === 'user' ? 'USER' : 'AI'
              console.log(`[${shortId}] ${label}: ${trimmed}`)
            }
            ws.send(JSON.stringify({ type: 'transcript', role, text }))
          },
          onInterrupted: () => ws.send(JSON.stringify({ type: 'interrupted' })),
          onTurnComplete: () => ws.send(JSON.stringify({ type: 'turn_complete' })),
          onError: (e) => console.error(`[${shortId}] Gemini error:`, e),
          onClose: () => {
            console.log(`[${shortId}] Gemini session closed`)
            sessions.delete(shortId)
            notifyAdmins('session_end', { id: shortId, activeSessions: sessions.size })
          },
        }, { dbSessionId: shortId, systemPrompt, model, voiceName })

        info.session = session
        ;(ws.data as any).sessionId = shortId
        sessions.set(shortId, info)
        notifyAdmins('session_start', { id: shortId, activeSessions: sessions.size })

        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: 'Sistem bildirimi: Müşteri sesli görüşmeye bağlandı. (Bu satır müşteri adı veya talebi değildir; randevuya yazma.)' }] }],
          turnComplete: true,
        })
      } catch (err) {
        console.error(`[${shortId}] Session başlatılamadı:`, err)
        ws.send(JSON.stringify({ type: 'error', message: 'Session failed to start' }))
        ws.close()
      }
    },

    message(ws, message) {
      const shortId = (ws.data as any).sessionId as string
      const info = sessions.get(shortId)
      if (!info) return
      // Pong — client heartbeat cevabı (activity sayılmaz)
      if (typeof message === 'string') {
        try { if (JSON.parse(message as string).type === 'pong') return } catch {}
      }
      if (message instanceof Buffer || message instanceof Uint8Array) {
        const buf = Buffer.isBuffer(message) ? message : Buffer.from(message)
        info.session.sendRealtimeInput({ media: { data: buf.toString('base64'), mimeType: 'audio/pcm;rate=16000' } })
        info.userAudioChunks.push({ buffer: buf, offsetMs: Date.now() - info.startedAtMs })
        // Ses geldi — idle timer'ı sıfırla
        ;(ws.data as any).touchActivity?.()
      }
    },

    async close(ws) {
      // Timer'ları temizle
      clearInterval((ws.data as any).idleTimer)
      clearInterval((ws.data as any).pingTimer)
      const shortId = (ws.data as any).sessionId as string
      const info = sessions.get(shortId)
      if (info) {
        const hasAudio = info.audioChunks.length > 0 || info.userAudioChunks.length > 0
        if (hasAudio) {
          const endedAt = new Date()
          const durationMs = endedAt.getTime() - info.startedAt.getTime()
          const ts = info.startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const filename = `session_${shortId}_${ts}.wav`
          const filePath = resolve(RECORDINGS_DIR, filename)
          try {
            const wavBuf = buildStereoWav(info.audioChunks, info.userAudioChunks, durationMs)
            writeFileSync(filePath, wavBuf)
            await saveRecording({
              filename,
              startedAt: info.startedAt.toISOString(),
              endedAt: endedAt.toISOString(),
              durationMs,
              sizeBytes: wavBuf.length,
            })
            console.log(`[${shortId}] Recording: ${filename}`)
          } catch (e) { console.error(`[${shortId}] Recording hatası:`, e) }
        }
        try { info.session?.close() } catch {}
        sessions.delete(shortId)
      }
      console.log(`[${shortId}] Disconnected`)
    },
  })

  .listen(PORT, async () => {
    console.log(`\n Voice AI Server`)
    console.log(`   http://localhost:${PORT}`)
    console.log(`   ws://localhost:${PORT}/ws`)
    console.log(`   Model: ${await resolveLiveModel()}`)
    console.log(`   RAG: pgvector + HNSW (${getEmbeddingModel()}, dim=${getEmbeddingDimensions()})`)

    // Seed default categories if not present
    try { await seedCategories() } catch (e) { console.error('[Categories] Seed hatası:', e) }

    // Stale session temizliği — zombi/takılı session'ları periyodik olarak kapat
    setInterval(() => {
      const now = Date.now()
      for (const [id, info] of sessions) {
        const ageMs = now - info.startedAtMs
        if (ageMs > 30 * 60_000) {
          console.log(`[Cleanup] Stale session temizlendi: ${id} (${Math.round(ageMs / 60_000)}dk)`)
          try { info.session?.close() } catch {}
          sessions.delete(id)
        }
      }
    }, 60_000)

    // ── Telephony (Netgsm SIP Trunk → AudioSocket) ─────────────────────────
    if (process.env.TELEPHONY_ENABLED === '1') {
      try {
        const { startTelephony } = await import('./telephony')
        await startTelephony({
          ai,
          port: Number(process.env.AUDIOSOCKET_PORT) || 12000,
          resolveLiveModel,
          buildSystemPrompt: async (direction?: string) => {
            const dir = direction || 'inbound'
            const g = (await getGreeting(dir)) ?? DEFAULT_GREETING
            return buildSystemPrompt(g, dir)
          },
          sessions,
          notifyAdmins,
          callerRegistry,
        })
      } catch (e) {
        console.error('[Telephony] Başlatılamadı:', e)
      }
    } else {
      console.log(`   Telephony: kapalı (TELEPHONY_ENABLED=1 ile aç)`)
    }
    console.log('')
    
    // Start Cron Jobs
    startReminderCron()
  })

export type App = typeof app
