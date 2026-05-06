import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'
import { createAppointment } from './db'

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

// Optimized: ~160 tokens (was ~450) — her turn yeniden faturalandırıldığı için kısa tutulur
const SYSTEM_PROMPT = `Türkçe konuşan otomotiv asistanısın. Servis, araç alım-satım ve test sürüşü konularında yardım et. Doğal, kısa ve samimi konuş; soru sorduktan sonra cevap bekle.

KARŞILAMA: "Merhaba! Servis randevusu, araç alım-satım veya test sürüşü için yardımcı olabilirim. Ne için aradınız?"

SERVİS: Ad+telefon+araç+şikayeti al → 2 iş günü sonrasına randevu öner → randevuOlustur ile kaydet.
Fiyatlar: Yağ değişimi 800₺ | Fren bakımı 1200₺ | Genel bakım 1500₺

GALERİ/SATIŞ: Tercih+bütçeyi öğren → araç öner → test sürüşü/galeri ziyareti randevusu oluştur.

KURALLAR: Sadece Türkçe. Randevuda tarih+saat net söyle.`

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
]

export function createAI() {
  const encoded = process.env.GOOGLE_CREDENTIALS_JSON
  if (!encoded) throw new Error('GOOGLE_CREDENTIALS_JSON tanımlı değil')
  const credentials = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
    googleAuthOptions: { credentials },
  })
}

async function handleTool(name: string, args: Record<string, unknown>) {
  if (name === 'randevuOlustur') {
    const appointment = createAppointment({
      customerName: args.musteri_adi as string,
      phone: args.telefon as string,
      type: args.randevu_turu as Appointment['type'],
      vehicleInfo: args.arac_bilgisi as string | undefined,
      issueOrRequest: args.sorun_veya_talep as string | undefined,
      date: args.tarih as string,
      time: args.saat as string,
    })
    console.log('[Randevu]', appointment)
    return {
      success: true,
      message: `Randevu oluşturuldu. ${args.tarih} tarihinde saat ${args.saat}'de görüşeceğiz.`,
      id: appointment.id,
    }
  }
  return { error: 'Unknown function' }
}

// Import type for appointment
import type { Appointment } from './db'

export type SessionCallbacks = {
  onReady: () => void
  onAudio: (pcm: Buffer) => void
  onTranscript: (role: 'model', text: string) => void
  onInterrupted: () => void
  onTurnComplete: () => void
  onError: (err: unknown) => void
  onClose: () => void
}

export async function createLiveSession(ai: GoogleGenAI, callbacks: SessionCallbacks) {
  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE },
        },
      },
      // Context birikimini sınırla: 1500 token eşiğinde sıkıştır, 600 token tut
      // Her turn önceki tüm context'i yeniden faturalar — bu %50-60 tasarruf sağlar
      contextWindowCompression: {
        triggerTokens: 1500,
        slidingWindow: { targetTokens: 600 },
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
