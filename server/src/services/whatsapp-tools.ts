import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { appointments, dentalAppointments, patients, patientNotes, whatsappConversations, whatsappToolExecutions } from '../db/schema'
import { patientPhoneMatches } from '../db/repositories/whatsapp'
import { normalizePhone } from '../integrations/whatsapp'
import { searchKnowledge } from './knowledge'
import { appointmentTime, createAssistantAppointment, updateWhatsAppAppointment } from './assistant-appointments'

export interface WhatsAppToolContext { clinicId: string; conversationId: string; messageId: string; phone: string | null }
export const WHATSAPP_TOOL_NAMES = new Set(['searchKnowledgeBase', 'musteriSorgula', 'gecmisRandevular', 'randevuMusaitlikKontrol', 'randevuOlustur', 'randevuGuncelle', 'hastaNotKaydet', 'insanaAktar'])

export async function executeWhatsAppTool(name: string, args: Record<string, unknown>, context: WhatsAppToolContext): Promise<Record<string, unknown>> {
  if (!WHATSAPP_TOOL_NAMES.has(name)) return { success: false, message: 'Bu araç WhatsApp kanalında kullanılamaz.' }
  try {
    if (name === 'searchKnowledgeBase') {
      const results = await searchKnowledge(String(args.sorgu || '').slice(0, 1000), 5)
      return { sonuc: results.map(r => `${r.documentName}: ${r.chunkText}`).join('\n\n') || 'İlgili bilgi bulunamadı.' }
    }
    if (name === 'randevuMusaitlikKontrol') {
      const from = String(args.tarih || args.baslangic_tarih || '')
      const to = String(args.tarih || args.bitis_tarih || from)
      const start = appointmentTime(from, '00:00')
      const end = new Date(appointmentTime(to, '00:00').getTime() + 86400_000)
      if (end <= start || end.getTime() - start.getTime() > 31 * 86400_000) throw new Error('En fazla 31 günlük bir tarih aralığı belirtin.')
      const slots = await db.select({ start: dentalAppointments.startTime, end: dentalAppointments.endTime }).from(dentalAppointments)
        .where(and(eq(dentalAppointments.clinicId, context.clinicId), gte(dentalAppointments.startTime, start), lt(dentalAppointments.startTime, end), sql`${dentalAppointments.status} <> 'cancelled'`)).limit(300)
      return { dolu_araliklar: slots, message: 'Yalnızca kayıtlı dolu aralıklar gösterilir; kesin saat için klinik onayı gerekir.' }
    }
    if (name !== 'insanaAktar') {
      if (!context.phone) throw new Error('Gönderici numarası doğrulanamadı. Kişisel işlemler için insanaAktar aracını kullanın.')
      if (args.telefon && normalizePhone(String(args.telefon)) !== context.phone) throw new Error('Yalnızca bu WhatsApp numarasına ait hasta işlemlerini yapabilirsiniz.')
    }
    if (name === 'musteriSorgula' || name === 'gecmisRandevular') {
      const [patient] = await db.select({ id: patients.id, name: patients.name }).from(patients)
        .where(and(eq(patients.clinicId, context.clinicId), patientPhoneMatches(context.phone!))).limit(1)
      if (!patient) return { kayitli: false, sonuc: 'Bu klinikte kayıtlı hasta bulunamadı.' }
      const history = await db.select({ id: appointments.id, tarih: appointments.date, saat: appointments.time }).from(appointments)
        .where(and(eq(appointments.clinicId, context.clinicId), eq(appointments.phone, context.phone!))).orderBy(desc(appointments.date)).limit(10)
      const calendar = await db.select({ tarih: dentalAppointments.startTime, durum: dentalAppointments.status }).from(dentalAppointments)
        .where(and(eq(dentalAppointments.clinicId, context.clinicId), eq(dentalAppointments.patientId, patient.id))).orderBy(desc(dentalAppointments.startTime)).limit(10)
      return { kayitli: true, musteri_adi: patient.name, randevular: history, takvim: calendar }
    }
    // Mutation + result commit in one transaction. A restarted AI turn reuses the recorded result.
    return await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.messageId}:${name}`}, 0))`)
      const [done] = await tx.select().from(whatsappToolExecutions).where(and(eq(whatsappToolExecutions.messageId, context.messageId), eq(whatsappToolExecutions.name, name)))
      if (done) return { ...done.result as Record<string, unknown>, tekrar: true, bilgi: 'Bu mesaj için işlem zaten yapıldı; kaydedilen sonuç döndürüldü.' }
      let result: Record<string, unknown>
      if (name === 'randevuOlustur') {
        const created = await createAssistantAppointment({ ...args, telefon: context.phone }, { sessionId: `wa_${context.messageId}`, clinicId: context.clinicId, source: 'whatsapp_ai' }, tx)
        result = { success: true, id: created.id, message: `${created.date} ${created.time} için randevu talebi alındı; klinik onayı bekleniyor.` }
      } else if (name === 'randevuGuncelle') {
        result = await updateWhatsAppAppointment(tx, args, context.clinicId, context.phone!)
      } else if (name === 'hastaNotKaydet') {
        const note = String(args.not || '').trim()
        if (!note || note.length > 4000) throw new Error('1–4000 karakterlik bir not gerekli.')
        const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.clinicId, context.clinicId), patientPhoneMatches(context.phone!))).limit(1)
        if (!patient) throw new Error('Hasta kaydı bulunamadı; personele aktarın.')
        await tx.insert(patientNotes).values({ clinicId: context.clinicId, patientId: patient.id, phone: context.phone, content: note, source: 'whatsapp' })
        result = { success: true, message: 'Not kliniğe iletildi.' }
      } else {
        await tx.update(whatsappConversations).set({ aiPaused: true }).where(and(eq(whatsappConversations.id, context.conversationId), eq(whatsappConversations.clinicId, context.clinicId)))
        result = { success: true, message: 'Sohbet personel desteğine alındı. Kullanıcıya ekibin buradan devam edeceğini söyle.' }
      }
      await tx.insert(whatsappToolExecutions).values({ messageId: context.messageId, name, arguments: args, result })
      return result
    })
  } catch (error) {
    // Database errors can contain query arguments; return only intentional validation messages.
    return { success: false, message: error instanceof Error && !('query' in error) && !('code' in error) ? error.message : 'İşlem tamamlanamadı. Klinik personelinden destek isteyin.' }
  }
}
