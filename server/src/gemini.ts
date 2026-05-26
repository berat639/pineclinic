import { GoogleGenAI, Modality, Type, StartSensitivity, EndSensitivity, type FunctionDeclaration, type RealtimeInputConfig } from '@google/genai'
import { createAppointment, updateAppointment } from './db/repositories/appointments'
import { createCalendarEvent, updateCalendarEvent } from './integrations/google-calendar'
import {
  createAtaHsysAppointment,
  getCustomerHistory as getAtaCustomerHistory,
  updateAtaHsysAppointment,
} from './integrations/ata-hsys'
import { searchKnowledge } from './services/knowledge'

/** randevu_turu → ATA Hsys "musteriistegi" fallback değeri */
const RANDEVU_TURU_TO_TALEP: Record<string, string> = {
  service: 'Periyodik Bakım',
  test_drive: 'Test Sürüşü',
  gallery_visit: 'Galeri Ziyareti',
  other: 'Genel Randevu',
}

const VOICE = process.env.GEMINI_LIVE_VOICE || 'Aoede'

/** randevuOlustur'a şablon/placeholder sızmasını engelle */
function validateLiveCustomerIdentity(customerName: string | undefined, phone: string | undefined): string | null {
  if (!customerName || !phone) return 'Müşteri adı ve telefon zorunludur; lütfen müşteriden tekrar alın.'
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
    name: 'gecmisRandevular',
    description: 'Müşterinin telefonuna göre önceki servis/randevu kayıtlarını ATA Hsys sisteminden getirir. Müşteri "geçen sefer", "garantim", "önceki randevum", "ne zaman bakım yaptırmıştım" gibi konulara atıfta bulunduğunda kullan. Müşteri telefon numarasını AÇIKÇA söylemiş olmalı.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        telefon: { type: Type.STRING, description: 'Müşterinin söylediği telefonu (rakamlar, herhangi formatta — +90, 0 vb. olabilir, normalize edilir)' },
        limit: { type: Type.INTEGER, description: 'En fazla kaç kayıt (default 5, max 20)' },
      },
      required: ['telefon'],
    },
  },
  {
    name: 'cagriySonlandir',
    description: 'Telefon görüşmesini sonlandırır. YALNIZCA müşteri açıkça veda edip aramayı bitirmek istediğini belirttiğinde kullan (örn: "iyi günler", "görüşürüz", "hoşça kalın"). Kısa bir veda cümlesi söyledikten SONRA çağır — cümle bitmeden çağırma. "Araştırıp döneceğim", "bir dakika bakayım", "kontrol edeyim" gibi geçici durumlar için ASLA çağırma. Web oturumlarında etkisizdir.',
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
      const rawName = args.musteri_adi as string | undefined
      const rawPhone = args.telefon as string | undefined
      const invalid = validateLiveCustomerIdentity(rawName, rawPhone)
      if (invalid) {
        return { success: false, message: invalid }
      }
      const dateStr = args.tarih as string | undefined
      const timeStr = args.saat as string | undefined
      if (!dateStr || !timeStr) {
        return { success: false, message: 'Tarih ve saat zorunludur; müşteriden tekrar alın.' }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(new Date(dateStr).getTime())) {
        return { success: false, message: 'Geçersiz tarih formatı; YYYY-MM-DD formatında belirt.' }
      }
      const appointment = await createAppointment({
        customerName: (rawName as string).trim(),
        phone: (rawPhone as string).trim(),
        type: args.randevu_turu as string,
        vehicleInfo: args.arac_bilgisi as string | undefined,
        issueOrRequest: args.sorun_veya_talep as string | undefined,
        date: dateStr,
        time: timeStr,
        sessionId: options.dbSessionId,
      })
      console.log('[Randevu]', appointment.id, appointment.customerName)

      // Google Calendar + ATA Hsys side effects — fire-and-forget arka planda
      // çalışır. Burada `await` etmiyoruz çünkü her ikisi de 500-2000ms
      // sürebilen dış API çağrılarıdır; tool response'unu bloklamak Gemini
      // event loop'unu kilitler → müşteri AI'yı duymaz.
      //
      // Side effect ID'leri DB'ye background'da yazılır; randevu zaten
      // ana DB'de mevcut, eksiklik telafi edilebilir.
      const TYPE_LABELS: Record<string, string> = {
        service: 'Servis',
        test_drive: 'Test Sürüşü',
        gallery_visit: 'Galeri Ziyareti',
        other: 'Randevu',
      }
      const typeLabel = TYPE_LABELS[appointment.type] ?? 'Randevu'
      const eventDescription = [
        `Müşteri: ${appointment.customerName}`,
        `Telefon: ${appointment.phone}`,
        `Randevu Türü: ${typeLabel}`,
        appointment.vehicleInfo ? `Araç: ${appointment.vehicleInfo}` : null,
        appointment.issueOrRequest ? `Talep/Sorun: ${appointment.issueOrRequest}` : null,
      ].filter(Boolean).join('\n')

      void createCalendarEvent({
        title: `${typeLabel} — ${appointment.customerName}`,
        description: eventDescription,
        date: appointment.date,
        time: appointment.time,
        attendeePhone: appointment.phone,
      })
        .then(async (r) => {
          if (r.success) {
            console.log('[Calendar] Etkinlik oluşturuldu:', r.eventId)
            await updateAppointment(appointment.id, { calendarEventId: r.eventId }).catch(() => {})
          }
        })
        .catch((err) => console.error('[Calendar] hata:', err))

      void createAtaHsysAppointment({
        date: appointment.date,
        time: appointment.time,
        telefon: appointment.phone,
        ad_soyad: appointment.customerName,
        arac: appointment.vehicleInfo || 'Hyundai',
        musteriistegi:
          appointment.issueOrRequest ||
          RANDEVU_TURU_TO_TALEP[appointment.type] ||
          'Genel Randevu',
        irtibat: 'Voice AI',
        gorusme_notu: `Sesli AI üzerinden oluşturuldu (session: ${options.dbSessionId})`,
      })
        .then(async (r) => {
          if (r.success) {
            console.log(`[ATA] Randevu ${r.duplicate ? 'mevcut' : 'oluşturuldu'}:`, r.id)
            await updateAppointment(appointment.id, { ataHsysId: String(r.id) }).catch(() => {})
          }
        })
        .catch((err) => console.error('[ATA] hata:', err))

      // Anında tool response — AI cevabı bekletilmez. Calendar/ATA ID'leri
      // null döner; gerekirse client tarafı sonradan DB'den okur.
      return {
        success: true,
        message: `Randevu ${appointment.date} ${appointment.time} için kaydedildi.`,
        id: appointment.id,
        calendar_event_id: null,
        ata_hsys_id: null,
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

      // ATA Hsys patch (yalnız tarih/saat değişimi veya görüşme notu için)
      if (updated.ataHsysId && (args.tarih || args.saat)) {
        const patch: { date?: string; time?: string; gorusme_notu?: string } = {}
        if (args.tarih) patch.date = args.tarih as string
        if (args.saat) patch.time = args.saat as string
        patch.gorusme_notu = `Voice AI ile güncellendi (session: ${options.dbSessionId})`
        void updateAtaHsysAppointment(updated.ataHsysId, patch)
          .then((r) => { if (r.success) console.log('[ATA] Randevu güncellendi:', r.id) })
          .catch(() => {})
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
    if (name === 'gecmisRandevular') {
      const rawPhone = (args.telefon as string | undefined) ?? ''
      const limitRaw = args.limit
      const limit =
        typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : 5
      if (!rawPhone.trim()) {
        return { sonuc: 'Geçmiş sorgu için telefon numarası gerekli.' }
      }
      try {
        const history = await getAtaCustomerHistory({
          telefon: rawPhone,
          mode: 'customer',
          limit,
        })
        if (!history.success) {
          console.error('[ATA] gecmisRandevular hatası:', history.reason)
          return { sonuc: 'Geçmiş randevu sorgulanamadı.' }
        }
        if (history.appointments.length === 0) {
          return { sonuc: 'Bu numara için kayıtlı önceki randevu bulunamadı.' }
        }
        const formatted = history.appointments
          .map((r, i) => {
            const parts = [
              `[${i + 1}]`,
              r.date,
              r.time,
              r.musteriistegi ? `— ${r.musteriistegi}` : '',
              r.arac ? `(${r.arac}${r.plaka ? ` ${r.plaka}` : ''})` : '',
              r.randevu_durumu ? `[durum: ${r.randevu_durumu}]` : '',
            ]
            return parts.filter(Boolean).join(' ')
          })
          .join('\n')
        return { sonuc: formatted }
      } catch (err) {
        console.error('[ATA] gecmisRandevular exception:', err)
        return { sonuc: 'Geçmiş randevu servisi şu an kullanılamıyor.' }
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
        // Tool calls — paralel/non-blocking dispatch.
        //
        // Önemli: `await handleTool(...)` ile sırayla çalıştırırsak Gemini WS
        // onmessage event loop'u kilitlenir; bu sırada Gemini'den gelen audio
        // chunks işlenmez → Asterisk'e sessizlik gider → müşteri AI'yı
        // duymaz. Her tool çağrısını ayrı promise olarak başlatıp sonuçları
        // hazır olunca `sendToolResponse` ile iletiyoruz; arada audio akışı
        // kesintiye uğramaz.
        if (msg.toolCall?.functionCalls?.length) {
          for (const fc of msg.toolCall.functionCalls) {
            const fcName = fc.name ?? ''
            const start = Date.now()
            handleTool(fcName, fc.args as Record<string, unknown>)
              .then((result) => {
                const ms = Date.now() - start
                if (ms > 200) console.log(`[Tool ${fcName}] ${ms}ms`)
                try {
                  session.sendToolResponse({
                    functionResponses: [{ id: fc.id, name: fcName, response: result }],
                  })
                } catch (err) {
                  console.error(`[Tool ${fcName}] sendToolResponse hatası:`, err)
                }
              })
              .catch((err) => {
                console.error(`[Tool ${fcName}] handler hatası:`, err)
                try {
                  session.sendToolResponse({
                    functionResponses: [
                      { id: fc.id, name: fcName, response: { error: 'tool failed' } },
                    ],
                  })
                } catch {}
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
