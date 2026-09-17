import { buildToolDeclarations } from './services/assistant-tool-declarations'
export { buildToolDeclarations } from './services/assistant-tool-declarations'
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
import { runWithTenantContext } from './tenancy/context'
import { TOOL_DESCRIPTIONS, TOOL_PARAM_DESCRIPTIONS, getDefaultToolDescription } from './data/default-tools'
import {
  classifyTransferConfirmation,
  findAutomaticTransferRule,
  findTransferConfirmationCandidate,
  findTransferRuleForRequest,
  getTransferConfirmationQuestion,
  normalizeTransferPhoneNumber,
  resolveTransferPhonebookTarget,
  type AutomaticTransferRule,
} from './services/transfer-triggers'

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
    callerPhone?: string
    direction?: string
    clinicId?: string
    hostname?: string
    enableGoogleSearch?: boolean
    automaticTransferRules?: readonly AutomaticTransferRule[]
    enforceConfiguredTransferRules?: boolean
  }
) {
  // Track last phone used in musteriSorgula so randevuOlustur can reuse it
  let lastPhoneUsed: string | null = null
  let locationSent = false
  let transferAttempted = false
  let automaticTransferStarted = false
  let automaticTransferTranscript = ''
  let transferConfirmationTranscript = ''
  let confirmedTransferRuleId: string | null = null
  let pendingTransferConfirmation: {
    ruleId: string
    target: string
    reason: string
    question: string
  } | null = null

  async function handleTool(name: string, args: Record<string, unknown>) {
    console.log(`[Tool:${name}]`, JSON.stringify(args).slice(0, 300))

    if (name === 'randevuOlustur') {
      if (!args.telefon && lastPhoneUsed) args.telefon = lastPhoneUsed
      try {
        const { createAssistantAppointment } = await import('./services/assistant-appointments')
        const appointment = await createAssistantAppointment(args, { sessionId: options.dbSessionId })
        return { success: true, id: appointment.id, message: `Randevu talebiniz ${appointment.date} ${appointment.time} için alındı. Başka bir konuda yardımcı olabilir miyim?` }
      } catch {
        return { success: false, message: 'Randevu oluşturulamadı. Ad, telefon, tarih ve saati kontrol edin.' }
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

    if (name === 'whatsappKonumGonder') {
      if (locationSent) return { success: true, message: 'Konum bu görüşme sırasında daha önce WhatsApp üzerinden gönderildi.' }
      if (!options.callerPhone) return { success: false, message: 'Arayan numara alınamadı. Kullanıcıdan WhatsApp numarasını istemek gerekiyor.' }
      try {
        const { sendLocationToCaller } = await import('./services/voice-whatsapp')
        await sendLocationToCaller(options.callerPhone)
        locationSent = true
        return { success: true, message: 'Konum arayan numaraya WhatsApp üzerinden gönderildi. Kullanıcıya kısa bir sesli onay ver.' }
      } catch {
        return { success: false, message: 'Konum WhatsApp üzerinden gönderilemedi. Kullanıcıya bağlantının şu an gönderilemediğini söyle.' }
      }
    }

    if (name === 'aramaAktar') {
      if (transferAttempted) {
        return { success: true, message: 'Arama aktarımı zaten başlatıldı.' }
      }

      const requestedTarget = (args.hedef as string | undefined) || 'resepsiyon'
      const reason = String(args.sebep || 'Belirtilmedi')
      const configuredRule = findTransferRuleForRequest(
        requestedTarget,
        reason,
        options.automaticTransferRules || [],
      )
      if (options.enforceConfiguredTransferRules && !configuredRule) {
        console.warn(`[aramaAktar] Reddedildi: aktif Flow Builder düğümünde tanımsız hedef -> ${requestedTarget}`)
        return {
          success: false,
          message: 'Bu aktarım hedefi aktif konuşma akışında tanımlı değil. Aktarım yapılmadı.',
        }
      }
      // A configured Flow Builder node is authoritative; do not let a model
      // generated tool argument redirect to a different number.
      const rawTarget = configuredRule?.target || requestedTarget

      if (configuredRule?.requiresConfirmation && confirmedTransferRuleId !== configuredRule.id) {
        const question = getTransferConfirmationQuestion(configuredRule)
        pendingTransferConfirmation = {
          ruleId: configuredRule.id,
          target: rawTarget,
          reason,
          question,
        }
        transferConfirmationTranscript = ''
        automaticTransferStarted = true
        console.log(`[aramaAktar] Dinamik aktarım onay bekliyor: "${configuredRule.keyword || configuredRule.target}" -> ${rawTarget}`)
        return {
          success: false,
          confirmationRequired: true,
          message: `Aktarım henüz yapılmadı. Kullanıcıya yalnızca ${JSON.stringify(question)} diye sor ve cevabını bekle. Açıkça olumlu cevap vermeden aramaAktar aracını tekrar çağırma.`,
        }
      }

      transferAttempted = true
      confirmedTransferRuleId = null
      pendingTransferConfirmation = null
      const targetKey = rawTarget.toLowerCase().trim()
      console.log(`[aramaAktar] Hedef: ${targetKey}, Sebep: ${reason}`)
      const transferStartedAt = Date.now()

      try {
        // Sayısal Flow Builder hedefinde DB/rehber sorgusunu tamamen atla.
        let targetNumber = normalizeTransferPhoneNumber(rawTarget)
        if (!targetNumber) {
          const { getSetting } = await import('./db/repositories/settings')
          const [phonebookRaw, directSetting] = await Promise.all([
            getSetting('transfer.phonebook'),
            getSetting(`transfer.${targetKey}`),
          ])
          let phonebook: Array<{ label: string; number: string }> = []
          if (phonebookRaw) {
            try { phonebook = JSON.parse(phonebookRaw) } catch {}
          }
          targetNumber = resolveTransferPhonebookTarget(rawTarget, phonebook)
            || normalizeTransferPhoneNumber(directSetting || '')
        }

        if (!targetNumber) {
          transferAttempted = false
          console.warn(`[aramaAktar] Hedef numara bulunamadı: ${targetKey}`)
          return {
            success: false,
            message: 'Şu anda aktarılacak hat yanıt vermiyor veya meşgul. Dilerseniz notunuzu alıp Berat Bey\'e iletebilirim.',
          }
        }

        if (options.telephonyChannel) {
          // Açık kullanıcı onayından sonra doğrudan AMI yönlendirmesini başlat.
          const { transferCall } = await import('./services/asterisk-ami')
          const result = await transferCall(options.telephonyChannel, targetNumber)
          console.log(`[PERF] transfer_call: ${Date.now() - transferStartedAt}ms`)
          if (result.success) {
            return {
              success: true,
              message: 'Aramanız başarıyla aktarılıyor, lütfen hattan ayrılmayın.',
            }
          } else {
            console.error(`[aramaAktar] transferCall başarısız:`, result.message)
          }
        } else {
          console.log(`[aramaAktar] telephonyChannel yok (web/test oturumu). Hedef: ${targetNumber}`)
          return {
            success: true,
            message: `Arama aktarma talebiniz simüle edildi (${targetNumber} numarasına aktarılıyor).`,
          }
        }

        return {
          success: false,
          message: 'Şu an hatta ulaşılamadı, aktarım yapılamadı. Dilerseniz notunuzu alabilirim, Berat Bey\'e iletirim.',
        }
      } catch (err) {
        transferAttempted = false
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
    if (name === 'havaDurumuSorgula') {
      const sehir = (args.sehir as string | undefined)?.trim() || 'Ankara'
      try {
        const coords: Record<string, { lat: number; lon: number; name: string }> = {
          ankara: { lat: 39.9334, lon: 32.8597, name: 'Ankara' },
          istanbul: { lat: 41.0082, lon: 28.9784, name: 'İstanbul' },
          izmir: { lat: 38.4192, lon: 27.1287, name: 'İzmir' },
          antalya: { lat: 36.8969, lon: 30.7133, name: 'Antalya' },
          bursa: { lat: 40.1885, lon: 29.0610, name: 'Bursa' },
        }
        const key = sehir.toLowerCase().replace(/[^a-z]/g, '')
        const loc = coords[key] || { lat: 39.9334, lon: 32.8597, name: sehir }

        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          const data = await res.json() as { current?: { temperature_2m: number; weather_code: number } }
          const temp = Math.round(data.current?.temperature_2m ?? 20)
          const code = data.current?.weather_code ?? 0
          let desc = 'güneşli ve açık'
          if (code >= 1 && code <= 3) desc = 'parçalı bulutlu'
          else if (code >= 45 && code <= 48) desc = 'sisli'
          else if (code >= 51 && code <= 65) desc = 'yağmurlu'
          else if (code >= 71 && code <= 77) desc = 'karlı'
          else if (code >= 80 && code <= 82) desc = 'sağanak yağışlı'
          else if (code >= 95) desc = 'gök gürültülü fırtınalı'
          return { success: true, sehir: loc.name, sicaklik: `${temp}°C`, durum: desc, message: `${loc.name}'da şu an hava yaklaşık ${temp} derece ve ${desc}.` }
        }
      } catch (err) {
        console.warn('[havaDurumuSorgula] Hata:', err)
      }
      return { success: true, sehir, sicaklik: '20°C', durum: 'açık', message: `${sehir}'da hava şu an gayet güzel ve ılıman görünüyor.` }
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

  const isMaleVoice = ['Puck', 'Charon', 'Fenrir'].includes(options.voiceName || '')
  const genderInstruction = isMaleVoice
    ? 'ÖNEMLİ: Sen bir erkek asistansın. Sesin ve tonlaman her zaman bir erkek sesi olmalıdır.'
    : 'ÖNEMLİ: Sen bir kadın asistansın. Sesin ve tonlaman her zaman bir kadın sesi olmalıdır. Hiçbir zaman sesini kalınlaştırma veya erkek sesine geçme.'

  const liveConfig: any = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: options.systemPrompt + '\n\n' + genderInstruction,
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

  const tools: any[] = []
  if (toolDeclarations.length > 0) {
    tools.push({ functionDeclarations: toolDeclarations })
  }
  if (options.enableGoogleSearch) {
    tools.push({ googleSearch: {} })
    console.log('[Gemini Live] Google Search Grounding aktif edildi 🔍')
  }
  if (tools.length > 0) {
    liveConfig.tools = tools
  }

  // setupComplete geldikten sonra içerik gönderilebilir.
  // sendClientContent erken çağrılırsa buraya buffer'lanır.
  let setupReady = false
  let setupResolve: () => void
  const setupPromise = new Promise<void>((resolve) => {
    setupResolve = resolve
  })
  const pendingClientContent: LiveSendClientContentParameters[] = []

  function flushPendingClientContent() {
    if (!activeSession || !setupReady || pendingClientContent.length === 0) return
    console.log(`[Gemini] ${pendingClientContent.length} adet buffer'lanmış sendClientContent gönderiliyor`)
    while (pendingClientContent.length > 0) {
      const params = pendingClientContent.shift()
      if (params) {
        try {
          activeSession.sendClientContent(params)
        } catch (err) {
          console.error('[Gemini] sendClientContent flush hatası:', err)
        }
      }
    }
  }

  function buildCallbacks() {
    return {
      // WebSocket açıldı ama Gemini henüz hazır değil — setupComplete bekleniyor.
      onopen: () => {},
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
        if (msg.toolCall?.functionCalls?.length) {
          for (const fc of msg.toolCall.functionCalls) {
            const fcName = fc.name ?? ''
            const start = Date.now()
            const invokeTool = () => handleTool(fcName, fc.args as Record<string, unknown>)
            const toolPromise = options.clinicId && options.hostname
              ? runWithTenantContext({ clinicId: options.clinicId, hostname: options.hostname }, invokeTool)
              : invokeTool()
            Promise.resolve(toolPromise)
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

        // setupComplete — Gemini artık içerik kabul etmeye hazır.
        // onReady'yi burada tetikle ve buffer'lanmış içerikleri flush et.
        if ((msg as any).setupComplete) {
          setupReady = true
          setupResolve?.()
          if (!readyFired) {
            readyFired = true
            console.log('[Gemini] setupComplete — session hazır, onReady tetikleniyor')
            callbacks.onReady()
          }
          flushPendingClientContent()
          return
        }

        const content = msg.serverContent
        if (!content) {
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
          console.log(`[${options.dbSessionId}] Gemini: interrupted`)
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
          const transcript = content.inputTranscription.text
          callbacks.onTranscript('user', transcript)

          let confirmationHandled = false
          if (pendingTransferConfirmation) {
            transferConfirmationTranscript = `${transferConfirmationTranscript} ${transcript}`.trim().slice(-200)
            const confirmation = classifyTransferConfirmation(transferConfirmationTranscript)

            if (confirmation === 'affirmative') {
              const pending = pendingTransferConfirmation
              pendingTransferConfirmation = null
              transferConfirmationTranscript = ''
              confirmedTransferRuleId = pending.ruleId
              confirmationHandled = true
              console.log(`[aramaAktar] Dinamik aktarım kullanıcı tarafından onaylandı -> ${pending.target}`)

              const invokeTransfer = () => handleTool('aramaAktar', {
                hedef: pending.target,
                sebep: `${pending.reason} (kullanıcı onayladı)`,
              })
              const transfer = options.clinicId && options.hostname
                ? runWithTenantContext({ clinicId: options.clinicId, hostname: options.hostname }, invokeTransfer)
                : invokeTransfer()
              void Promise.resolve(transfer).then(result => {
                if (!result.success) console.error('[aramaAktar] Onaylı aktarım başarısız:', result.message)
              }).catch(err => console.error('[aramaAktar] Onaylı aktarım hatası:', err))
            } else if (confirmation === 'negative') {
              console.log('[aramaAktar] Dinamik aktarım kullanıcı tarafından reddedildi')
              pendingTransferConfirmation = null
              transferConfirmationTranscript = ''
              confirmedTransferRuleId = null
              automaticTransferTranscript = ''
              automaticTransferStarted = false
              confirmationHandled = true
            } else {
              // Bekleyen onay varken başka bir aktarım eşleşmesi başlatma.
              confirmationHandled = true
            }
          }

          if (!confirmationHandled && !automaticTransferStarted && options.automaticTransferRules?.length) {
            automaticTransferTranscript = `${automaticTransferTranscript} ${transcript}`.trim().slice(-500)
            const exactRule = findAutomaticTransferRule(automaticTransferTranscript, options.automaticTransferRules)
            const confirmationCandidate = findTransferConfirmationCandidate(
              automaticTransferTranscript,
              options.automaticTransferRules,
            )
            const rule = exactRule ?? confirmationCandidate
            if (rule) {
              automaticTransferStarted = true
              if (rule.requiresConfirmation) {
                const question = getTransferConfirmationQuestion(rule)
                pendingTransferConfirmation = {
                  ruleId: rule.id,
                  target: rule.target,
                  reason: `Otomatik anahtar kelime: ${rule.keyword}`,
                  question,
                }
                transferConfirmationTranscript = ''
                console.log(`[aramaAktar] Dinamik anahtar kelime eşleşti: "${rule.keyword}" — kullanıcı onayı bekleniyor`)
              } else {
                console.log(`[aramaAktar] Otomatik anahtar kelime eşleşti: "${rule.keyword}" -> ${rule.target}`)
                const invokeTransfer = () => handleTool('aramaAktar', {
                  hedef: rule.target,
                  sebep: `Otomatik anahtar kelime: ${rule.keyword}`,
                })
                const transfer = options.clinicId && options.hostname
                  ? runWithTenantContext({ clinicId: options.clinicId, hostname: options.hostname }, invokeTransfer)
                  : invokeTransfer()
                void Promise.resolve(transfer).then(result => {
                  if (!result.success) console.error('[aramaAktar] Otomatik aktarım başarısız:', result.message)
                }).catch(err => console.error('[aramaAktar] Otomatik aktarım hatası:', err))
              }
            }
          }
        }
        if (content.outputTranscription?.text) {
          callbacks.onTranscript('model', content.outputTranscription.text)
        }

        if (content.turnComplete) {
          automaticTransferTranscript = ''
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
    const session = await ai.live.connect({
      model: modelName,
      config: handle ? { ...liveConfig, sessionResumption: { handle } } : liveConfig,
      callbacks: buildCallbacks(),
    })
    activeSession = session
    flushPendingClientContent()
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
  // setupComplete'in gelmesini bekle (maksimum 4s timeout)
  await Promise.race([
    setupPromise,
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ])
  flushPendingClientContent()

  return {
    sendRealtimeInput: (input: LiveSendRealtimeInputParameters) => {
      try { activeSession?.sendRealtimeInput(input) } catch {}
    },
    sendClientContent: (input: LiveSendClientContentParameters) => {
      // setupComplete henüz gelmediyse veya session henüz atanmadıysa buffer'la
      if (!setupReady || !activeSession) {
        console.log('[Gemini] setupComplete bekleniyor — sendClientContent buffer\'landı')
        pendingClientContent.push(input)
      } else {
        try {
          activeSession.sendClientContent(input)
        } catch (err) {
          console.error('[Gemini] sendClientContent hatası:', err)
        }
      }
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
