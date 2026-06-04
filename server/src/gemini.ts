import {
  GoogleGenAI,
  Modality,
  Type,
  StartSensitivity,
  EndSensitivity,
  type FunctionDeclaration,
  type RealtimeInputConfig,
  type LiveServerMessage,
  type LiveSendRealtimeInputParameters,
  type LiveSendClientContentParameters,
  type LiveSendToolResponseParameters,
} from '@google/genai'
import { createAppointment, updateAppointment } from './db/repositories/appointments'
import { createCalendarEvent, updateCalendarEvent } from './integrations/google-calendar'
import {
  createAtaHsysAppointment,
  getCustomerHistory as getAtaCustomerHistory,
  updateAtaHsysAppointment,
  getAppointmentsByDate,
  getCustomerInfo,
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
        plaka: { type: Type.STRING, description: 'Araç plakası (örn: 06BS8016). Servis randevularında mutlaka müşteriden al.' },
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
    name: 'musteriSorgula',
    description: 'Müşterinin telefon numarasıyla ATA Hsys sisteminden müşteri bilgisini (ad soyad, plaka, araç, son randevu) getirir. Görüşme başında müşteri telefon numarasını söyledikten HEMEN SONRA çağır — böylece müşteriyi ismiyle selamlayabilir ve mevcut bilgileri kullanabilirsin.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        telefon: { type: Type.STRING, description: 'Müşterinin söylediği telefon numarası (herhangi formatta — normalize edilir)' },
      },
      required: ['telefon'],
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
    name: 'randevuMusaitlikKontrol',
    description: 'Belirli bir tarih veya tarih aralığındaki mevcut randevuları ATA Hsys sisteminden getirir. Test sürüşü, galeri ziyareti veya servis randevusu öncesi müsaitlik kontrolü için kullan. Bilgi tabanında tarih kısıtı varsa bu aracı kullanarak o tarihlerdeki doluluk durumunu kontrol et.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tarih: { type: Type.STRING, description: 'Kontrol edilecek tarih (YYYY-MM-DD). Tek gün için.' },
        baslangic_tarih: { type: Type.STRING, description: 'Tarih aralığı başlangıcı (YYYY-MM-DD). tarih yerine from/to kullanılabilir.' },
        bitis_tarih: { type: Type.STRING, description: 'Tarih aralığı bitişi (YYYY-MM-DD).' },
      },
      required: [],
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
  /** role='user' → müşterinin söylediği (inputTranscription); role='model' → AI'nın söylediği (outputTranscription veya text part). */
  onTranscript: (role: 'model' | 'user', text: string) => void
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
        notes: args.plaka ? `Plaka: ${args.plaka}` : undefined,
      })
      console.log('[Randevu]', appointment.id, appointment.customerName, args.plaka ? `plaka: ${args.plaka}` : '')

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
        plaka: (args.plaka as string | undefined) || undefined,
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
      const sorgu = (args.sorgu as string) ?? ''
      console.log(`[Knowledge] searchKnowledgeBase sorgu: "${sorgu}"`)
      try {
        const results = await searchKnowledge(sorgu, 5)
        console.log(`[Knowledge] Sonuç sayısı: ${results.length}${results.length > 0 ? ` → ${results.map(r => r.documentName).join(', ')}` : ''}`)
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
    if (name === 'musteriSorgula') {
      const rawPhone = (args.telefon as string | undefined) ?? ''
      if (!rawPhone.trim()) {
        return { sonuc: 'Telefon numarası gerekli.' }
      }
      console.log(`[ATA] musteriSorgula: telefon=${rawPhone}`)
      try {
        const result = await getCustomerInfo({ telefon: rawPhone })
        if (!result.success) {
          console.log(`[ATA] musteriSorgula: bulunamadı (${result.reason})`)
          return { kayitli: false, sonuc: 'Bu numara ile kayıtlı müşteri bulunamadı. Müşteriden ad soyadını sor.' }
        }
        const c = result.customer
        console.log(`[ATA] musteriSorgula: bulundu → ${c.ad_soyad}`)
        const info: string[] = []
        if (c.ad_soyad) info.push(`Ad Soyad: ${c.ad_soyad}`)
        if (c.telefon) info.push(`Telefon: ${c.telefon}`)
        if (c.plaka) info.push(`Plaka: ${c.plaka}`)
        if (c.arac) info.push(`Araç: ${c.arac}`)
        if (c.son_randevu) {
          const sr = c.son_randevu
          info.push(`Son Randevu: ${sr.date || '?'} ${sr.time || ''} — ${sr.musteriistegi || 'Randevu'}${sr.randevu_durumu ? ` [${sr.randevu_durumu}]` : ''}`)
        }
        return {
          kayitli: true,
          musteri_adi: c.ad_soyad || null,
          plaka: c.plaka || null,
          arac: c.arac || null,
          sonuc: info.join('\n'),
        }
      } catch (err) {
        console.error('[ATA] musteriSorgula exception:', err)
        return { kayitli: false, sonuc: 'Müşteri sorgu servisi şu an kullanılamıyor.' }
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
    if (name === 'randevuMusaitlikKontrol') {
      const tarih = args.tarih as string | undefined
      const from = args.baslangic_tarih as string | undefined
      const to = args.bitis_tarih as string | undefined
      console.log(`[ATA] randevuMusaitlikKontrol: tarih=${tarih} from=${from} to=${to}`)
      try {
        const result = await getAppointmentsByDate({
          date: tarih,
          from: from,
          to: to || from,
        })
        if (!result.success) {
          console.error(`[ATA] müsaitlik kontrol hatası: ${result.reason}`)
          return { sonuc: `Müsaitlik kontrolü yapılamadı: ${result.reason}` }
        }
        const count = result.appointments.length
        if (count === 0) {
          return { sonuc: `${tarih || `${from} - ${to}`} tarihinde henüz randevu yok — müsait.` }
        }
        const summary = result.appointments
          .map((a, i) => `[${i + 1}] ${a.date} ${a.time || '?'} — ${a.musteriistegi || 'Randevu'}${a.randevu_durumu ? ` [${a.randevu_durumu}]` : ''}`)
          .join('\n')
        return {
          sonuc: `${tarih || `${from} - ${to}`} tarihinde ${count} randevu mevcut:\n${summary}\n\nNot: Mevcut randevu sayısına göre müsaitlik değerlendir.`,
        }
      } catch (err) {
        console.error('[ATA] randevuMusaitlikKontrol exception:', err)
        return { sonuc: 'Müsaitlik kontrol servisi şu an kullanılamıyor.' }
      }
    }
    if (name === 'cagriySonlandir') {
      callbacks.onHangup?.()
      return { success: true }
    }
    return { error: 'Unknown function' }
  }

  // ── Bağlantı yönetimi: session resumption + otomatik reconnect ──────────────
  // Gemini Live WS bağlantısının süre limiti var (~10 dk) ve limite yaklaşınca
  // `goAway` gönderip kapatır. `sessionResumption` ile, kopuş anında elimizdeki
  // handle üzerinden YENİDEN bağlanıp konuşma geçmişini (context) koruyarak
  // devam ederiz. Böylece görüşme yarıda kalmaz ve model baştan sormaz.
  let activeSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null
  let resumptionHandle: string | undefined
  let closedByUser = false
  let reconnecting = false
  let readyFired = false

  /**
   * Tool response'u activeSession'a gönder. Reconnect sırasında session null
   * olabilir — bu durumda kısa aralıklarla retry yap (max 3s). Böylece tool
   * response kaybolup model susmaz.
   */
  function sendToolResponseWithRetry(fcName: string, fcId: string | undefined, result: unknown, attempt = 0): void {
    if (closedByUser) return
    if (activeSession && !reconnecting) {
      try {
        activeSession.sendToolResponse({
          functionResponses: [{ id: fcId, name: fcName, response: result }],
        })
        return
      } catch (err) {
        console.error(`[Tool ${fcName}] sendToolResponse hatası (attempt=${attempt}):`, err)
      }
    }
    // Session null veya reconnecting — 500ms sonra tekrar dene (max 6 deneme = 3s)
    if (attempt < 6) {
      setTimeout(() => sendToolResponseWithRetry(fcName, fcId, result, attempt + 1), 500)
    } else {
      console.error(`[Tool ${fcName}] sendToolResponse başarısız — ${attempt} deneme sonra vazgeçildi`)
    }
  }

  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.systemPrompt,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: VOICE },
      },
    },
    // Uzun görüşmelerde context limitine takılmamak için sıkıştırma açık.
    // Pencere geniş tutuldu ki müşterinin başta verdiği ad/telefon/araç/tarih
    // gibi bilgiler erkenden kırpılıp model baştan sormasın.
    contextWindowCompression: {
      triggerTokens: 25600 as unknown as string,
      slidingWindow: { targetTokens: 16000 as unknown as string },
    },
    // Müşterinin ve AI'nın söylediklerini text olarak da al — tanı/log için.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Kopuşta resume edebilmek için sunucudan handle iste.
    sessionResumption: {},
    ...(options.realtimeInputConfig ? { realtimeInputConfig: options.realtimeInputConfig } : {}),
  }

  function buildCallbacks() {
    return {
      // onReady yalnızca İLK bağlantıda tetiklenir; reconnect'te tekrar
      // karşılama/greeting tetiklenmesin diye guard'lı.
      onopen: () => {
        if (!readyFired) {
          readyFired = true
          callbacks.onReady()
        }
      },
      onmessage: async (msg: LiveServerMessage) => {
        // Session resumption handle güncellemesi — kopuşta bununla resume ederiz.
        if (msg.sessionResumptionUpdate) {
          if (msg.sessionResumptionUpdate.resumable && msg.sessionResumptionUpdate.newHandle) {
            resumptionHandle = msg.sessionResumptionUpdate.newHandle
          }
          return
        }
        // Sunucu yakında bağlantıyı kapatacak — proaktif resume.
        if (msg.goAway) {
          console.warn(`[Gemini] goAway (timeLeft=${msg.goAway.timeLeft ?? '?'}) — resume ile yeniden bağlanılıyor`)
          void reconnect()
          return
        }

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
                sendToolResponseWithRetry(fcName, fc.id, result)
              })
              .catch((err) => {
                console.error(`[Tool ${fcName}] handler hatası:`, err)
                sendToolResponseWithRetry(fcName, fc.id, { error: 'tool failed' })
              })
          }
          return
        }

        const content = msg.serverContent
        if (!content) {
          // Usage metadata serverContent olmadan da gelebilir
          if (msg.usageMetadata) {
            callbacks.onUsage?.(msg.usageMetadata as {
              promptTokenCount?: number
              candidatesTokenCount?: number
              totalTokenCount?: number
            })
          }
          return
        }

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

        // Input/output transcription — Live API ses verisinin text karşılığı
        // (chunks halinde gelir). Konuşma tamamlanıp tamamlanmadığı bilgisini
        // de iletebilmek için boş text'leri filtreliyoruz.
        if (content.inputTranscription?.text) {
          callbacks.onTranscript('user', content.inputTranscription.text)
        }
        if (content.outputTranscription?.text) {
          callbacks.onTranscript('model', content.outputTranscription.text)
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
      onerror: (e: unknown) => callbacks.onError(e),
      onclose: (e: unknown) => {
        // Kullanıcı/araç bilerek kapattıysa: normal kapanış.
        if (closedByUser) {
          callbacks.onClose()
          return
        }
        const code = (e as { code?: number } | undefined)?.code
        // Beklenmedik kapanış + elimizde resume handle var → sessizce yeniden
        // bağlan. Aksi halde görüşmeyi gerçekten sonlandır.
        if (resumptionHandle && !reconnecting) {
          console.warn(`[Gemini] Beklenmedik kapanış (code=${code ?? '?'}) — resume deneniyor`)
          void reconnect()
        } else {
          if (code && code !== 1000) console.error(`[Gemini] Kapanış code=${code}`)
          callbacks.onClose()
        }
      },
    }
  }

  async function connect(handle?: string) {
    activeSession = await ai.live.connect({
      model: options.model,
      config: handle ? { ...liveConfig, sessionResumption: { handle } } : liveConfig,
      callbacks: buildCallbacks(),
    })
  }

  async function reconnect() {
    if (reconnecting || closedByUser) return
    reconnecting = true
    const prev = activeSession
    try {
      await connect(resumptionHandle)
      console.log('[Gemini] Resume ile yeniden bağlanıldı')
      try { prev?.close() } catch {}
    } catch (err) {
      console.error('[Gemini] Reconnect başarısız:', err)
      callbacks.onClose()
    } finally {
      reconnecting = false
    }
  }

  await connect()

  return {
    sendRealtimeInput: (input: LiveSendRealtimeInputParameters) => {
      try { activeSession?.sendRealtimeInput(input) } catch {}
    },
    sendClientContent: (input: LiveSendClientContentParameters) => {
      try { activeSession?.sendClientContent(input) } catch {}
    },
    sendToolResponse: (input: LiveSendToolResponseParameters) => {
      try { activeSession?.sendToolResponse(input) } catch {}
    },
    close: () => {
      closedByUser = true
      try { activeSession?.close() } catch {}
    },
  }
}
