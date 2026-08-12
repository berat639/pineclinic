import { Elysia } from 'elysia'
import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../db/client'
import {
  dentalAppointments, patients, toothRecords, treatmentPlans,
  procedureTemplates, consultations, doctorNotes, patientAnamnesis,
  doctorAvailability, calendarBlocks, materialUsages, completedWorks,
  expenses, inventoryItems,
} from '../db/schema'
import { authenticateRequest } from '../middleware/auth'

function requireHekim(user: any, set: any) {
  if (!user) { set.status = 401; return false }
  if (user.role !== 'hekim' && user.role !== 'yonetici') { set.status = 403; return false }
  return true
}

export const hekimPlugin = new Elysia({ prefix: '/api/hekim' })

  // ── Dashboard ──────────────────────────────────────────────────────────────
  .get('/dashboard', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const today = new Date().toISOString().split('T')[0]!
    const todayStart = new Date(today + 'T00:00:00Z')
    const todayEnd = new Date(today + 'T23:59:59Z')

    let where = and(
      sql`start_time >= ${todayStart.toISOString()}::timestamptz`,
      sql`start_time <= ${todayEnd.toISOString()}::timestamptz`,
    )
    if (user!.id) {
      where = and(where!, eq(dentalAppointments.doctorId, user!.id))
    }

    const appointments = await db.select().from(dentalAppointments).where(where)
    return {
      total: appointments.length,
      scheduled: appointments.filter(a => a.status === 'scheduled').length,
      inProgress: appointments.filter(a => a.status === 'in_progress').length,
      completed: appointments.filter(a => a.status === 'completed').length,
    }
  })

  // ── Odontogram ─────────────────────────────────────────────────────────────
  .get('/patients/:patientId/odontogram', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }
    return db.select().from(toothRecords).where(eq(toothRecords.patientId, params.patientId)).orderBy(toothRecords.toothNumber)
  })

  .post('/patients/:patientId/odontogram', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.toothNumber || !b.condition) { set.status = 400; return { error: 'toothNumber ve condition gerekli' } }

    const [created] = await db.insert(toothRecords).values({
      patientId: params.patientId,
      toothNumber: b.toothNumber,
      surface: b.surface,
      condition: b.condition,
      notes: b.notes,
      recordedBy: user!.id,
      date: new Date().toISOString().split('T')[0]!,
    }).returning()
    return created
  })

  // ── Templates ──────────────────────────────────────────────────────────────
  .get('/templates', async ({ query, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    let condition = sql`true`
    if (user!.role === 'yonetici') {
      if (query.doctorId) {
        condition = eq(procedureTemplates.doctorId, query.doctorId as string)
      }
    } else {
      condition = eq(procedureTemplates.doctorId, user!.id)
    }

    return db.select().from(procedureTemplates)
      .where(condition)
      .orderBy(procedureTemplates.name)
  })

  .post('/templates', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.name) { set.status = 400; return { error: 'name gerekli' } }

    const [created] = await db.insert(procedureTemplates).values({
      doctorId: user!.id, name: b.name,
      defaultDurationMin: b.defaultDurationMin || 30,
      defaultCost: b.defaultCost || 0,
      toothSurfaces: b.toothSurfaces, category: b.category || 'genel',
    }).returning()
    return created
  })

  .delete('/templates/:id', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }
    await db.delete(procedureTemplates).where(eq(procedureTemplates.id, params.id))
    return { ok: true }
  })

  // ── Consultations ──────────────────────────────────────────────────────────
  .get('/consultations', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    if (!user!.id) return []
    return db.select().from(consultations)
      .where(sql`from_doctor_id = ${user!.id} OR to_doctor_id = ${user!.id}`)
      .orderBy(desc(consultations.createdAt))
  })

  .post('/consultations', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.toDoctorId || !b.patientId) { set.status = 400; return { error: 'toDoctorId ve patientId gerekli' } }

    const [created] = await db.insert(consultations).values({
      fromDoctorId: user!.id!, toDoctorId: b.toDoctorId, patientId: b.patientId, notes: b.notes,
    }).returning()

    const { notifyDoctorUser } = await import('../services/notification')
    await notifyDoctorUser(b.toDoctorId, 'konsultasyon', 'Yeni konsültasyon talebi', b.notes?.slice(0, 100))

    return created
  })

  // ── Doctor Notes ───────────────────────────────────────────────────────────
  .get('/patients/:patientId/notes', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    if (!user!.id) return []
    return db.select().from(doctorNotes)
      .where(and(eq(doctorNotes.doctorId, user!.id), eq(doctorNotes.patientId, params.patientId)))
      .orderBy(desc(doctorNotes.createdAt))
  })

  .post('/patients/:patientId/notes', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.content) { set.status = 400; return { error: 'content gerekli' } }

    const [created] = await db.insert(doctorNotes).values({
      doctorId: user!.id!, patientId: params.patientId, content: b.content,
    }).returning()
    return created
  })

  // ── Anamnesis ──────────────────────────────────────────────────────────────
  .get('/patients/:patientId/anamnesis', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const [record] = await db.select().from(patientAnamnesis)
      .where(eq(patientAnamnesis.patientId, params.patientId)).limit(1)
    return record || null
  })

  .post('/patients/:patientId/anamnesis', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    const [created] = await db.insert(patientAnamnesis).values({
      patientId: params.patientId, formData: b.formData || {}, filledBy: user!.id,
    }).onConflictDoNothing().returning()
    return created
  })

  // ── Availability ───────────────────────────────────────────────────────────
  .get('/availability', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    if (!user!.id) return []
    return db.select().from(doctorAvailability).where(eq(doctorAvailability.doctorId, user!.id))
  })

  .put('/availability', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }
    if (!user!.id) { set.status = 400; return { error: 'doctorId bağlı değil' } }

    const slots = body as { dayOfWeek: number; startTime: string; endTime: string }[]
    await db.delete(doctorAvailability).where(eq(doctorAvailability.doctorId, user!.id))
    if (slots.length > 0) {
      await db.insert(doctorAvailability).values(
        slots.map(s => ({ doctorId: user!.id!, ...s }))
      )
    }
    return { ok: true }
  })

  // ── Calendar Blocks ────────────────────────────────────────────────────────
  .get('/blocks', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    if (!user!.id) return []
    return db.select().from(calendarBlocks).where(eq(calendarBlocks.doctorId, user!.id)).orderBy(calendarBlocks.date)
  })

  .post('/blocks', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.date || !b.startTime || !b.endTime) { set.status = 400; return { error: 'date, startTime, endTime gerekli' } }

    const [created] = await db.insert(calendarBlocks).values({
      doctorId: user!.id!, date: b.date, startTime: b.startTime, endTime: b.endTime, reason: b.reason,
    }).returning()
    return created
  })

  .delete('/blocks/:id', async ({ params, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }
    await db.delete(calendarBlocks).where(eq(calendarBlocks.id, params.id))
    return { ok: true }
  })

  // ── Material Usage ─────────────────────────────────────────────────────────
  .post('/material-usage', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.inventoryItemId || !b.quantity) { set.status = 400; return { error: 'inventoryItemId ve quantity gerekli' } }

    const [created] = await db.insert(materialUsages).values({
      doctorId: user!.id!, patientId: b.patientId, appointmentId: b.appointmentId,
      inventoryItemId: b.inventoryItemId, quantity: b.quantity, date: new Date().toISOString().split('T')[0]!,
    }).returning()

    // Decrease inventory
    await db.update(inventoryItems)
      .set({ quantity: sql`quantity - ${b.quantity}` })
      .where(eq(inventoryItems.id, b.inventoryItemId))

    return created
  })

  // ── Expenses (hekim can also enter) ────────────────────────────────────────
  .post('/expenses', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.itemName || !b.date) { set.status = 400; return { error: 'itemName ve date gerekli' } }

    const totalCost = (b.quantity || 1) * (b.unitCost || 0)
    const [created] = await db.insert(expenses).values({
      itemName: b.itemName, quantity: b.quantity || 1, unitCost: b.unitCost || 0,
      totalCost, date: b.date, notes: b.notes, enteredBy: user!.id,
    }).returning()
    return created
  })

  // ── Stats ──────────────────────────────────────────────────────────────────
  .get('/stats', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!requireHekim(user, set)) return { error: 'Yetki yok' }

    if (!user!.id) return { weeklyWorks: 0, completionRate: 0 }

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]!
    const [works] = await db.select({ count: sql<number>`count(*)::int` })
      .from(completedWorks)
      .where(and(eq(completedWorks.doctorId, user!.id), sql`date >= ${weekAgo}`))

    const [totalPlans] = await db.select({ count: sql<number>`count(*)::int` }).from(treatmentPlans)
    const [completedPlans] = await db.select({ count: sql<number>`count(*)::int` })
      .from(treatmentPlans).where(eq(treatmentPlans.status, 'completed'))

    const rate = totalPlans?.count ? Math.round((completedPlans?.count ?? 0) / totalPlans.count * 100) : 0

    return { weeklyWorks: works?.count ?? 0, completionRate: rate }
  })
