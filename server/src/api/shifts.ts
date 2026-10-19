import { Elysia } from 'elysia'
import { eq, and, sql, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { shifts, shiftSwapRequests, users } from '../db/schema'
import { authenticateRequest } from '../middleware/auth'
import { requireClinicId } from '../tenancy/context'
import { applyShiftPlan, latestShiftPlanOperation, previewShiftPlan, undoShiftPlan } from '../db/repositories/shift-planning'

export const shiftsPlugin = new Elysia({ prefix: '/api/shifts' })

  .post('/plan/preview', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(cookie.token?.value as string | undefined)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }
    try { return await previewShiftPlan(requireClinicId(), body as any) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'Mesai önizlemesi oluşturulamadı.' } }
  })

  .post('/plan/apply', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(cookie.token?.value as string | undefined)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }
    const payload = body as any
    try { return await applyShiftPlan(requireClinicId(), user.id, String(payload.requestId || ''), payload.plan) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'Mesai planı kaydedilemedi.' } }
  })

  .get('/plan/latest', async ({ cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(cookie.token?.value as string | undefined)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }
    return latestShiftPlanOperation(requireClinicId())
  })

  .post('/plan/:operationId/undo', async ({ params, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(cookie.token?.value as string | undefined)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }
    try { return await undoShiftPlan(requireClinicId(), params.operationId) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'Mesai işlemi geri alınamadı.' } }
  })

  .get('/', async ({ query, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const week = query.week as string | undefined
    const startDate = query.startDate as string | undefined
    const endDate = query.endDate as string | undefined
    const month = query.month as string | undefined // e.g. "2026-08"

    const conditions = [eq(shifts.clinicId, requireClinicId())]
    if (startDate && endDate) {
      conditions.push(gte(shifts.date, startDate), lte(shifts.date, endDate))
    } else if (month) {
      conditions.push(gte(shifts.date, `${month}-01`), lte(shifts.date, `${month}-31`))
    }

    let q = db.select({
      id: shifts.id,
      userId: shifts.userId,
      userName: users.name,
      userRole: users.role,
      userColor: users.color,
      date: shifts.date,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      shiftType: shifts.shiftType,
      notes: shifts.notes,
      createdAt: shifts.createdAt,
    })
      .from(shifts)
      .leftJoin(users, eq(shifts.userId, users.id))

    if (conditions.length > 0) {
      return await q.where(and(...conditions)).orderBy(shifts.date, shifts.startTime)
    }

    const rows = await q.orderBy(shifts.date, shifts.startTime)
    return rows
  })

  .post('/batch', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as {
      shifts: Array<{
        userId: string
        date: string
        startTime: string
        endTime: string
        shiftType?: string
        notes?: string
      }>
      overwrite?: boolean
    }

    if (!b || !Array.isArray(b.shifts) || b.shifts.length === 0) {
      set.status = 400; return { error: 'Vardiya listesi boş' }
    }

    const insertedOrUpdated = []
    for (const s of b.shifts) {
      if (!s.userId || !s.date || !s.startTime || !s.endTime) continue

      const existing = await db.select().from(shifts)
        .where(and(eq(shifts.clinicId, requireClinicId()), eq(shifts.userId, s.userId), eq(shifts.date, s.date)))

      if (existing.length > 0) {
        if (b.overwrite) {
          const [updated] = await db.update(shifts).set({
            startTime: s.startTime,
            endTime: s.endTime,
            shiftType: s.shiftType || 'tam',
            notes: s.notes || null,
          }).where(and(eq(shifts.id, existing[0].id), eq(shifts.clinicId, requireClinicId()))).returning()
          if (updated) insertedOrUpdated.push(updated)
        }
      } else {
        const [created] = await db.insert(shifts).values({
          clinicId: requireClinicId(),
          userId: s.userId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          shiftType: s.shiftType || 'tam',
          notes: s.notes || null,
          createdBy: user.id,
        }).returning()
        if (created) insertedOrUpdated.push(created)
      }
    }

    return { ok: true, count: insertedOrUpdated.length, data: insertedOrUpdated }
  })

  .post('/clear', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as {
      userId?: string
      userIds?: string[]
      startDate: string
      endDate: string
    }

    if (!b || !b.startDate || !b.endDate) {
      set.status = 400; return { error: 'startDate ve endDate gerekli' }
    }

    const conditions = [
      eq(shifts.clinicId, requireClinicId()),
      gte(shifts.date, b.startDate),
      lte(shifts.date, b.endDate),
    ]

    if (b.userId) {
      conditions.push(eq(shifts.userId, b.userId))
    } else if (b.userIds && b.userIds.length > 0) {
      conditions.push(inArray(shifts.userId, b.userIds))
    }

    await db.delete(shifts).where(and(...conditions))
    return { ok: true }
  })

  .post('/', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as any
    if (!b.userId || !b.date || !b.startTime || !b.endTime) {
      set.status = 400; return { error: 'userId, date, startTime, endTime gerekli' }
    }

    // Conflict check
    const existing = await db.select().from(shifts)
      .where(and(eq(shifts.clinicId, requireClinicId()), eq(shifts.userId, b.userId), eq(shifts.date, b.date)))
    if (existing.length > 0) {
      set.status = 409; return { error: 'Bu kullanıcının aynı güne zaten vardiyası var' }
    }

    const [created] = await db.insert(shifts).values({
      clinicId: requireClinicId(),
      userId: b.userId,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      shiftType: b.shiftType || 'tam',
      notes: b.notes,
      createdBy: user.id,
    }).returning()

    return created
  })

  .delete('/:id', async ({ params, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    await db.delete(shifts).where(and(eq(shifts.id, params.id), eq(shifts.clinicId, requireClinicId())))
    return { ok: true }
  })

  // Swap requests
  .get('/swap-requests', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const rows = await db.select().from(shiftSwapRequests)
      .where(eq(shiftSwapRequests.clinicId, requireClinicId()))
      .orderBy(shiftSwapRequests.createdAt)
    return rows
  })

  .post('/swap-request', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const b = body as any
    if (!b.targetId || !b.shiftId) {
      set.status = 400; return { error: 'targetId ve shiftId gerekli' }
    }

    const [created] = await db.insert(shiftSwapRequests).values({
      clinicId: requireClinicId(),
      requesterId: user.id,
      targetId: b.targetId,
      shiftId: b.shiftId,
      targetShiftId: b.targetShiftId || null,
      reason: b.reason || null,
    }).returning()

    return created
  })

  .put('/swap-requests/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as { status: 'approved' | 'rejected' }
    if (!b.status || !['approved', 'rejected'].includes(b.status)) {
      set.status = 400; return { error: 'status: approved veya rejected' }
    }

    const clinicId = requireClinicId()
    const [request] = await db.select().from(shiftSwapRequests).where(and(eq(shiftSwapRequests.id, params.id), eq(shiftSwapRequests.clinicId, clinicId)))
    if (!request) { set.status = 404; return { error: 'Talep bulunamadı' } }

    if (b.status === 'approved' && request.targetShiftId) {
      // Swap the shifts: update userId on each
      const [shift1] = await db.select().from(shifts).where(and(eq(shifts.id, request.shiftId), eq(shifts.clinicId, clinicId)))
      const [shift2] = await db.select().from(shifts).where(and(eq(shifts.id, request.targetShiftId), eq(shifts.clinicId, clinicId)))
      if (shift1 && shift2) {
        await db.update(shifts).set({ userId: shift2.userId }).where(and(eq(shifts.id, shift1.id), eq(shifts.clinicId, clinicId)))
        await db.update(shifts).set({ userId: shift1.userId }).where(and(eq(shifts.id, shift2.id), eq(shifts.clinicId, clinicId)))
      }
    }

    const [updated] = await db.update(shiftSwapRequests).set({
      status: b.status,
      reviewedBy: user.id,
      reviewedAt: new Date(),
    }).where(and(eq(shiftSwapRequests.id, params.id), eq(shiftSwapRequests.clinicId, clinicId))).returning()

    return updated
  })
