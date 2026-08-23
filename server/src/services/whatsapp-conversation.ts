/**
 * WhatsApp Conversation Session Manager
 *
 * Manages per-patient conversation state using PostgreSQL (whatsapp_conversations table).
 * Uses Gemini REST API (generateContent) — NOT the Live/WebSocket API.
 *
 * Flow:
 *  1. Incoming message from patient → handleIncomingMessage()
 *  2. Load clinic config + conversation history from DB
 *  3. Call Gemini with full history (multi-turn chat)
 *  4. Handle tool calls (randevu, musaitlik vb.)
 *  5. Send reply via sendWhatsAppText()
 *  6. Persist updated history
 */

import { db } from '../db/client'
import { clinics, patients, whatsappConversations } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { sendWhatsAppText, detectOptOut, type WhatsAppCredentials } from '../integrations/whatsapp'
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationEntry {
  role: 'user' | 'model'
  text: string
}

interface ClinicWAConfig {
  id: string
  name: string
  whatsappPhoneNumberId: string
  whatsappAccessToken: string
  systemPrompt?: string
}

// ── Tool handler (reuses same tools as voice channel) ────────────────────────

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const post = async (path: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`http://localhost:${process.env.PORT || 3001}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal': 'whatsapp' },
        body: JSON.stringify(body),
      })
      return await res.json()
    } catch {
      return { error: 'Sunucuya erişilemedi.' }
    }
  }

  switch (name) {
    case 'searchKnowledgeBase': return post('/api/tools/search-knowledge', { sorgu: args.sorgu })
    case 'musteriSorgula': return post('/api/tools/customer-query', { telefon: args.telefon })
    case 'randevuOlustur': return post('/api/tools/create-appointment', args)
    case 'randevuGuncelle': return post('/api/tools/create-appointment', { ...args, _update: true })
    case 'randevuMusaitlikKontrol': return post('/api/tools/check-availability', args)
    case 'gecmisRandevular': return post('/api/tools/customer-query', { telefon: args.telefon })
    default: return { error: `Bilinmeyen tool: ${name}` }
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function handleIncomingWhatsAppMessage(
  clinicId: string,
  patientPhone: string,
  messageText: string
): Promise<void> {
  // 1. Load clinic
  const clinicRows = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  const clinic = clinicRows[0]
  if (!clinic?.whatsappEnabled || !clinic.whatsappAccessToken || !clinic.whatsappPhoneNumberId) {
    console.warn(`[WA Conv] Clinic ${clinicId} WA not configured or disabled`)
    return
  }

  const creds: WhatsAppCredentials = {
    phoneNumberId: clinic.whatsappPhoneNumberId,
    accessToken: clinic.whatsappAccessToken,
  }

  // 2. Handle opt-out
  if (detectOptOut(messageText)) {
    await db.update(patients)
      .set({ whatsappOptOut: true })
      .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, patientPhone)))
    await sendWhatsAppText(patientPhone, creds,
      'Anlaşıldı, WhatsApp bildirimlerinden çıkarıldınız. Tekrar iletişime geçmek isterseniz bize yazabilirsiniz.')
    console.log(`[WA Conv] Opt-out recorded for ${patientPhone}`)
    return
  }

  // 3. Re-enable if they message us after opt-out
  await db.update(patients)
    .set({ whatsappOptOut: false })
    .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, patientPhone)))

  // 4. Load or create conversation record
  const convRows = await db.select().from(whatsappConversations)
    .where(and(
      eq(whatsappConversations.clinicId, clinicId),
      eq(whatsappConversations.patientPhone, patientPhone)
    ))
    .limit(1)

  const existing = convRows[0]
  const history: ConversationEntry[] = (existing?.history as ConversationEntry[]) || []

  // Append new user message
  history.push({ role: 'user', text: messageText })

  // 5. Get system prompt
  const { getSetting } = await import('../db/repositories/settings')
  const systemPrompt = await getSetting('system_prompt') || `Sen ${clinic.name} kliniğinin WhatsApp asistanısın. Hastalara randevu alma, bilgi verme ve tedavi sorgulama konularında yardımcı olursun. Kısa, net ve nazik cevaplar ver.`

  // 6. Call Gemini REST (chat with history)
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[WA Conv] GEMINI_API_KEY not set')
    return
  }

  const ai = new GoogleGenAI({ apiKey })

  // Build Gemini contents from history
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }))

  const toolDeclarations: FunctionDeclaration[] = [
    {
      name: 'searchKnowledgeBase',
      description: 'Bilgi tabanında arama yapar. Klinik hizmetleri, fiyatlar, doktorlar hakkında bilgi almak için kullan.',
      parameters: { type: Type.OBJECT, properties: { sorgu: { type: Type.STRING, description: 'Arama sorgusu' } }, required: ['sorgu'] }
    },
    {
      name: 'musteriSorgula',
      description: 'Hastanın telefon numarasıyla geçmiş randevularını sorgular.',
      parameters: { type: Type.OBJECT, properties: { telefon: { type: Type.STRING, description: 'Hasta telefon numarası' } }, required: ['telefon'] }
    },
    {
      name: 'randevuMusaitlikKontrol',
      description: 'Belirtilen tarih ve saat için müsaitlik kontrolü yapar.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'YYYY-MM-DD formatında tarih' },
          time: { type: Type.STRING, description: 'HH:MM formatında saat' },
        },
        required: ['date', 'time']
      }
    },
    {
      name: 'randevuOlustur',
      description: 'Hasta için randevu oluşturur.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: { type: Type.STRING, description: 'Hasta adı soyadı' },
          telefon: { type: Type.STRING, description: 'Hasta telefon numarası' },
          randevu_tarihi: { type: Type.STRING, description: 'YYYY-MM-DD formatında randevu tarihi' },
          randevu_saati: { type: Type.STRING, description: 'HH:MM formatında randevu saati' },
        },
        required: ['musteri_adi', 'telefon', 'randevu_tarihi', 'randevu_saati']
      }
    },
  ]

  try {
    let modelReply = ''
    let iterCount = 0
    const MAX_ITER = 5

    // Agentic loop: handle tool calls
    while (iterCount < MAX_ITER) {
      iterCount++
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      })

      const candidate = response.candidates?.[0]
      if (!candidate) break

      const parts = candidate.content?.parts || []
      let hasFunctionCall = false

      for (const part of parts) {
        if (part.functionCall) {
          hasFunctionCall = true
          const { name, args } = part.functionCall
          console.log(`[WA Conv] Tool call: ${name}`, args)

          const result = await handleToolCall(name!, args as Record<string, unknown>)

          // Add function call + result to contents for next iteration
          contents.push({ role: 'model', parts: [{ functionCall: { name, args } } as any] })
          contents.push({ role: 'user', parts: [{ functionResponse: { name, response: result } } as any] })
        } else if (part.text) {
          modelReply += part.text
        }
      }

      if (!hasFunctionCall) break
    }

    if (!modelReply) {
      console.warn('[WA Conv] No text reply from Gemini')
      return
    }

    // 7. Send reply to patient
    const sendResult = await sendWhatsAppText(patientPhone, creds, modelReply)

    if (!sendResult.success && sendResult.error === 'OPT_OUT') {
      await db.update(patients)
        .set({ whatsappOptOut: true })
        .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, patientPhone)))
      return
    }

    // 8. Save updated history
    history.push({ role: 'model', text: modelReply })

    const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // +24h

    if (existing) {
      await db.update(whatsappConversations)
        .set({
          history: history as any,
          lastMessageAt: new Date(),
          windowExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, existing.id))
    } else {
      // Find patient record if exists
      const patientRows = await db.select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.clinicId, clinicId), eq(patients.phone, patientPhone)))
        .limit(1)

      await db.insert(whatsappConversations).values({
        clinicId,
        patientPhone,
        patientId: patientRows[0]?.id ?? null,
        history: history as any,
        lastMessageAt: new Date(),
        windowExpiresAt,
      })
    }

    console.log(`[WA Conv] Replied to ${patientPhone}: "${modelReply.slice(0, 60)}..."`)
  } catch (err: any) {
    console.error('[WA Conv] Gemini error:', err.message)
  }
}
