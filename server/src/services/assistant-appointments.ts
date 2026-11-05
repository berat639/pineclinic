import { and, eq, gte, gt, lt, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { appointments, dentalAppointments } from '../db/schema'
import { createFlowAppointment, getAppointmentsByDateRange } from '../db/repositories/appointments'
import { ensureAiAppointmentReviewSchema, getDoctorLeaves, listDoctors } from '../db/repositories/dental'
import { getClinicWorkingHours } from '../db/repositories/settings'
import { type DbTransaction } from '../db/repositories/whatsapp'
import { normalizePhone } from '../integrations/whatsapp'
import { broadcastSSE } from '../events'
import { currentClinicId, runWithTenantContext } from '../tenancy/context'

const TR_MONTHS: Record<string, string> = {
  ocak: '01', subat: '02', şubat: '02', mart: '03', nisan: '04',
  mayis: '05', mayıs: '05', haziran: '06', temmuz: '07', agustos: '08',
  ağustos: '08', eylul: '09', eylül: '09', ekim: '10', kasim: '11',
  kasım: '11', aralik: '12', aralık: '12',
}

const TR_SPOKEN_HOURS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5,
  altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  'on bir': 11, onbir: 11, 'on iki': 12, oniki: 12,
}

const ISTANBUL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const ISTANBUL_TIME_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
})

const CLINIC_METADATA_CACHE_TTL_MS = 30_000
const workingHoursCache = new Map<string, { value: Awaited<ReturnType<typeof getClinicWorkingHours>> | null; expiresAt: number }>()
const doctorsCache = new Map<string, { value: Awaited<ReturnType<typeof listDoctors>>; expiresAt: number }>()

async function getCachedWorkingHours(clinicId: string) {
  const now = Date.now()
  const hit = workingHoursCache.get(clinicId)
  if (hit && hit.expiresAt > now) return hit.value
  const value = await getClinicWorkingHours(clinicId).catch(() => null)
  workingHoursCache.set(clinicId, { value, expiresAt: now + CLINIC_METADATA_CACHE_TTL_MS })
  return value
}

async function getCachedDoctors(clinicId: string) {
  const now = Date.now()
  const hit = doctorsCache.get(clinicId)
  if (hit && hit.expiresAt > now) return hit.value
  const fetchDocs = () => listDoctors().catch(() => [])
  const value = currentClinicId() === clinicId
    ? await fetchDocs()
    : await runWithTenantContext({ clinicId, hostname: 'internal' }, fetchDocs)
  doctorsCache.set(clinicId, { value, expiresAt: now + CLINIC_METADATA_CACHE_TTL_MS })
  return value
}

/**
 * Çağrı başladığında klinik mesai saatlerini ve hekim listesini RAM önbelleğine
 * arka planda ısıtır (pre-warm); böylece ilk müsaitlik veya randevu aracında DB beklenmez.
 */
export function warmClinicAppointmentCache(clinicId?: string): void {
  if (!clinicId) return
  void Promise.all([
    getCachedWorkingHours(clinicId),
    getCachedDoctors(clinicId),
    ensureAiAppointmentReviewSchema(),
  ]).catch(() => {})
}

function formatIstanbulYmd(date: Date): string {
  const parts = ISTANBUL_DATE_FORMATTER.formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value || String(date.getFullYear())
  const m = parts.find(p => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0')
  const d = parts.find(p => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Kullanıcının doğal Türkçe konuşmasından ("bugün", "yarın", "öbür gün", "4 Kasım", "15.11.2026")
 * YYYY-MM-DD formatında tarihi sıfır gecikmeyle (RAM'de) ayıklar.
 */
export function extractSpokenTurkishDate(rawText: string, now: Date = new Date()): string | null {
  const lower = String(rawText || '').toLocaleLowerCase('tr-TR').trim()
  if (!lower) return null

  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]

  const dmy = lower.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  if (/\b(?:öbür\s+gün|obur\s+gun|ertesi\s+gün|ertesi\s+gun)\b/u.test(lower)) {
    return formatIstanbulYmd(new Date(now.getTime() + 2 * 86_400_000))
  }
  if (/\b(?:yarın|yarin)\b/u.test(lower)) {
    return formatIstanbulYmd(new Date(now.getTime() + 86_400_000))
  }
  if (/\b(?:bugün|bugun)\b/u.test(lower)) {
    return formatIstanbulYmd(now)
  }

  const trMatch = lower.match(/\b(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?\b/u)
  if (trMatch && TR_MONTHS[trMatch[2]]) {
    const year = trMatch[3] || String(now.getFullYear())
    return `${year}-${TR_MONTHS[trMatch[2]]}-${trMatch[1].padStart(2, '0')}`
  }

  return null
}

export function normalizeAppointmentDate(raw: string, now: Date = new Date()): string {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const lower = s.toLocaleLowerCase('tr-TR')
  if (lower === 'bugün' || lower === 'bugun') {
    return formatIstanbulYmd(now)
  }
  if (lower === 'yarın' || lower === 'yarin') {
    return formatIstanbulYmd(new Date(now.getTime() + 86_400_000))
  }
  if (lower === 'öbür gün' || lower === 'obur gun' || lower === 'ertesi gün') {
    return formatIstanbulYmd(new Date(now.getTime() + 2 * 86_400_000))
  }
  const trMatch = lower.match(/(\d{1,2})\s+([a-zçğıöşü]+)(?:\s+(\d{4}))?/)
  if (trMatch && TR_MONTHS[trMatch[2]]) {
    const year = trMatch[3] || String(now.getFullYear())
    return `${year}-${TR_MONTHS[trMatch[2]]}-${trMatch[1].padStart(2, '0')}`
  }
  return extractSpokenTurkishDate(s, now) || s
}

function adjustHourByPeriod(hour: number, period: string): number {
  const p = period.toLocaleLowerCase('tr-TR').trim()
  if ((p.includes('öğleden sonra') || p.includes('akşam') || p.includes('aksam')) && hour >= 1 && hour <= 11) {
    return hour + 12
  }
  if (p.includes('gece') && hour === 12) {
    return 0
  }
  if (p.includes('gece') && hour >= 1 && hour <= 5) {
    return hour
  }
  // Klinik randevularında dönem belirtilmeden "saat 1..6" denirse öğleden sonra (13:00..18:00) kabul edilir
  if (!p.includes('sabah') && !p.includes('gece') && hour >= 1 && hour <= 6) {
    return hour + 12
  }
  return hour
}

export function normalizeAppointmentTime(raw: string): string {
  const s = String(raw || '').trim()
  const hm = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/)
  if (hm) {
    const h = Number(hm[1])
    const m = Number(hm[2])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  // Saf saat rakamı ("8", "08", "14")
  if (/^\d{1,2}$/.test(s)) {
    const h = Number(s)
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`
    }
  }

  const extracted = extractSpokenTurkishTime(s)
  if (extracted) return extracted

  return s
}

/**
 * Kullanıcının doğal Türkçe konuşmasından ("Dedim ya sabah 8 diye", "öğleden sonra 3 buçuk", "saat 14:30")
 * HH:MM formatında saat bilgisini ayıklar. Tarih ("4 Kasım") ve telefon numaralarını saat sanmaz.
 */
export function extractSpokenTurkishTime(rawText: string): string | null {
  const cleaned = String(rawText || '')
    .toLocaleLowerCase('tr-TR')
    // Telefon numaralarını temizle
    .replace(/\b\d[\d\s()-]{8,}\d\b/g, ' ')
    // YYYY-MM-DD veya DD.MM.YYYY tarihlerini temizle
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, ' ')
    // "4 kasım", "15 ocak 2026" gibi tarih ifadelerini temizle
    .replace(/\b\d{1,2}\s+(?:ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+\d{4})?\b/gu, ' ')

  // 1. Açık HH:MM veya HH.MM (ör. "08:00", "14.30")
  const explicitHm = cleaned.match(/(?:saat\s*)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)
  if (explicitHm) {
    const h = Number(explicitHm[1])
    const m = Number(explicitHm[2])
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // 2. Dönem veya "saat" kelimesiyle başlayan saat ifadeleri:
  // ör. "sabah 8", "sabah 8'de", "öğleden sonra 2 buçuk", "akşam 5", "saat 9 buçuk", "sabah sekiz"
  const periodRegex = /\b(sabah|öğleden\s+sonra|öğle|öğlen|akşam|aksam|gece|saat)\s+(?:saat\s+)?(on\s+bir|on\s+iki|onbir|oniki|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on|\d{1,2})(?:\s*(buçuk|bucuk|çeyrek|ceyrek))?(?:['’]?(?:de|da|te|ta|e|a|ye|ya))?\b/u
  const periodMatch = cleaned.match(periodRegex)
  if (periodMatch) {
    const period = periodMatch[1]
    const hourToken = periodMatch[2].replace(/\s+/g, ' ').trim()
    const halfOrQuarter = periodMatch[3] || ''
    const rawHour = /^\d+$/.test(hourToken) ? Number(hourToken) : TR_SPOKEN_HOURS[hourToken]
    if (rawHour !== undefined && rawHour >= 0 && rawHour <= 23) {
      const hour = adjustHourByPeriod(rawHour, period)
      const minute = /buçuk|bucuk/.test(halfOrQuarter) ? '30' : /çeyrek|ceyrek/.test(halfOrQuarter) ? '15' : '00'
      return `${String(hour).padStart(2, '0')}:${minute}`
    }
  }

  // 3. "<saat> buçuk" (ör. "8 buçuk", "sekiz buçukta")
  const halfRegex = /\b(on\s+bir|on\s+iki|onbir|oniki|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on|\d{1,2})\s*(?:buçuk|bucuk)(?:ta|te)?\b/u
  const halfMatch = cleaned.match(halfRegex)
  if (halfMatch) {
    const hourToken = halfMatch[1].replace(/\s+/g, ' ').trim()
    const rawHour = /^\d+$/.test(hourToken) ? Number(hourToken) : TR_SPOKEN_HOURS[hourToken]
    if (rawHour !== undefined && rawHour >= 1 && rawHour <= 23) {
      const hour = adjustHourByPeriod(rawHour, '')
      return `${String(hour).padStart(2, '0')}:30`
    }
  }

  // 4. "<saat>'de / <saat>'da / <saat> gibi" (ör. "8'de", "9'da", "14'te")
  const suffixRegex = /\b([01]?\d|2[0-3])\s*(?:['’](?:de|da|te|ta)|gibi)\b/u
  const suffixMatch = cleaned.match(suffixRegex)
  if (suffixMatch) {
    const rawHour = Number(suffixMatch[1])
    if (rawHour >= 7 && rawHour <= 22) {
      return `${String(rawHour).padStart(2, '0')}:00`
    }
  }

  return null
}

export function appointmentTime(rawDate: string, rawTime: string): Date {
  const date = normalizeAppointmentDate(rawDate)
  const time = normalizeAppointmentTime(rawTime)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Geçerli tarih ve saat gerekli.')
  const calendarDate = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) throw new Error('Geçersiz tarih.')
  return new Date(`${date}T${time}:00+03:00`)
}

function timeToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const DAY_NAMES_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export async function validateAppointmentWorkingHoursAndLeave(params: {
  clinicId?: string
  date: string
  time: string
  doctorId?: string | null
}): Promise<void> {
  const { clinicId, date, time, doctorId } = params
  if (!clinicId) return

  const hasValidDoctorId = Boolean(doctorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doctorId))
  const fetchLeaves = async () => {
    if (!hasValidDoctorId || !doctorId) return []
    const checkLeaves = () => getDoctorLeaves({ doctorId, date })
    return currentClinicId() === clinicId
      ? await checkLeaves().catch(() => [])
      : await runWithTenantContext({ clinicId, hostname: 'internal' }, checkLeaves).catch(() => [])
  }

  const [workingHours, leaves] = await Promise.all([
    getCachedWorkingHours(clinicId),
    fetchLeaves(),
  ])

  if (workingHours) {
    const calendarDate = new Date(`${date}T12:00:00+03:00`)
    if (Number.isFinite(calendarDate.getTime())) {
      // JS getUTCDay(): 0=Pazar, 1=Pazartesi..6=Cumartesi -> 0=Pzt..6=Paz
      const clinicDayIndex = (calendarDate.getUTCDay() + 6) % 7
      if (Array.isArray(workingHours.workingDays) && workingHours.workingDays.length > 0 && !workingHours.workingDays.includes(clinicDayIndex)) {
        const openDaysLabel = workingHours.workingDays.map(d => DAY_NAMES_TR[d] || '').filter(Boolean).join(', ')
        throw new Error(`Kliniğimiz ${DAY_NAMES_TR[clinicDayIndex]} günleri kapalıdır (Açık günler: ${openDaysLabel}). Lütfen başka bir gün seçin.`)
      }
    }

    const reqMin = timeToMinutes(time)
    const startMin = timeToMinutes(workingHours.startTime)
    const endMin = workingHours.endTime === '24:00' || workingHours.endTime === '00:00'
      ? 24 * 60
      : timeToMinutes(workingHours.endTime)

    const withinHours = workingHours.isOvernight
      ? (reqMin >= startMin || reqMin < endMin)
      : (reqMin >= startMin && reqMin < endMin)

    if (!withinHours) {
      throw new Error(`Seçilen saat (${time}) kliniğimizin çalışma saatleri (${workingHours.startTime} - ${workingHours.endTime}) dışındadır. Lütfen mesai saatleri içinde bir saat seçin.`)
    }
  }

  if (leaves.length > 0) {
    const reqMin = timeToMinutes(time)
    for (const leave of leaves) {
      if (leave.isFullDay) {
        const subNote = leave.substituteDoctorName ? ` Yerine ${leave.substituteDoctorName} hizmet vermektedir.` : ''
        throw new Error(`${leave.doctorName || 'Seçilen hekim'} ${date} tarihinde tam gün izinlidir.${subNote}`)
      }
      const lStart = timeToMinutes(leave.startTime)
      const lEnd = timeToMinutes(leave.endTime)
      if (reqMin >= lStart && reqMin < lEnd) {
        const subNote = leave.substituteDoctorName ? ` Yerine ${leave.substituteDoctorName} hizmet vermektedir.` : ''
        throw new Error(`${leave.doctorName || 'Seçilen hekim'} ${date} tarihinde ${leave.startTime}-${leave.endTime} saatleri arasında izinlidir.${subNote}`)
      }
    }
  }
}

export async function getClinicAvailabilityReport(params: {
  clinicId?: string
  date?: string
  from?: string
  to?: string
}): Promise<{ sonuc: string; count: number }> {
  const clinicId = params.clinicId ?? currentClinicId() ?? undefined
  const targetDate = params.date ? normalizeAppointmentDate(params.date) : undefined
  const fromDate = params.from ? normalizeAppointmentDate(params.from) : targetDate
  const toDate = params.to ? normalizeAppointmentDate(params.to) : fromDate

  const fetchLeavesForTarget = async () => {
    if (!clinicId || !targetDate) return []
    const getLeaves = () => getDoctorLeaves({ date: targetDate }).catch(() => [])
    return currentClinicId() === clinicId
      ? await getLeaves()
      : await runWithTenantContext({ clinicId, hostname: 'internal' }, getLeaves)
  }

  const fetchDentalRows = async () => {
    if (!clinicId || !fromDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return []
    const rangeStart = new Date(`${fromDate}T00:00:00+03:00`)
    const rangeEnd = new Date(`${toDate || fromDate}T23:59:59+03:00`)
    return db
      .select({
        startTime: dentalAppointments.startTime,
        endTime: dentalAppointments.endTime,
        title: dentalAppointments.title,
        type: dentalAppointments.type,
      })
      .from(dentalAppointments)
      .where(and(
        eq(dentalAppointments.clinicId, clinicId),
        sql`${dentalAppointments.status} <> 'cancelled'`,
        gte(dentalAppointments.startTime, rangeStart),
        lt(dentalAppointments.startTime, rangeEnd),
      ))
      .orderBy(dentalAppointments.startTime)
      .limit(50)
      .catch(() => [])
  }

  const [workingHours, docs, leaves, legacyResult, rows] = await Promise.all([
    clinicId ? getCachedWorkingHours(clinicId) : Promise.resolve(null),
    clinicId ? getCachedDoctors(clinicId) : Promise.resolve([]),
    fetchLeavesForTarget(),
    getAppointmentsByDateRange({
      date: targetDate,
      from: fromDate,
      to: toDate,
    }).catch(() => []),
    fetchDentalRows(),
  ])

  const hoursLine = workingHours
    ? `Klinik Çalışma Saatleri: ${workingHours.startTime} - ${workingHours.endTime}`
    : 'Klinik Çalışma Saatleri: 08:00 - 20:00'

  let closedDayWarning = ''
  if (workingHours && targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    const dt = new Date(`${targetDate}T12:00:00+03:00`)
    if (Number.isFinite(dt.getTime())) {
      const dayIdx = (dt.getUTCDay() + 6) % 7
      if (workingHours.workingDays.length > 0 && !workingHours.workingDays.includes(dayIdx)) {
        closedDayWarning = `⚠️ UYARI: Kliniğimiz ${targetDate} (${DAY_NAMES_TR[dayIdx]}) günü kapalıdır.`
      }
    }
  }

  let doctorsLine = ''
  if (docs.length > 0) {
    const docSummaries = docs.map(d => {
      const docLeave = leaves.find(l => l.doctorId === d.id)
      const leaveTag = docLeave
        ? (docLeave.isFullDay ? ' [Tam Gün İzinli]' : ` [${docLeave.startTime}-${docLeave.endTime} İzinli]`)
        : ''
      return `${d.name}${d.specialty ? ` (${d.specialty})` : ''}${leaveTag}`
    })
    doctorsLine = `Aktif Hekimler: ${docSummaries.join(', ')}`
  }

  const dentalSlots = rows.map(r => ({
    time: ISTANBUL_TIME_FORMATTER.format(new Date(r.startTime)),
    title: r.title || r.type || 'Randevu',
  }))

  const headerParts = [hoursLine, doctorsLine, closedDayWarning].filter(Boolean)
  const totalCount = Math.max(legacyResult.length, dentalSlots.length)

  if (closedDayWarning) {
    return {
      count: totalCount,
      sonuc: `${headerParts.join('\n')}\nBu tarihte klinik kapalı olduğu için randevu verilemez.`,
    }
  }

  if (totalCount === 0) {
    return {
      count: 0,
      sonuc: `${headerParts.join('\n')}\n${targetDate || `${fromDate} - ${toDate}`} tarihinde henüz dolu randevu yok — çalışma saatleri içinde müsait.`,
    }
  }

  const slotLines = dentalSlots.length > 0
    ? dentalSlots.map((s, i) => `[${i + 1}] ${targetDate || fromDate} ${s.time} — Dolu`)
    : legacyResult.map((a, i) => `[${i + 1}] ${a.date} ${a.time || '?'} — Dolu`)

  return {
    count: totalCount,
    sonuc: `${headerParts.join('\n')}\n${targetDate || `${fromDate} - ${toDate}`} tarihinde ${totalCount} dolu randevu kaydı var:\n${slotLines.join('\n')}\n\nNot: Dolu olmayan mesai saatleri randevu için uygundur.`,
  }
}

/** Shared booking operation for voice and WhatsApp; both calendar records commit together. */
export type AiAppointmentSource = 'web_ai' | 'phone_ai' | 'whatsapp_ai'

/**
 * Stores an AI booking as a tentative calendar reservation.  It intentionally
 * does not create a patient: the desk must match or create the real record.
 */
export async function createAssistantAppointment(fields: Record<string, unknown>, context: { sessionId: string; clinicId?: string; source: AiAppointmentSource }, transaction?: DbTransaction) {
  await ensureAiAppointmentReviewSchema()
  const date = normalizeAppointmentDate(String(fields.tarih || ''))
  const time = normalizeAppointmentTime(String(fields.saat || ''))
  const doctorId = typeof fields.doktor_id === 'string' && fields.doktor_id.trim() ? fields.doktor_id.trim() : null

  await validateAppointmentWorkingHoursAndLeave({
    clinicId: context.clinicId,
    date,
    time,
    doctorId,
  })

  const run = async (tx: DbTransaction) => {
    const name = String(fields.musteri_adi || fields.ad_soyad || fields.hasta_adi || '').trim()
    const phone = normalizePhone(String(fields.telefon || ''))
    const start = appointmentTime(date, time)
    if (name.length < 3 || /\[|\]|placeholder|örnek isim/i.test(name)) throw new Error('Gerçek hasta adı ve soyadı gerekli.')
    if (start.getTime() < Date.now() - 60_000) throw new Error('Geçmiş bir tarih için randevu oluşturulamaz.')
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.clinicId || 'voice'}:${phone}`}, 0))`)
    const end = new Date(start.getTime() + 15 * 60_000)
    const conflicts = await tx.select({ id: dentalAppointments.id }).from(dentalAppointments).where(and(
      context.clinicId ? eq(dentalAppointments.clinicId, context.clinicId) : sql`${dentalAppointments.clinicId} IS NULL`,
      sql`${dentalAppointments.status} <> 'cancelled'`,
      lt(dentalAppointments.startTime, end),
      gt(dentalAppointments.endTime, start),
    )).limit(1)
    if (conflicts.length) throw new Error('Seçilen saat geçici veya planlanmış başka bir randevu ile dolu.')
    const rawRandevuTuru = String(fields.randevu_turu || '').trim()
    const complaint = String(
      fields.sikayet ||
      fields.hasta_sikayeti ||
      fields.talep ||
      fields.sorun_veya_talep ||
      fields.islem_turu ||
      fields.complaint ||
      fields.notlar ||
      fields.hastaNotu ||
      fields.not ||
      (rawRandevuTuru && rawRandevuTuru.toLowerCase() !== 'kontrol' ? rawRandevuTuru : '') ||
      ''
    ).trim()
    const validDoctorUuid = doctorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(doctorId) ? doctorId : null
    const [dental] = await tx.insert(dentalAppointments).values({
      clinicId: context.clinicId, patientId: null, doctorId: validDoctorUuid,
      title: `${name} - kontrol`, startTime: start, endTime: end,
      status: 'pending_review', type: 'kontrol', complaint: complaint || null, notes: complaint || null,
      timeConfirmed: false, intakeSource: context.source, intakePatientName: name, intakePatientPhone: phone,
      reviewStatus: 'pending',
    }).returning()
    const cleanFields = { ...Object.fromEntries(Object.entries(fields).filter(([key]) => !key.startsWith('_'))), randevu_turu: 'kontrol', ai_kaynak: context.source }
    return createFlowAppointment({ ...cleanFields, musteri_adi: name, telefon: phone, tarih: date, saat: time,
      _clinicId: context.clinicId, _dentalAppointmentId: dental.id }, context.sessionId, undefined, tx)
  }
  const result = transaction ? await run(transaction) : await db.transaction(run)
  if (!transaction) broadcastSSE('new_appointment', result)
  return result
}

export async function updateWhatsAppAppointment(tx: DbTransaction, args: Record<string, unknown>, clinicId: string, phone: string) {
  const id = String(args.randevu_id || '')
  if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error('Geçerli randevu kimliği gerekli.')
  const [row] = await tx.select().from(appointments).where(and(eq(appointments.id, id),
    sql`${appointments.data}->>'_clinicId' = ${clinicId}`, eq(appointments.phone, phone))).for('update')
  if (!row) throw new Error('Bu sohbet sahibine ait randevu bulunamadı. Personelden destek isteyin.')
  const date = normalizeAppointmentDate(String(args.tarih || row.date))
  const time = normalizeAppointmentTime(String(args.saat || row.time))
  const start = appointmentTime(date, time)
  if (start.getTime() < Date.now() - 60_000) throw new Error('Geçmiş bir tarih seçilemez.')
  await validateAppointmentWorkingHoursAndLeave({ clinicId, date, time })
  const data = { ...row.data as Record<string, unknown>, tarih: date, saat: time }
  await tx.update(appointments).set({ date, time, data }).where(eq(appointments.id, id))
  const dentalId = (row.data as Record<string, unknown>)._dentalAppointmentId
  if (typeof dentalId === 'string') await tx.update(dentalAppointments).set({ startTime: start, endTime: new Date(start.getTime() + 15 * 60_000), timeConfirmed: false }).where(eq(dentalAppointments.id, dentalId))
  return { success: true, id, message: `Randevu talebiniz ${date} ${time} olarak güncellendi; klinik onayı bekleniyor.` }
}
