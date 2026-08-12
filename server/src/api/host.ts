import { Elysia } from 'elysia'
import { eq, and, sql, desc, lt } from 'drizzle-orm'
import { db } from '../db/client'
import {
  dentalAppointments, patients, waitingList, installmentPlans,
  patientPayments,  doctorAvailability, calendarBlocks,
} from '../db/schema'
import { authenticateRequest } from '../middleware/auth'

function requireHost(user: any, set: any) {
  if (!user) { set.status = 401; return false }
  if (user.role !== 'host' && user.role !== 'yonetici') { set.status = 403; return false }
  return true
}

export const hostPlugin = new Elysia({ prefix: '/api/host' })

  // ── Dashboard ──────────────────────────────────────────────────────────────
  .get('/dashboard', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const today = new Date().toISOString().split('T')[0]!
    const todayStart = new Date(today + 'T00:00:00Z')
    const todayEnd = new Date(today + 'T23:59:59Z')
    const now = new Date()

    const appointments = await db.select().from(dentalAppointments)
      .where(and(
        sql`start_time >= ${todayStart.toISOString()}::timestamptz`,
        sql`start_time <= ${todayEnd.toISOString()}::timestamptz`,
      ))

    const pending = appointments.filter(a => a.status === 'pending_assignment')
    const overdue = appointments.filter(a => new Date(a.startTime) < now && a.status === 'scheduled')

    return {
      totalToday: appointments.length,
      pendingApprovals: pending.length,
      overduePatients: overdue.length,
      completed: appointments.filter(a => a.status === 'completed').length,
    }
  })

  // ── Available Slots ────────────────────────────────────────────────────────
  .get('/available-slots', async ({ query, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const doctorId = query.doctorId as string
    const date = query.date as string
    const duration = parseInt(query.duration as string) || 30

    if (!doctorId || !date) { set.status = 400; return { error: 'doctorId ve date gerekli' } }

    const dayOfWeek = new Date(date + 'T00:00').getDay()

    // Get availability for this day
    const [avail] = await db.select().from(doctorAvailability)
      .where(and(eq(doctorAvailability.doctorId, doctorId), eq(doctorAvailability.dayOfWeek, dayOfWeek), eq(doctorAvailability.isActive, true)))

    if (!avail) return [] // No availability defined

    // Get blocks for this date
    const blocks = await db.select().from(calendarBlocks)
      .where(and(eq(calendarBlocks.doctorId, doctorId), eq(calendarBlocks.date, date)))

    // Get existing appointments
    const dateStart = new Date(date + 'T00:00:00Z')
    const dateEnd = new Date(date + 'T23:59:59Z')
    const existing = await db.select({ startTime: dentalAppointments.startTime, endTime: dentalAppointments.endTime })
      .from(dentalAppointments)
      .where(and(
        eq(dentalAppointments.doctorId, doctorId),
        sql`start_time >= ${dateStart.toISOString()}::timestamptz`,
        sql`start_time <= ${dateEnd.toISOString()}::timestamptz`,
        sql`status != 'cancelled'`,
      ))

    // Generate slots
    const slots: { start: string; end: string }[] = []
    const [startH, startM] = avail.startTime.split(':').map(Number)
    const [endH, endM] = avail.endTime.split(':').map(Number)
    const slotStart = startH! * 60 + startM!
    const slotEnd = endH! * 60 + endM!

    for (let t = slotStart; t + duration <= slotEnd; t += duration) {
      const h = Math.floor(t / 60).toString().padStart(2, '0')
      const m = (t % 60).toString().padStart(2, '0')
      const eH = Math.floor((t + duration) / 60).toString().padStart(2, '0')
      const eM = ((t + duration) % 60).toString().padStart(2, '0')
      const start = `${h}:${m}`
      const end = `${eH}:${eM}`

      // Check blocks
      const blocked = blocks.some(b => start < b.endTime && end > b.startTime)
      if (blocked) continue

      // Check existing appointments
      const slotStartISO = new Date(`${date}T${start}:00Z`)
      const slotEndISO = new Date(`${date}T${end}:00Z`)
      const occupied = existing.some(e =>
        new Date(e.startTime) < slotEndISO && new Date(e.endTime) > slotStartISO
      )
      if (occupied) continue

      slots.push({ start, end })
    }

    return slots
  })

  // ── Check-in / Check-out ───────────────────────────────────────────────────
  .post('/check-in/:appointmentId', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const [updated] = await db.update(dentalAppointments)
      .set({ status: 'in_progress' })
      .where(eq(dentalAppointments.id, params.appointmentId))
      .returning()

    if (updated?.doctorId) {
      const { notifyDoctorUser } = await import('../services/notification')
      await notifyDoctorUser(updated.doctorId, 'check_in', 'Hasta hazır', `${updated.title} - check-in yapıldı`)
    }

    return updated
  })

  .post('/check-out/:appointmentId', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const [updated] = await db.update(dentalAppointments)
      .set({ status: 'completed' })
      .where(eq(dentalAppointments.id, params.appointmentId))
      .returning()

    return updated
  })

  // ── Waiting List ───────────────────────────────────────────────────────────
  .get('/waiting-list', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    return db.select({
      id: waitingList.id,
      patientId: waitingList.patientId,
      patientName: patients.name,
      preferredDoctorId: waitingList.preferredDoctorId,
      preferredDate: waitingList.preferredDate,
      preferredTimeRange: waitingList.preferredTimeRange,
      notes: waitingList.notes,
      status: waitingList.status,
      createdAt: waitingList.createdAt,
    })
      .from(waitingList)
      .leftJoin(patients, eq(waitingList.patientId, patients.id))
      .where(eq(waitingList.status, 'waiting'))
      .orderBy(waitingList.createdAt)
  })

  .post('/waiting-list', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.patientId) { set.status = 400; return { error: 'patientId gerekli' } }

    const [created] = await db.insert(waitingList).values({
      patientId: b.patientId,
      preferredDoctorId: b.preferredDoctorId,
      preferredDate: b.preferredDate,
      preferredTimeRange: b.preferredTimeRange,
      notes: b.notes,
    }).returning()
    return created
  })

  // ── Pending Approvals (AI appointments) ────────────────────────────────────
  .get('/pending-approvals', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    return db.select().from(dentalAppointments)
      .where(eq(dentalAppointments.status, 'pending_assignment'))
      .orderBy(dentalAppointments.startTime)
  })

  .put('/approve/:id', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const [updated] = await db.update(dentalAppointments)
      .set({ status: 'scheduled' })
      .where(eq(dentalAppointments.id, params.id))
      .returning()
    return updated
  })

  .put('/reject/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const [updated] = await db.update(dentalAppointments)
      .set({ status: 'cancelled', notes: (body as any)?.reason || 'Reddedildi' })
      .where(eq(dentalAppointments.id, params.id))
      .returning()
    return updated
  })

  // ── Overdue patients ───────────────────────────────────────────────────────
  .get('/overdue', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const now = new Date()
    return db.select().from(dentalAppointments)
      .where(and(
        eq(dentalAppointments.status, 'scheduled'),
        lt(dentalAppointments.startTime, now),
      ))
      .orderBy(dentalAppointments.startTime)
  })

  // ── Installment Plans ──────────────────────────────────────────────────────
  .get('/installments', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    return db.select({
      id: installmentPlans.id,
      patientId: installmentPlans.patientId,
      patientName: patients.name,
      totalAmount: installmentPlans.totalAmount,
      installmentCount: installmentPlans.installmentCount,
      paidCount: installmentPlans.paidCount,
      status: installmentPlans.status,
      createdAt: installmentPlans.createdAt,
    })
      .from(installmentPlans)
      .leftJoin(patients, eq(installmentPlans.patientId, patients.id))
      .orderBy(desc(installmentPlans.createdAt))
  })

  .post('/installments', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHost(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.patientId || !b.totalAmount || !b.installmentCount) {
      set.status = 400; return { error: 'patientId, totalAmount, installmentCount gerekli' }
    }

    const perInstallment = Math.ceil(b.totalAmount / b.installmentCount)
    const installments = Array.from({ length: b.installmentCount }, (_, i) => ({
      number: i + 1,
      amount: i === b.installmentCount - 1 ? b.totalAmount - perInstallment * (b.installmentCount - 1) : perInstallment,
      paid: false,
      dueDate: null,
    }))

    const [created] = await db.insert(installmentPlans).values({
      patientId: b.patientId,
      totalAmount: b.totalAmount,
      installmentCount: b.installmentCount,
      installments,
    }).returning()
    return created
  })
