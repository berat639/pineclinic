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
export async function buildToolDeclarations(direction: string = 'inbound'): Promise<FunctionDeclaration[]> {
  const { getActiveFlow, flowToToolFields } = await import('./db/repositories/flows')
  let dbDescs: Record<string, string> = {}
  try { dbDescs = await getToolDescriptions() } catch { /* use defaults */ }
  const desc = (key: string) => dbDescs[key] ?? getDefaultToolDescription(key) ?? ''

  // Build randevuOlustur fields from flow (zero hardcoded fields)
  const flow = await getActiveFlow(direction)
  let fieldProps: Record<string, unknown> = {}
  let fieldRequired: string[] = []

  if (flow && flow.nodes.some(n => n.type === 'FIELD')) {
    const { properties, required } = flowToToolFields(flow)
    for (const [k, v] of Object.entries(properties)) {
      fieldProps[k] = v.enum
        ? { type: Type.STRING, enum: v.enum, description: v.description }
        : { type: Type.STRING, description: v.description }
    }
    fieldRequired = required
  } else {
    // Fallback: legacy custom_fields from business_settings
    let allFields: Array<{ name: string; description: string; required?: boolean; active?: boolean }> = []
    try {
      const raw = dbDescs['tools.custom_fields']
      if (raw) allFields = JSON.parse(raw)
    } catch { /* ignore */ }

    if (allFields.length > 0) {
      for (const f of allFields) {
        if (f.active === false) continue
        const safeName = f.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
        fieldProps[safeName] = { type: Type.STRING, description: f.description }
        if (f.required) fieldRequired.push(safeName)
      }
    }
  }

  // Ensure doktor_id and musteri_adi are always available as optional params
  if (!fieldProps['doktor_id']) {
    fieldProps['doktor_id'] = { type: Type.STRING, description: 'Mevcut hasta için atanacak doktorun ID\'si (musteriSorgula sonucundaki doktor_gecmisi\'nden). Eğer hasta seçim yapmazsa veya farketmez derse boş (null) bırakın.' }
  }
  if (!fieldProps['musteri_adi']) {
    fieldProps['musteri_adi'] = { type: Type.STRING, description: 'Müşteri adı soyadı (kayıtlı müşteri için musteriSorgula\'dan gelen ad)' }
  }

  const tools: FunctionDeclaration[] = [
    {
      name: 'randevuOlustur',
      description: 'Müşteri randevu almak istediğinde randevu oluşturur ve kaydeder. Aynı arama içinde birden fazla kişi için sırayla birden fazla kez çağrılabilir.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: { type: Type.STRING, description: 'Hasta adı ve soyadı' },
          telefon: { type: Type.STRING, description: 'Hasta telefon numarası' },
          tarih: { type: Type.STRING, description: 'Randevu tarihi (YYYY-MM-DD formatında)' },
          saat: { type: Type.STRING, description: 'Randevu saati (HH:MM formatında)' },
          sikayet: { type: Type.STRING, description: 'Hastanın şikayeti veya işlem talebi' },
          doktor_id: { type: Type.STRING, description: 'Tercih edilen hekim ID\'si (Hasta hekim belirtmezse veya farketmez derse boş bırakın)' },
          ...fieldProps,
        },
        required: ['musteri_adi', 'telefon', 'tarih', 'saat'],
      },
    },
    {
      name: 'randevuGuncelle',
      description: 'Mevcut bir randevunun tarih, saat veya diğer bilgilerini günceller.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          randevu_id: { type: Type.STRING, description: 'Güncellenecek randevu ID\'si' },
          musteri_adi: { type: Type.STRING, description: 'Müşteri adı soyadı' },
          telefon: { type: Type.STRING, description: 'Telefon numarası' },
          tarih: { type: Type.STRING, description: 'Yeni tarih (YYYY-MM-DD)' },
          saat: { type: Type.STRING, description: 'Yeni saat (HH:MM)' },
          sorun_veya_talep: { type: Type.STRING, description: 'Şikayet / talep' },
        },
        required: ['randevu_id'],
      },
    },
    {
      name: 'musteriSorgula',
      description: 'Arayan telefon numarasına göre hastayı sorgular; kayıtlı ise ad soyad ve geçmiş randevularını döndürür.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Sorgulanacak telefon numarası' },
        },
        required: ['telefon'],
      },
    },
    {
      name: 'gecmisRandevular',
      description: 'Müşterinin geçmiş randevu listesini döndürür.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Telefon numarası' },
          limit: { type: Type.INTEGER, description: 'Maksimum kayıt sayısı' },
        },
        required: ['telefon'],
      },
    },
    {
      name: 'randevuMusaitlikKontrol',
      description: 'Belirli bir tarihteki randevu yoğunluğunu ve müsaitliği kontrol eder.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          tarih: { type: Type.STRING, description: 'Kontrol edilecek tarih (YYYY-MM-DD)' },
          baslangic_tarih: { type: Type.STRING, description: 'Başlangıç tarihi (YYYY-MM-DD)' },
          bitis_tarih: { type: Type.STRING, description: 'Bitiş tarihi (YYYY-MM-DD)' },
        },
      },
    },
    {
      name: 'searchKnowledgeBase',
      description: 'Klinik hakkında, doktorlar, hizmetler veya çalışma saatleri hakkında bilgi tabanında arama yapar.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sorgu: { type: Type.STRING, description: 'Aranacak kelime veya soru' },
        },
        required: ['sorgu'],
      },
    },
    {
      name: 'hastaNotKaydet',
      description: 'Hasta randevu oluşturmayıp kliniğe bir not, mesaj veya şikayet iletmek istediğinde bankonun görmesi için not kaydeder.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          telefon: { type: Type.STRING, description: 'Hastanın telefon numarası' },
          not: { type: Type.STRING, description: 'Hastanın kliniğe iletmek istediği not veya mesaj' },
          hasta_adi: { type: Type.STRING, description: 'Hastanın adı ve soyadı (biliniyorsa)' },
        },
        required: ['telefon', 'not'],
      },
    },
    {
      name: 'aramaAktar',
      description: 'Aramayı yetkili birime (resepsiyon, banko, acil veya ilgili dahili) aktarır.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          hedef: { type: Type.STRING, description: 'Aktarılacak hedef: "resepsiyon", "banko", "acil" veya telefon numarası' },
          sebep: { type: Type.STRING, description: 'Aktarım sebebi' },
        },
        required: ['hedef'],
      },
    },
    {
      name: 'cagriySonlandir',
      description: 'Müşteri ile görüşme tamamlandığında veya müşteri vedalaştığında çağrıyı sonlandırır.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
  ]
  return tools
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
    voiceName?: string
    realtimeInputConfig?: RealtimeInputConfig
    telephonyChannel?: string
    direction?: string
  }
) {
  // Track last phone used in musteriSorgula so randevuOlustur can reuse it
  let lastPhoneUsed: string | null = null

  async function handleTool(name: string, args: Record<string, unknown>) {
    console.log(`[Tool:${name}]`, JSON.stringify(args).slice(0, 300))

    if (name === 'randevuOlustur') {
      console.log('[Randevu:ARGS]', JSON.stringify(args))

      // Ensure telefon is present (AI might omit it after musteriSorgula)
      if (!args.telefon && lastPhoneUsed) {
        args.telefon = lastPhoneUsed
      }

      let appointment
      try {
        const { createFlowAppointment } = await import('./db/repositories/appointments')
        appointment = await createFlowAppointment(
          args as Record<string, unknown>,
          options.dbSessionId,
        )
      } catch (dbErr) {
        console.error('[Randevu:DB_ERROR]', dbErr)
        return { success: false, message: 'Randevu kaydedilirken bir hata oluştu, lütfen tekrar deneyin.' }
      }
      console.log('[Randevu:OK]', appointment.id, JSON.stringify(appointment.data).slice(0, 200))

      // Sync to dental calendar (fire-and-forget, timeConfirmed=false for reception approval)
      void (async () => {
        try {
          const { createDentalAppointmentFromVoice } = await import('./db/repositories/dental')
          const providedDocId = args.doktor_id as string
          let finalDoctorId: string | null = null
          if (providedDocId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(providedDocId)) {
            finalDoctorId = providedDocId
          }
          await createDentalAppointmentFromVoice({
            customerName: appointment.customerName,
            phone: appointment.phone,
            type: appointment.type || 'kontrol',
            date: appointment.date,
            time: appointment.time,
            notes: appointment.notes,
            complaint: (args.sikayet as string) || (args.hastaSikayeti as string) || undefined,
            doctorId: finalDoctorId,
          })
          console.log('[Randevu:CalendarSync]', appointment.id)
        } catch (e) { console.error('[Randevu:CalendarSync:ERROR]', e) }
      })()

      return {
        success: true,
        message: `Randevu talebiniz ${appointment.date} ${appointment.time} için alındı. Başka biri için de randevu oluşturmak ister misiniz, yoksa yardımcı olabileceğim başka bir konu var mı?`,
        id: appointment.id,
      }
    }

    if (name === 'hastaNotKaydet') {
      const phone = (args.telefon as string | undefined) || lastPhoneUsed || ''
      const noteContent = (args.not as string | undefined) || (args.mesaj as string | undefined) || ''
      const patientName = (args.hasta_adi as string | undefined) || (args.musteri_adi as string | undefined) || null

      if (!noteContent.trim()) {
        return { success: false, message: 'Kaydedilecek bir not metni belirtilmedi.' }
      }

      try {
        const { createPatientNote } = await import('./db/repositories/dental')
        const fullContent = patientName ? `[${patientName}] ${noteContent}` : noteContent
        await createPatientNote({
          phone,
          content: fullContent,
          source: 'voice',
        })
        return {
          success: true,
          message: 'Notunuz başarıyla kaydedildi ve klinik bankosuna iletildi. Yetkililerimiz en kısa sürede size dönüş sağlayacaktır.',
        }
      } catch (err) {
        console.error('[hastaNotKaydet] Hata:', err)
        return { success: false, message: 'Not kaydedilirken bir hata oluştu.' }
      }
    }

    if (name === 'aramaAktar') {
      const targetKey = (args.hedef as string | undefined)?.toLowerCase().trim() || 'resepsiyon'
      console.log(`[aramaAktar] Hedef: ${targetKey}, Sebep: ${args.sebep || 'Belirtilmedi'}`)

      try {
        const { getSetting } = await import('./db/repositories/settings')
        const phonebookRaw = await getSetting('transfer.phonebook')
        let phonebook: Array<{ label: string; number: string }> = []
        if (phonebookRaw) {
          try { phonebook = JSON.parse(phonebookRaw) } catch {}
        }

        // Match from phonebook or default settings
        let targetNumber = ''
        const found = phonebook.find(p => p.label.toLowerCase().includes(targetKey) || targetKey.includes(p.label.toLowerCase()))
        if (found) {
          targetNumber = found.number
        } else if (/^\+?\d{7,15}$/.test(targetKey)) {
          targetNumber = targetKey
        } else {
          const directSetting = await getSetting(`transfer.${targetKey}`)
          if (directSetting) {
            targetNumber = directSetting
          } else if (phonebook.length > 0) {
            targetNumber = phonebook[0].number
          }
        }

        if (!targetNumber) {
          console.warn(`[aramaAktar] Hedef numara bulunamadı: ${targetKey}`)
          return {
            success: false,
            message: 'Şu anda aktarılacak hat yanıt vermiyor veya meşgul. Dilerseniz notunuzu alıp ekibimize iletebilirim.',
          }
        }

        if (options.telephonyChannel) {
          const { transferCall } = await import('./services/asterisk-ami')
          const result = await transferCall(options.telephonyChannel, targetNumber)
          if (result.success) {
            return {
              success: true,
              message: 'Aramanız yetkili birimimize aktarılıyor, lütfen hattan ayrılmayın.',
            }
          }
        }

        return {
          success: false,
          message: 'Şu an operatörlerimizin tümü meşgul, çağrınızı aktaramadım. Dilerseniz notunuzu alabilirim, size dönüş yaparlar.',
        }
      } catch (err) {
        console.error('[aramaAktar] Hata:', err)
        return {
          success: false,
          message: 'Aktarım sırasında bir sorun oluştu. Dilerseniz notunuzu alabilirim.',
        }
      }
    }

    if (name === 'randevuGuncelle') {
      const appointmentId = args.randevu_id as string
      const updateData: Parameters<typeof updateAppointment>[1] = {}
      if (args.musteri_adi) updateData.customerName = args.musteri_adi as string
      if (args.telefon) updateData.phone = args.telefon as string
      if (args.randevu_turu) updateData.type = args.randevu_turu as string
      if (args.sorun_veya_talep !== undefined) updateData.issueOrRequest = args.sorun_veya_talep as string
      if (args.tarih) updateData.date = args.tarih as string
      if (args.saat) updateData.time = args.saat as string

      const updated = await updateAppointment(appointmentId, updateData)
      if (!updated) return { success: false, message: 'Randevu bulunamadı.' }

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
      const digits = rawPhone.replace(/\D/g, '')
      if (digits.length < 10) {
        return { sonuc: 'Geçerli bir telefon numarası değil. Müşteriden 10 haneli telefon numarasını tekrar iste.' }
      }
      lastPhoneUsed = rawPhone
      console.log(`[DB] musteriSorgula: telefon=${rawPhone}`)
      try {
        const customer = await getCustomerByPhone(rawPhone)
        const { getPatientDoctorHistory } = await import('./db/repositories/dental')
        const doktorGecmisi = await getPatientDoctorHistory(rawPhone)

        if (!customer) {
          const knowledgeCustomer = await findCustomerDocByPhone(rawPhone)
          if (knowledgeCustomer) {
            return {
              kayitli: true,
              musteri_adi: knowledgeCustomer.name,
              doktor_gecmisi: doktorGecmisi.length > 0 ? doktorGecmisi : undefined,
              sonuc: `Hasta Adı: ${knowledgeCustomer.name}`,
            }
          }
          if (doktorGecmisi.length > 0) {
            return {
              kayitli: true,
              musteri_adi: null,
              doktor_gecmisi: doktorGecmisi,
              sonuc: `Kayıtlı hasta bulundu.\nDoktor geçmişi: ${doktorGecmisi.map(d => `${d.doktor_adi} (son işlem: ${d.son_tedavi})`).join(', ')}`,
            }
          }
          return { kayitli: false, sonuc: 'Bu numara ile kayıtlı hasta bulunamadı. Hastadan ad ve soyadını sor.' }
        }
        
        const info: string[] = []
        info.push(`Ad Soyad: ${customer.name}`)
        info.push(`Telefon: ${customer.phone}`)
        const pastAppointments = customer.appointmentHistory.filter(a => a.isPast)
        const upcomingAppointments = customer.appointmentHistory.filter(a => !a.isPast)
        if (pastAppointments.length > 0) {
          const last = pastAppointments[0]
          info.push(`Son Randevu: ${last.date} ${last.time} — ${last.issueOrRequest || last.type}`)
        }
        if (upcomingAppointments.length > 0) {
          const next = upcomingAppointments[0]
          info.push(`Yaklaşan Randevu: ${next.date} ${next.time} — ${next.issueOrRequest || next.type}`)
        }
        if (doktorGecmisi.length > 0) {
          info.push(`Doktor Geçmişi: ${doktorGecmisi.map(d => `${d.doktor_adi} (son: ${d.son_tedavi})`).join(', ')}`)
        }
        return {
          kayitli: true,
          musteri_adi: customer.name,
          doktor_gecmisi: doktorGecmisi.length > 0 ? doktorGecmisi : undefined,
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
          service: 'Tedavi', test_drive: 'Muayene', gallery_visit: 'Kontrol', other: 'Randevu',
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
          service: 'Tedavi', test_drive: 'Muayene', gallery_visit: 'Kontrol', other: 'Randevu',
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

  const toolDeclarations = await buildToolDeclarations(options.direction)

  const liveConfig: any = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.systemPrompt,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: options.voiceName || 'Aoede' },
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

  if (toolDeclarations.length > 0) {
    liveConfig.tools = [{ functionDeclarations: toolDeclarations }]
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
