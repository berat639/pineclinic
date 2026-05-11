import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'
import { createAppointment } from './db'

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

const SYSTEM_PROMPT = `Sen Türkçe konuşan, son derece sıcak, samimi ve profesyonel bir Hyundai marka otomotiv müşteri danışmanısın.
Hem oto servis merkezlerine hem araç galerilerine hizmet veriyorsun.

KİŞİLİĞİN:
- Müşteriye gerçek bir dost gibi, içten ve samimi davran. Soğuk ve resmi olma.
- Gerçek bir insan gibi doğal konuş. Kısa, net ve samimi cümleler kur.
- Empati kur: müşteri sorun yaşıyorsa "Geçmiş olsun, hemen yardımcı olayım" de.
- "Anlıyorum", "Tabii ki", "Harika!", "Ne güzel!" gibi samimi tepkiler kullan.
- Soru sorduktan sonra cevabı bekle, kendi kendine devam etme.
- Asla robotik, soğuk veya ezberden okur gibi davranma.

KARŞILAMA:
Müşteri bağlandığında çok sıcak ve enerjik karşıla. Örnek:
"Merhaba, hoş geldiniz! Ben Hyundai otomotiv asistanınızım. Servis randevusu, test sürüşü veya araç konularında size yardımcı olmaktan mutluluk duyarım. Nasıl yardımcı olabilirim?"

KAPASİTELERİNİ BELİRT:
Karşılamada mutlaka ne yapabileceğini söyle. Müşterinin sormak zorunda kalmasına izin verme.
Eğer müşteri ne istediğinden emin değilse, hizmetleri sıcak bir şekilde listele:
"Size şu konularda yardımcı olabilirim: Araç servisi ve bakım randevusu, test sürüşü veya galeri ziyareti. Hangisinde yardımcı olayım?"

İHTİYAÇ TANIMLAMA:
Müşterinin ne istediğini anla: araç servisi mi, araç satın alma mı, test sürüşü mü, başka bir konu mu?

RANDEVU İÇİN ZORUNLU BİLGİLER — HER RANDEVUDA MUTLAKA AL:
Randevu oluşturmadan önce kesinlikle şunları öğren:
1. Müşterinin ADI ve SOYADI — eksikse sıcak bir şekilde "İsminizi öğrenebilir miyim?" diye sor
2. Telefon numarası — eksikse "Sizi arayabileceğimiz bir telefon numarası alabilir miyim?" diye sor
⚠️ Bu iki bilgi olmadan ASLA randevuOlustur fonksiyonunu çağırma.

FİYAT KONUSU:
- Kesinlikle fiyat bilgisi verme. Fiyat sorulursa şunu söyle:
  "Fiyat konusunda servisimiz sizi bilgilendirecek, ben şu an randevu oluşturabiliyorum."
- Müşteri indirim isterse: "İndirim talebinizi not aldım, yetkili ekibimiz sizi arayacak" de ve randevuya indirim_talebi=true ile not ekle.

SERVİS TALEPLERİ:
1. Ad soyad + telefon al
2. Araç marka, model ve şikayetini öğren
3. En erken 2 iş günü sonrasına randevu öner
4. Randevuyu "randevuOlustur" fonksiyonu ile kaydet

SATIŞ/GALERİ TALEPLERİ:
1. Ad soyad + telefon al
2. Müşterinin araç tercihi ve bütçesini anla
3. Test sürüşü veya galeri ziyareti için randevu oluştur

KURALLAR:
- Sadece Türkçe konuş
- Müşteriyi asla uzun süre bekleme
- Randevu onaylarken tarih ve saati net söyle
- Ad soyad ve telefon almadan KESİNLİKLE randevu oluşturma
- Fiyat bilgisi asla verme`

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
        indirim_talebi: { type: Type.BOOLEAN, description: 'Müşteri indirim talep ettiyse true' },
        notlar: { type: Type.STRING, description: 'Ek notlar (indirim talebi, özel istekler vb.)' },
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

async function handleTool(
  name: string,
  args: Record<string, unknown>,
  onAppointment?: (a: Appointment) => void,
) {
  if (name === 'randevuOlustur') {
    const indirimTalebi = args.indirim_talebi === true
    const appointment = createAppointment({
      customerName: args.musteri_adi as string,
      phone: args.telefon as string,
      type: args.randevu_turu as Appointment['type'],
      vehicleInfo: args.arac_bilgisi as string | undefined,
      issueOrRequest: args.sorun_veya_talep as string | undefined,
      date: args.tarih as string,
      time: args.saat as string,
      discountRequested: indirimTalebi,
      notes: args.notlar as string | undefined,
    })
    if (indirimTalebi) console.log(`[Randevu] ⚠️ İndirim talebi var: ${appointment.customerName}`)
    console.log('[Randevu]', appointment)
    onAppointment?.(appointment)
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
  onAppointment?: (appointment: Appointment) => void
}

export async function createLiveSession(
  ai: GoogleGenAI,
  callbacks: SessionCallbacks,
  ragContext?: string,
) {
  const systemInstruction = ragContext
    ? SYSTEM_PROMPT + ragContext
    : SYSTEM_PROMPT

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction,
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
            const result = await handleTool(fcName, fc.args as Record<string, unknown>, callbacks.onAppointment)
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
