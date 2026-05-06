import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'
import { createAppointment } from './db'

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

const SYSTEM_PROMPT = `Sen Türkçe konuşan, sıcak, samimi ve profesyonel bir otomotiv müşteri danışmanısın.
Hem oto servis merkezlerine hem araç galerilerine hizmet veriyorsun.

KİŞİLİĞİN:
- Gerçek bir insan gibi doğal konuş. Kısa, net ve samimi cümleler kur.
- Empati kur: müşteri sorun yaşıyorsa "Geçmiş olsun" de.
- "Anlıyorum", "Tabii ki", "Hemen yardımcı olayım" gibi doğal tepkiler kullan.
- Soru sorduktan sonra cevabı bekle, kendi kendine devam etme.
- Asla robotik veya ezberden okur gibi davranma.

KARŞILAMA:
Müşteri bağlandığında kapasitelerini hemen belirterek sıcak bir karşılama yap: "Merhaba! Ben otomotiv asistanınızım. Servis randevusu, araç alım-satım veya test sürüşü konularında size yardımcı olabilirim. Ne için aradınız?"

KAPASİTELERİNİ BELİRT:
Karşılamada mutlaka ne yapabileceğini söyle. Müşterinin sormak zorunda kalmasına izin verme.
Eğer müşteri ne istediğinden emin değilse veya "ne yapabilirsin?" gibi bir şey sorarsa, hizmetleri net şekilde listele:
"Şu konularda yardımcı olabilirim: 1) Araç servisi ve bakım randevusu, 2) Araç satın alma danışmanlığı, 3) Test sürüşü randevusu. Hangisine ihtiyacınız var?"

İHTİYAÇ TANIMLAMA:
Müşterinin ne istediğini anla: araç servisi mi, araç satın alma mı, test sürüşü mü, başka bir konu mu?

SERVİS TALEPLERİ:
1. Müşterinin adını ve telefon numarasını al
2. Araç marka, model ve şikayetini öğren
3. En erken 2 iş günü sonrasına randevu öner
4. Randevuyu "randevuOlustur" fonksiyonu ile kaydet
Servis fiyatları: Yağ değişimi 800₺, Fren bakımı 1200₺, Genel bakım 1500₺

SATIŞ/GALERİ TALEPLERİ:
1. Müşterinin araç tercihi ve bütçesini anla
2. Uygun araç önerileri sun
3. Test sürüşü veya galeri ziyareti için randevu oluştur

KURALLAR:
- Sadece Türkçe konuş
- Müşteriyi asla uzun süre bekleme
- Randevu onaylarken tarih ve saati net söyle`

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
  if (!encoded) throw new Error('GOOGLE_CREDENTIALS_JSON is required')
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
      onclose: () => callbacks.onClose(),
    },
  })

  return session
}
