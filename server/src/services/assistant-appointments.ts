import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { appointments, dentalAppointments } from '../db/schema'
import { createFlowAppointment } from '../db/repositories/appointments'
import { ensureAiAppointmentReviewSchema } from '../db/repositories/dental'
import { type DbTransaction } from '../db/repositories/whatsapp'
import { normalizePhone } from '../integrations/whatsapp'
import { broadcastSSE } from '../events'

export function appointmentTime(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Geçerli tarih ve saat gerekli.')
  const calendarDate = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) throw new Error('Geçersiz tarih.')
  return new Date(`${date}T${time}:00+03:00`)
}

/** Shared booking operation for voice and WhatsApp; both calendar records commit together. */
export type AiAppointmentSource = 'web_ai' | 'phone_ai' | 'whatsapp_ai'

/**
 * Stores an AI booking as a tentative calendar reservation.  It intentionally
 * does not create a patient: the desk must match or create the real record.
 */
export async function createAssistantAppointment(fields: Record<string, unknown>, context: { sessionId: string; clinicId?: string; source: AiAppointmentSource }, transaction?: DbTransaction) {
  await ensureAiAppointmentReviewSchema()
  const run = async (tx: DbTransaction) => {
    const name = String(fields.musteri_adi || '').trim()
    const phone = normalizePhone(String(fields.telefon || ''))
    const date = String(fields.tarih || '')
    const time = String(fields.saat || '')
    const start = appointmentTime(date, time)
    if (name.length < 3 || /\[|\]|placeholder|örnek isim/i.test(name)) throw new Error('Gerçek hasta adı ve soyadı gerekli.')
    if (start.getTime() < Date.now() - 60_000) throw new Error('Geçmiş bir tarih için randevu oluşturulamaz.')
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.clinicId || 'voice'}:${phone}`}, 0))`)
    const end = new Date(start.getTime() + 15 * 60_000)
    const conflicts = await tx.select({ id: dentalAppointments.id }).from(dentalAppointments).where(and(
      context.clinicId ? eq(dentalAppointments.clinicId, context.clinicId) : sql`${dentalAppointments.clinicId} IS NULL`,
      sql`${dentalAppointments.status} <> 'cancelled'`,
      sql`${dentalAppointments.startTime} < ${end}`,
      sql`${dentalAppointments.endTime} > ${start}`,
    )).limit(1)
    if (conflicts.length) throw new Error('Seçilen saat geçici veya planlanmış başka bir randevu ile dolu.')
    const complaint = String(fields.sikayet || fields.sorun_veya_talep || '')
    const [dental] = await tx.insert(dentalAppointments).values({
      clinicId: context.clinicId, patientId: null, doctorId: null,
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
  const date = String(args.tarih || row.date)
  const time = String(args.saat || row.time)
  const start = appointmentTime(date, time)
  if (start.getTime() < Date.now() - 60_000) throw new Error('Geçmiş bir tarih seçilemez.')
  const data = { ...row.data as Record<string, unknown>, tarih: date, saat: time }
  await tx.update(appointments).set({ date, time, data }).where(eq(appointments.id, id))
  const dentalId = (row.data as Record<string, unknown>)._dentalAppointmentId
  if (typeof dentalId === 'string') await tx.update(dentalAppointments).set({ startTime: start, endTime: new Date(start.getTime() + 15 * 60_000), timeConfirmed: false }).where(eq(dentalAppointments.id, dentalId))
  return { success: true, id, message: `Randevu talebiniz ${date} ${time} olarak güncellendi; klinik onayı bekleniyor.` }
}
