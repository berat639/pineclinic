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
import { createAppointment, updateAppointment, getCustomerByPhone, getAppointmentsByDateRange } from './db/repositories/appointments'
import { createCalendarEvent, updateCalendarEvent } from './integrations/google-calendar'
import { searchKnowledge } from './services/knowledge'
import { findCustomerDocByPhone } from './db/repositories/knowledge'
import { getToolDescriptions } from './db/repositories/settings'
import { TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, getDefaultToolDescription } from './data/default-tools'

const VOICE = process.env.GEMINI_LIVE_VOICE || 'Orus'

/** randevuOlustur'a şablon/placeholder sızmasını engelle */
export function validateLiveCustomerIdentity(customerName: string | undefined, phone: string | undefined): string | null {
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

/**
 * Build tool declarations dynamically from DB (with fallback to defaults).
 * Called once per session creation.
 */
async function buildToolDeclarations(): Promise<FunctionDeclaration[]> {
  // Fetch all tools.* settings from DB
  let dbDescs: Record<string, string> = {}
  try {
    dbDescs = await getToolDescriptions()
  } catch { /* use defaults */ }

  // Helper: get description from DB or fallback
  const desc = (key: string) => dbDescs[key] ?? getDefaultToolDescription(key) ?? ''

  // ── Fields from DB ────────────────────────────────────────────────────────
  // Format in DB (tools.custom_fields): JSON array of {name, description, required, active}
  // If custom_fields is populated, it defines ALL fields for randevuOlustur.
  // If empty/missing, fall back to hardcoded defaults.
  let allFields: Array<{ name: string; description: string; required?: boolean; active?: boolean }> = []
  try {
    const raw = dbDescs['tools.custom_fields']
    if (raw) allFields = JSON.parse(raw)
  } catch { /* ignore parse errors */ }

  // Build properties and required list from active fields
  const fieldProps: Record<string, unknown> = {}
  const fieldRequired: string[] = []
  
  // Base mandatory fields — always included regardless of custom_fields
  fieldProps.musteri_adi = { type: Type.STRING, description: desc('tools.randevuOlustur.musteri_adi') || 'Müşterinin ad soyadı (gerçek isim, müşteriden sesli alınmalı ve onaylatılmalı)' }
  fieldProps.telefon = { type: Type.STRING, description: desc('tools.randevuOlustur.telefon') || 'Müşteri telefon numarası (05XX ile başlayan 11 hane)' }
  fieldProps.tarih = { type: Type.STRING, description: desc('tools.randevuOlustur.tarih') || 'Randevu tarihi (YYYY-MM-DD formatında)' }
  fieldProps.saat = { type: Type.STRING, description: desc('tools.randevuOlustur.saat') || 'Randevu saati (HH:MM formatında)' }
  fieldRequired.push('musteri_adi', 'telefon', 'tarih', 'saat')

  if (allFields.length > 0) {
    // Dynamic mode: add custom fields on top of base fields
    for (const f of allFields) {
      if (f.active === false) continue
      const safeName = f.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
      // Skip if already defined as base field
      if (fieldProps[safeName]) continue
      // Special handling for enum fields (value contains comma-separated options)
      if (safeName === 'randevu_turu' && f.description.includes(',')) {
        const enumVals = f.description.split(',').map(s => s.trim()).filter(Boolean)
        fieldProps[safeName] = { type: Type.STRING, enum: enumVals, description: 'Randevu türü' }
      } else {
        fieldProps[safeName] = { type: Type.STRING, description: f.description }
      }
      if (f.required && !fieldRequired.includes(safeName)) fieldRequired.push(safeName)
    }
  } else {
    // Fallback: hardcoded extras (backward compat)
    const turuEnum = (dbDescs['tools.randevuOlustur.randevu_turu_enum'] ?? 'service,test_drive,gallery_visit,other')
      .split(',').map(s => s.trim()).filter(Boolean)
    fieldProps.randevu_turu = { type: Type.STRING, enum: turuEnum, description: desc('tools.randevuOlustur.randevu_turu') }
    fieldProps.arac_bilgisi = { type: Type.STRING, description: desc('tools.randevuOlustur.arac_bilgisi') }
    fieldProps.plaka = { type: Type.STRING, description: desc('tools.randevuOlustur.plaka') }
    fieldProps.sorun_veya_talep = { type: Type.STRING, description: desc('tools.randevuOlustur.sorun_veya_talep') }
    fieldRequired.push('randevu_turu')
  }

  return [
    {
      name: 'randevuOlustur',
      description: desc('tools.randevuOlustur'),
      parameters: {
        type: Type.OBJECT,
        properties: fieldProps as Record<string, { type: typeof Type.STRING; description: string }>,
        required: fieldRequired,
      },
    },
    {
      name: 'randevuGuncelle',
      description: desc('tools.randevuGuncelle'),
      parameters: {
        type: Type.OBJECT,
        properties: {
          randevu_id: { type: Type.STRING, description: 'randevuOlustur ile oluşturulan randevunun ID\'si' },
          calendar_event_id: { type: Type.STRING, description: 'Google Calendar event ID\'si (varsa)' },
          musteri_adi: { type: Type.STRING, description: 'Güncellenecek müşteri adı soyadı' },
          telefon: { type: Type.STRING, description: 'Güncellenecek telefon numarası' },
          randevu_turu: { type: Type.STRING, description: 'Güncellenecek randevu türü' },
          arac_bilgisi: { type: Type.STRING, description: 'Güncellenecek ek bilgi' },
          sorun_veya_talep: { type: Type.STRING, description: 'Güncellenecek talep/şikayet' },
          tarih: { type: Type.STRING, description: 'Yeni tarih (YYYY-MM-DD)' },
          saat: { type: Type.STRING, description: 'Yeni saat (HH:MM)' },
        },
        required: ['randevu_id'],
      },
    },
    {
      name: 'searchKnowledgeBase',
      description: desc('tools.searchKnowledgeBase'),
      parameters: {
        type: Type.OBJECT,
        properties: {
          sorgu: { type: Type.STRING, description: 'Aranacak konu veya soru (Türkçe)' },
        },
        required: ['sorgu'],
      },
    },
    {
      name: 'musteriSorgula',
      description: desc('tools.musteriSorgula'),
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
      description: desc('tools.gecmisRandevular'),
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Müşterinin söylediği telefon numarası' },
          limit: { type: Type.INTEGER, description: 'En fazla kaç kayıt (default 5, max 20)' },
        },
        required: ['telefon'],
      },
    },
    {
      name: 'randevuMusaitlikKontrol',
      description: desc('tools.randevuMusaitlikKontrol'),
      parameters: {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: 'Kontrol edilecek tarih (YYYY-MM-DD). Tek gün için.' },
          baslangic_tarih: { type: Type.STRING, description: 'Tarih aralığı başlangıcı (YYYY-MM-DD).' },
          bitis_tarih: { type: Type.STRING, description: 'Tarih aralığı bitişi (YYYY-MM-DD).' },
        },
        required: [],
      },
    },
    {
      name: 'cagriySonlandir',
      description: desc('tools.cagriySonlandir'),
      parameters: { type: Type.OBJECT, properties: {}, required: [] },
    },
  ]
}

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
      console.log('[Randevu:ARGS]', JSON.stringify(args))

      // Resolve fields from multiple possible names (custom_fields may use different keys)
      const rawName = (args.musteri_adi ?? args.ad_soyad ?? args.hasta_adi ?? args.isim ?? args.adi_soyadi ?? args.musteri ?? args.name) as string | undefined
      const rawPhone = (args.telefon ?? args.phone ?? args.tel ?? args.telefon_numarasi ?? args.cep_telefonu) as string | undefined
      const invalid = validateLiveCustomerIdentity(rawName, rawPhone)
      if (invalid) {
        console.warn('[Randevu:REJECTED]', { name: rawName, phone: rawPhone, reason: invalid, allArgs: Object.keys(args) })
        return { success: false, message: invalid }
      }
      const dateStr = (args.tarih ?? args.date ?? args.randevu_tarihi) as string | undefined
      const timeStr = (args.saat ?? args.time ?? args.randevu_saati) as string | undefined
      if (!dateStr || !timeStr) {
        console.warn('[Randevu:REJECTED]', { name: rawName, reason: 'missing date/time', date: dateStr, time: timeStr })
        return { success: false, message: 'Tarih ve saat zorunludur; müşteriden tekrar alın.' }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(new Date(dateStr).getTime())) {
        console.warn('[Randevu:REJECTED]', { name: rawName, reason: 'invalid date format', date: dateStr })
        return { success: false, message: 'Geçersiz tarih formatı; YYYY-MM-DD formatında belirt.' }
      }

      // Collect custom/extra fields (anything not in the known set)
      const knownKeys = new Set([
        'musteri_adi', 'ad_soyad', 'hasta_adi', 'isim', 'adi_soyadi', 'musteri', 'name',
        'telefon', 'phone', 'tel', 'telefon_numarasi', 'cep_telefonu',
        'randevu_turu', 'arac_bilgisi', 'plaka', 'sorun_veya_talep',
        'tarih', 'date', 'randevu_tarihi', 'saat', 'time', 'randevu_saati',
      ])
      const extraFields: Record<string, string> = {}
      for (const [k, v] of Object.entries(args)) {
        if (!knownKeys.has(k) && v !== undefined && v !== null && v !== '') {
          extraFields[k] = String(v)
        }
      }

      let appointment
      try {
        appointment = await createAppointment({
          customerName: (rawName as string).trim(),
          phone: (rawPhone as string).trim(),
          type: ((args.randevu_turu ?? args.type ?? args.tur ?? args.islem_turu ?? 'other') as string),
          vehicleInfo: (args.arac_bilgisi ?? args.arac) as string | undefined,
          issueOrRequest: (args.sorun_veya_talep ?? args.talep ?? args.sorun ?? args.aciklama) as string | undefined,
          date: dateStr,
          time: timeStr,
          sessionId: options.dbSessionId,
          notes: args.plaka ? `Plaka: ${args.plaka}` : undefined,
          extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
        })
      } catch (dbErr) {
        console.error('[Randevu:DB_ERROR]', { name: rawName, phone: rawPhone, error: dbErr })
        return { success: false, message: 'Randevu kaydedilirken bir hata oluştu, lütfen tekrar deneyin.' }
      }
      console.log('[Randevu]', appointment.id, appointment.customerName, args.plaka ? `plaka: ${args.plaka}` : '')

      // Sync to dental calendar (fire-and-forget)
      void (async () => {
        try {
          const { createDentalAppointmentFromVoice } = await import('./db/repositories/dental')
          await createDentalAppointmentFromVoice({
            customerName: appointment.customerName,
            phone: appointment.phone,
            type: appointment.type,
            date: appointment.date,
            time: appointment.time,
            notes: appointment.notes,
          })
          console.log('[Randevu:CalendarSync]', appointment.id)
        } catch (e) { console.error('[Randevu:CalendarSync:ERROR]', e) }
      })()

      // Google Calendar side effect — fire-and-forget arka planda
      // çalışır. Burada `await` etmiyoruz çünkü 500-2000ms
      // sürebilen dış API çağrısıdır; tool response'unu bloklamak Gemini
      // event loop'unu kilitler → müşteri AI'yı duymaz.
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

      return {
        success: true,
        message: `Randevu ${appointment.date} ${appointment.time} için kaydedildi.`,
        id: appointment.id,
        calendar_event_id: null,
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
      // Türk telefon numarası formatı kontrolü: en az 10 rakam olmalı
      const digits = rawPhone.replace(/\D/g, '')
      if (digits.length < 10) {
        console.log(`[DB] musteriSorgula: geçersiz numara format (${rawPhone} → ${digits.length} hane)`)
        return { sonuc: 'Geçerli bir telefon numarası değil. Müşteriden 10 haneli telefon numarasını tekrar iste.' }
      }
      console.log(`[DB] musteriSorgula: telefon=${rawPhone}`)
      try {
        const customer = await getCustomerByPhone(rawPhone)
        if (!customer) {
          // Bilgi tabanında müşteri kaydı ara
          const knowledgeCustomer = await findCustomerDocByPhone(rawPhone)
          if (knowledgeCustomer) {
            console.log(`[DB] musteriSorgula: bilgi tabanından bulundu → ${knowledgeCustomer.name}`)
            return {
              kayitli: true,
              musteri_adi: knowledgeCustomer.name,
              sonuc: `Ad Soyad: ${knowledgeCustomer.name}\n${knowledgeCustomer.content}`,
            }
          }
          console.log(`[DB] musteriSorgula: bulunamadı`)
          return { kayitli: false, sonuc: 'Bu numara ile kayıtlı müşteri bulunamadı. Müşteriden ad soyadını sor.' }
        }
        console.log(`[DB] musteriSorgula: bulundu → ${customer.name}`)
        const info: string[] = []
        info.push(`Ad Soyad: ${customer.name}`)
        info.push(`Telefon: ${customer.phone}`)
        const pastAppointments = customer.appointmentHistory.filter(a => a.isPast)
        const upcomingAppointments = customer.appointmentHistory.filter(a => !a.isPast)
        if (pastAppointments.length > 0) {
          const last = pastAppointments[0]
          info.push(`Son Randevu: ${last.date} ${last.time} — ${last.issueOrRequest || last.type}${last.vehicleInfo ? ` (${last.vehicleInfo})` : ''}`)
        }
        if (upcomingAppointments.length > 0) {
          const next = upcomingAppointments[0]
          info.push(`Yaklaşan Randevu: ${next.date} ${next.time} — ${next.issueOrRequest || next.type}`)
        }
        // Extract plate from notes if available
        const notesWithPlate = customer.appointmentHistory
          .map(a => a as unknown as { notes?: string })
          .find(a => a.notes?.startsWith('Plaka:'))
        const plaka = notesWithPlate ? (notesWithPlate.notes as string).replace('Plaka: ', '') : null
        if (plaka) info.push(`Plaka: ${plaka}`)
        const vehicleInfo = customer.appointmentHistory.find(a => a.vehicleInfo)?.vehicleInfo
        if (vehicleInfo) info.push(`Araç: ${vehicleInfo}`)
        return {
          kayitli: true,
          musteri_adi: customer.name,
          plaka: plaka || null,
          arac: vehicleInfo || null,
          sonuc: info.join('\n'),
        }
      } catch (err) {
        console.error('[DB] musteriSorgula exception:', err)
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
        const customer = await getCustomerByPhone(rawPhone)
        if (!customer || customer.appointmentHistory.length === 0) {
          return { sonuc: 'Bu numara için kayıtlı önceki randevu bulunamadı.' }
        }
        const pastAppointments = customer.appointmentHistory.filter(a => a.isPast).slice(0, limit)
        if (pastAppointments.length === 0) {
          return { sonuc: 'Bu numara için geçmiş randevu bulunamadı.' }
        }
        const TYPE_LABELS: Record<string, string> = {
          service: 'Servis', test_drive: 'Test Sürüşü', gallery_visit: 'Galeri Ziyareti', other: 'Randevu',
        }
        const formatted = pastAppointments
          .map((r, i) => {
            const parts = [
              `[${i + 1}]`,
              r.date,
              r.time,
              r.issueOrRequest ? `— ${r.issueOrRequest}` : `— ${TYPE_LABELS[r.type] || r.type}`,
              r.vehicleInfo ? `(${r.vehicleInfo})` : '',
            ]
            return parts.filter(Boolean).join(' ')
          })
          .join('\n')
        return { sonuc: formatted }
      } catch (err) {
        console.error('[DB] gecmisRandevular exception:', err)
        return { sonuc: 'Geçmiş randevu servisi şu an kullanılamıyor.' }
      }
    }
    if (name === 'randevuMusaitlikKontrol') {
      const tarih = args.tarih as string | undefined
      const from = args.baslangic_tarih as string | undefined
      const to = args.bitis_tarih as string | undefined
      // En az bir geçerli tarih parametresi zorunlu
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      const hasValidDate = (tarih && dateRegex.test(tarih)) || (from && dateRegex.test(from))
      if (!hasValidDate) {
        console.log(`[DB] randevuMusaitlikKontrol: geçersiz/eksik tarih (tarih=${tarih} from=${from} to=${to})`)
        return { sonuc: 'Geçerli bir tarih belirtilmedi. Müşteriye hangi tarihte müsait olduğunu sor ve YYYY-MM-DD formatında tarih ile tekrar çağır.' }
      }
      console.log(`[DB] randevuMusaitlikKontrol: tarih=${tarih} from=${from} to=${to}`)
      try {
        const result = await getAppointmentsByDateRange({
          date: tarih,
          from: from,
          to: to || from,
        })
        const count = result.length
        if (count === 0) {
          return { sonuc: `${tarih || `${from} - ${to}`} tarihinde henüz randevu yok — müsait.` }
        }
        const TYPE_LABELS: Record<string, string> = {
          service: 'Servis', test_drive: 'Test Sürüşü', gallery_visit: 'Galeri Ziyareti', other: 'Randevu',
        }
        const summary = result
          .map((a, i) => `[${i + 1}] ${a.date} ${a.time || '?'} — ${a.issueOrRequest || TYPE_LABELS[a.type] || 'Randevu'}`)
          .join('\n')
        return {
          sonuc: `${tarih || `${from} - ${to}`} tarihinde ${count} randevu mevcut:\n${summary}\n\nNot: Mevcut randevu sayısına göre müsaitlik değerlendir.`,
        }
      } catch (err) {
        console.error('[DB] randevuMusaitlikKontrol exception:', err)
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
  function sendToolResponseWithRetry(fcName: string, fcId: string | undefined, result: Record<string, unknown>, attempt = 0): void {
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

  const toolDeclarations = await buildToolDeclarations()

  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.systemPrompt,
    tools: [{ functionDeclarations: toolDeclarations }],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: VOICE },
      },
      languageCode: 'tr-TR',
    },
    // Uzun görüşmelerde context limitine takılmamak için sıkıştırma açık.
    // Pencere geniş tutuldu ki müşterinin başta verdiği ad/telefon/araç/tarih
    // gibi bilgiler erkenden kırpılıp model baştan sormasın.
    contextWindowCompression: {
      triggerTokens: '25600',
      slidingWindow: { targetTokens: '16000' },
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

        // Bağlantı stabil kaldıysa (>10s) sayacı sıfırla
        const sinceLastSuccess = Date.now() - lastReconnectSuccessAt
        if (lastReconnectSuccessAt > 0 && sinceLastSuccess >= STABLE_CONNECTION_MS) {
          reconnectAttempts = 0
        }

        // Beklenmedik kapanış + elimizde resume handle var → sessizce yeniden
        // bağlan. Aksi halde görüşmeyi gerçekten sonlandır.
        if (resumptionHandle && !reconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.warn(`[Gemini] Beklenmedik kapanış (code=${code ?? '?'}) — resume deneniyor (attempt=${reconnectAttempts + 1})`)
          void reconnect()
        } else if (!reconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          // Handle yok ama hâlâ deneme hakkımız var → fresh reconnect
          console.warn(`[Gemini] Beklenmedik kapanış (code=${code ?? '?'}) — handle yok, fresh reconnect deneniyor`)
          void reconnectFresh()
        } else {
          if (code && code !== 1000) console.error(`[Gemini] Kapanış code=${code}, reconnect limit aşıldı veya handle yok`)
          callbacks.onClose()
        }
      },
    }
  }

  async function connect(handle?: string) {
    const modelName = options.model.startsWith('models/') ? options.model : `models/${options.model}`
    activeSession = await ai.live.connect({
      model: modelName,
      config: handle ? { ...liveConfig, sessionResumption: { handle } } : liveConfig,
      callbacks: buildCallbacks(),
    })
  }

  let reconnectAttempts = 0
  let lastReconnectSuccessAt = 0
  /** Toplam reconnect sayısı (sıfırlanmaz) — sürekli düşen session'ları tespit etmek için */
  let totalReconnects = 0
  const MAX_RECONNECT_ATTEMPTS = 5
  /** Session ömrü boyunca max toplam reconnect — bu aşılırsa session zombi sayılır */
  const MAX_TOTAL_RECONNECTS = 15
  const BASE_BACKOFF_MS = 500
  /** Reconnect sonrası bağlantı bu kadar süre ayakta kalmalı ki sayaç sıfırlansın */
  const STABLE_CONNECTION_MS = 10_000

  async function reconnect() {
    if (reconnecting || closedByUser) return
    totalReconnects++

    // Zombi session koruması: toplam reconnect sayısı çok yüksekse tamamen kapat
    if (totalReconnects > MAX_TOTAL_RECONNECTS) {
      console.error(`[Gemini] Session ${options.dbSessionId} zombi — ${totalReconnects} toplam reconnect, kapatılıyor`)
      closedByUser = true
      try { activeSession?.close() } catch {}
      callbacks.onClose()
      return
    }

    reconnecting = true
    reconnectAttempts++

    // Eğer son başarılı reconnect çok yakınsa (bağlantı hemen düştü),
    // sayacı sıfırlama — sonsuz döngüyü engelle.
    const sinceLastSuccess = Date.now() - lastReconnectSuccessAt
    if (lastReconnectSuccessAt > 0 && sinceLastSuccess < STABLE_CONNECTION_MS) {
      // Bağlantı stabil değildi, sayacı sıfırlama
    }

    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini] Reconnect limiti aşıldı (${MAX_RECONNECT_ATTEMPTS} deneme) — oturum sonlandırılıyor`)
      reconnecting = false
      resumptionHandle = undefined
      callbacks.onClose()
      return
    }

    const baseBackoff = BASE_BACKOFF_MS * Math.pow(2, reconnectAttempts - 1)
    const jitter = Math.floor(Math.random() * baseBackoff * 0.5)
    const backoffMs = baseBackoff + jitter
    console.log(`[Gemini] Reconnect deneme ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (total=${totalReconnects}) — ${backoffMs}ms beklenecek`)
    await new Promise(resolve => setTimeout(resolve, backoffMs))

    if (closedByUser) { reconnecting = false; return }

    const prev = activeSession
    try {
      await connect(resumptionHandle)
      lastReconnectSuccessAt = Date.now()
      console.log('[Gemini] Resume ile yeniden bağlanıldı')
      // Sayacı yalnızca bağlantı stabil kaldıysa sıfırla (onclose'da kontrol edilir).
      // Hemen düşerse sayaç artmaya devam eder → MAX'a ulaşınca durur.
      try { prev?.close() } catch {}
    } catch (err) {
      console.error('[Gemini] Reconnect başarısız:', err)
      resumptionHandle = undefined // Stale handle'ı temizle
      reconnecting = false
      // Stale handle ile resume başarısız olduysa handle'sız (fresh) bir deneme daha yap
      if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        console.log('[Gemini] Handle\'sız (fresh) reconnect deneniyor...')
        reconnecting = false
        void reconnectFresh()
      } else {
        callbacks.onClose()
      }
      return
    } finally {
      reconnecting = false
    }
  }

  /** Stale resume handle ile bağlantı kurulamadığında handle'sız yeni session aç. */
  async function reconnectFresh() {
    if (reconnecting || closedByUser) return
    totalReconnects++

    if (totalReconnects > MAX_TOTAL_RECONNECTS) {
      console.error(`[Gemini] Session ${options.dbSessionId} zombi (fresh) — ${totalReconnects} toplam reconnect, kapatılıyor`)
      closedByUser = true
      try { activeSession?.close() } catch {}
      callbacks.onClose()
      return
    }

    reconnecting = true
    reconnectAttempts++

    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini] Fresh reconnect limiti de aşıldı — oturum sonlandırılıyor`)
      reconnecting = false
      resumptionHandle = undefined
      callbacks.onClose()
      return
    }

    const jitter = Math.floor(Math.random() * 500)
    console.log(`[Gemini] Fresh reconnect deneme ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} (total=${totalReconnects})`)
    await new Promise(resolve => setTimeout(resolve, 1000 + jitter))

    if (closedByUser) { reconnecting = false; return }

    const prev = activeSession
    try {
      resumptionHandle = undefined
      await connect() // handle'sız → yeni session
      lastReconnectSuccessAt = Date.now()
      console.log('[Gemini] Fresh session ile yeniden bağlanıldı')
      try { prev?.close() } catch {}
    } catch (err) {
      console.error('[Gemini] Fresh reconnect de başarısız:', err)
      reconnecting = false
      callbacks.onClose()
      return
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
