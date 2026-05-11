import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'
import { createAppointment } from './db'
import { createCalendarEvent } from './integrations/google-calendar'
import { searchKnowledge } from './services/knowledge'

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'randevuOlustur',
    description: 'Müşteri için servis veya galeri randevusu oluşturur ve sisteme kaydeder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        musteri_adi: { type: Type.STRING, description: 'Müşterinin adı soyadı' },
        telefon: { type: Type.STRING, description: 'Müşterinin telefon numarası' },
        randevu_turu: {
          type: Type.STRING,
          enum: ['service', 'test_drive', 'gallery_visit', 'other'],
          description: 'Randevu türü: servis, test sürüşü, galeri ziyareti veya diğer',
        },
        arac_bilgisi: { type: Type.STRING, description: 'Araç marka, model ve yıl bilgisi' },
        sorun_veya_talep: { type: Type.STRING, description: 'Müşterinin şikayeti veya talebi' },
        tarih: { type: Type.STRING, description: 'Randevu tarihi (YYYY-MM-DD)' },
        saat: { type: Type.STRING, description: 'Randevu saati (HH:MM)' },
      },
      required: ['musteri_adi', 'telefon', 'randevu_turu', 'tarih', 'saat'],
    },
  },
  {
    name: 'searchKnowledgeBase',
    description: 'Bilgi tabanında arama yapar. Araç fiyatları, kampanyalar, servis detayları, garanti bilgileri için kullan. Müşteri bir ürün veya fiyat sorarsa bu aracı kullan.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sorgu: {
          type: Type.STRING,
          description: 'Aranacak konu veya soru (Türkçe)',
        },
      },
      required: ['sorgu'],
    },
  },
]

export type SessionCallbacks = {
  onReady: () => void
  onAudio: (pcm: Buffer) => void
  onTranscript: (role: 'model', text: string) => void
  onInterrupted: () => void
  onTurnComplete: () => void
  onUsage?: (usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }) => void
  onError: (err: unknown) => void
  onClose: () => void
}

export async function createLiveSession(
  ai: GoogleGenAI,
  callbacks: SessionCallbacks,
  options: {
    dbSessionId: string
    systemPrompt: string
  }
) {
  async function handleTool(name: string, args: Record<string, unknown>) {
    if (name === 'randevuOlustur') {
      const appointment = await createAppointment({
        customerName: args.musteri_adi as string,
        phone: args.telefon as string,
        type: args.randevu_turu as string,
        vehicleInfo: args.arac_bilgisi as string | undefined,
        issueOrRequest: args.sorun_veya_talep as string | undefined,
        date: args.tarih as string,
        time: args.saat as string,
        sessionId: options.dbSessionId,
      })
      console.log('[Randevu]', appointment.id, appointment.customerName)

      // Google Calendar (fire-and-forget, skip if unconfigured)
      const TYPE_LABELS: Record<string, string> = {
        service: 'Servis',
        test_drive: 'Test Sürüşü',
        gallery_visit: 'Galeri Ziyareti',
        other: 'Randevu',
      }
      const typeLabel = TYPE_LABELS[appointment.type] ?? 'Randevu'
      void createCalendarEvent({
        title: `${typeLabel} — ${appointment.customerName}`,
        description: [
          `Müşteri: ${appointment.customerName}`,
          `Telefon: ${appointment.phone}`,
          `Randevu Türü: ${typeLabel}`,
          appointment.vehicleInfo ? `Araç: ${appointment.vehicleInfo}` : null,
          appointment.issueOrRequest ? `Talep/Sorun: ${appointment.issueOrRequest}` : null,
        ].filter(Boolean).join('\n'),
        date: appointment.date,
        time: appointment.time,
        attendeePhone: appointment.phone,
      }).then(result => {
        if (result.success) console.log('[Calendar] Etkinlik oluşturuldu:', result.eventId)
      }).catch(() => {})

      return {
        success: true,
        message: `Randevu ${appointment.date} ${appointment.time} için kaydedildi.`,
        id: appointment.id,
      }
    }
    if (name === 'searchKnowledgeBase') {
      try {
        const results = await searchKnowledge(args.sorgu as string, 3)
        if (results.length === 0) {
          return { sonuc: 'Bilgi tabanında ilgili bilgi bulunamadı.' }
        }
        const content = results
          .map((r, i) => `[${i + 1}] (${r.documentName})\n${r.chunkText}`)
          .join('\n\n---\n\n')
        return { sonuc: content }
      } catch (err) {
        console.error('[Knowledge] Arama hatası:', err)
        return { sonuc: 'Bilgi tabanı şu an kullanılamıyor.' }
      }
    }
    return { error: 'Unknown function' }
  }

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: options.systemPrompt,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE },
        },
      },
      // Context birikimini sınırla: 1500 token eşiğinde sıkıştır, 600 token tut
      // Her turn önceki tüm context'i yeniden faturalar — bu %50-60 tasarruf sağlar
      contextWindowCompression: {
        triggerTokens: 5000 as unknown as string,
        slidingWindow: { targetTokens: 2000 as unknown as string },
      },
    },
    callbacks: {
      onopen: () => callbacks.onReady(),
      onmessage: async (msg) => {
        // Tool calls
        if (msg.toolCall?.functionCalls?.length) {
          for (const fc of msg.toolCall.functionCalls) {
            const fcName = fc.name ?? ''
            const result = await handleTool(fcName, fc.args as Record<string, unknown>)
            session.sendToolResponse({
              functionResponses: [{ id: fc.id, name: fcName, response: result }],
            })
          }
          return
        }

        const content = msg.serverContent
        if (!content) return

        // Barge-in: user interrupted model
        if (content.interrupted) {
          callbacks.onInterrupted()
          return
        }

        // Audio and text parts
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              callbacks.onAudio(Buffer.from(part.inlineData.data, 'base64'))
            }
            if (part.text) {
              callbacks.onTranscript('model', part.text)
            }
          }
        }

        if (content.turnComplete) {
          callbacks.onTurnComplete()
        }

        // Usage metadata (token counts) — emitted periodically by Gemini
        if (msg.usageMetadata) {
          callbacks.onUsage?.(msg.usageMetadata as {
            promptTokenCount?: number
            candidatesTokenCount?: number
            totalTokenCount?: number
          })
        }
      },
      onerror: (e) => callbacks.onError(e),
      onclose: (e: unknown) => {
        if (e) console.error('[Gemini] Close event:', e)
        callbacks.onClose()
      },
    },
  })

  return session
}
