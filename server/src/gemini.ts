import { GoogleGenAI, Modality, Type, StartSensitivity, EndSensitivity, type FunctionDeclaration, type RealtimeInputConfig } from '@google/genai'
import { createAppointment, updateAppointment } from './db/repositories/appointments'
import { createCalendarEvent, updateCalendarEvent } from './integrations/google-calendar'
import { searchKnowledge } from './services/knowledge'

const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

/** randevuOlustur'a şablon/placeholder sızmasını engelle */
function validateLiveCustomerIdentity(customerName: string, phone: string): string | null {
  const name = customerName.trim()
  const tel = phone.trim()
  if (name.length < 3) return 'Ad soyad en az 3 karakter olmalı; müşteriden net ad soyad al ve onaylat.'
  if (/[\[\]]/.test(name) || /[\[\]]/.test(tel)) return 'Köşeli parantez veya şablon kullanılamaz; müşterinin gerçekten söylediği ad ve telefonu al, tekrar okutup onaylat.'
  if (/KULLANICI/i.test(name) || /\bADI\s+SOYADI\b/i.test(name)) return 'Bu ifade gerçek bir ad değil; müşteriden adını soyadını söylemesini iste, sesli tekrar edip onaylat.'
  if (/placeholder|şablon|örnek\s*(isim|telefon)|\[Ad/i.test(name)) return 'Şablon/örnek metin kullanılamaz; gerçek bilgi ve net onay gerekir.'
  const digits = tel.replace(/\D/g, '')
  if (digits.length < 10) return 'Telefon en az 10 hane olmalı; müşteriden numarayı tekrar söylemesini iste ve onaylat.'
  return null
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'randevuOlustur',
    description: 'Müşteri için servis veya galeri randevusu oluşturur ve sisteme kaydeder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        musteri_adi: { type: Type.STRING, description: 'Müşterinin AÇIKÇA SÖYLEDİĞİ gerçek ad soyadı. Köşeli parantez, KULLANICI, şablon veya uydurma isim YASAK. Önce bilgileri sesli tekrar edip müşteri onayı al.' },
        telefon: { type: Type.STRING, description: 'Müşterinin AÇIKÇA SÖYLEDİĞİ gerçek telefonu (rakamlar). Şablon veya köşeli parantez YASAK.' },
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
    name: 'randevuGuncelle',
    description: 'Daha önce oluşturulan randevuyu günceller. Eksik bilgi tamamlandığında, tarih/saat değiştiğinde veya araç/talep bilgisi eklendiğinde kullan. randevuOlustur sonrasında dönen randevu_id zorunludur.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        randevu_id: { type: Type.STRING, description: 'randevuOlustur ile oluşturulan randevunun ID\'si' },
        calendar_event_id: { type: Type.STRING, description: 'randevuOlustur ile dönen Google Calendar event ID\'si (varsa)' },
        musteri_adi: { type: Type.STRING, description: 'Güncellenecek müşteri adı soyadı' },
        telefon: { type: Type.STRING, description: 'Güncellenecek telefon numarası' },
        randevu_turu: { type: Type.STRING, enum: ['service', 'test_drive', 'gallery_visit', 'other'] },
        arac_bilgisi: { type: Type.STRING, description: 'Güncellenecek araç bilgisi' },
        sorun_veya_talep: { type: Type.STRING, description: 'Güncellenecek talep/şikayet' },
        tarih: { type: Type.STRING, description: 'Yeni tarih (YYYY-MM-DD)' },
        saat: { type: Type.STRING, description: 'Yeni saat (HH:MM)' },
      },
      required: ['randevu_id'],
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
  {
    name: 'cagriySonlandir',
    description: 'Telefon görüşmesini sonlandırır. Müşterinin ihtiyacı tamamen giderildiğinde, vedalaşıldıktan sonra kullan. Web oturumlarında etkisizdir.',
    parameters: { type: Type.OBJECT, properties: {}, required: [] },
  },
]

export type SessionCallbacks = {
  onReady: () => void
  onAudio: (pcm: Buffer) => void
  onTranscript: (role: 'model', text: string) => void
  onInterrupted: () => void
  onTurnComplete: () => void
  onHangup?: () => void
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
    model: string
    realtimeInputConfig?: RealtimeInputConfig
  }
) {
  async function handleTool(name: string, args: Record<string, unknown>) {
    if (name === 'randevuOlustur') {
      const rawName = args.musteri_adi as string
      const rawPhone = args.telefon as string
      const invalid = validateLiveCustomerIdentity(rawName, rawPhone)
      if (invalid) {
        return { success: false, message: invalid }
      }
      const appointment = await createAppointment({
        customerName: rawName.trim(),
        phone: rawPhone.trim(),
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
      const calendarResult = await createCalendarEvent({
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
      }).catch(() => ({ success: false as const, reason: 'calendar error' }))

      // Store calendarEventId in DB for future updates
      if (calendarResult.success) {
        await updateAppointment(appointment.id, { calendarEventId: calendarResult.eventId }).catch(() => {})
        console.log('[Calendar] Etkinlik oluşturuldu:', calendarResult.eventId)
      }

      return {
        success: true,
        message: `Randevu ${appointment.date} ${appointment.time} için kaydedildi.`,
        id: appointment.id,
        calendar_event_id: calendarResult.success ? calendarResult.eventId : null,
      }
    }

    if (name === 'randevuGuncelle') {
      const appointmentId = args.randevu_id as string
      const calendarEventId = args.calendar_event_id as string | undefined

      const updateData: Parameters<typeof updateAppointment>[1] = {}
      if (args.musteri_adi) updateData.customerName = args.musteri_adi as string
      if (args.telefon) updateData.phone = args.telefon as string
      if (args.randevu_turu) updateData.type = args.randevu_turu as string
      if (args.arac_bilgisi !== undefined) updateData.vehicleInfo = args.arac_bilgisi as string
      if (args.sorun_veya_talep !== undefined) updateData.issueOrRequest = args.sorun_veya_talep as string
      if (args.tarih) updateData.date = args.tarih as string
      if (args.saat) updateData.time = args.saat as string

      const updated = await updateAppointment(appointmentId, updateData)
      if (!updated) return { success: false, message: 'Randevu bulunamadı.' }

      // Update Google Calendar event if we have an eventId
      const eventId = calendarEventId ?? updated.calendarEventId ?? null
      if (eventId && (args.tarih || args.saat || args.musteri_adi || args.randevu_turu)) {
        const TYPE_LABELS: Record<string, string> = {
          service: 'Servis', test_drive: 'Test Sürüşü', gallery_visit: 'Galeri Ziyareti', other: 'Randevu',
        }
        const typeLabel = TYPE_LABELS[updated.type] ?? 'Randevu'
        void updateCalendarEvent(eventId, {
          title: `${typeLabel} — ${updated.customerName}`,
          description: [
            `Müşteri: ${updated.customerName}`,
            `Telefon: ${updated.phone}`,
            `Randevu Türü: ${typeLabel}`,
            updated.vehicleInfo ? `Araç: ${updated.vehicleInfo}` : null,
            updated.issueOrRequest ? `Talep/Sorun: ${updated.issueOrRequest}` : null,
          ].filter(Boolean).join('\n'),
          date: updated.date,
          time: updated.time,
          attendeePhone: updated.phone,
        }).then(r => { if (r.success) console.log('[Calendar] Etkinlik güncellendi:', r.eventId) }).catch(() => {})
      }

      return {
        success: true,
        message: `Randevu güncellendi: ${updated.date} ${updated.time}.`,
        id: updated.id,
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
    if (name === 'cagriySonlandir') {
      callbacks.onHangup?.()
      return { success: true }
    }
    return { error: 'Unknown function' }
  }

  const session = await ai.live.connect({
    model: options.model,
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
      ...(options.realtimeInputConfig ? { realtimeInputConfig: options.realtimeInputConfig } : {}),
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
