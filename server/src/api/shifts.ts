import { Elysia } from 'elysia'
import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { shifts, shiftSwapRequests, users } from '../db/schema'
import { authenticateRequest } from '../middleware/auth'

export const shiftsPlugin = new Elysia({ prefix: '/api/shifts' })

  .get('/', async ({ query, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const week = query.week as string | undefined
    let dateFilter: string | undefined
    if (week) {
      // week format: "2026-W32" or just filter by date prefix
      dateFilter = week
    }

    const rows = await db.select({
      id: shifts.id,
      userId: shifts.userId,
      userName: users.name,
      userRole: users.role,
      date: shifts.date,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      shiftType: shifts.shiftType,
      notes: shifts.notes,
      createdAt: shifts.createdAt,
    })
      .from(shifts)
      .leftJoin(users, eq(shifts.userId, users.id))
      .orderBy(shifts.date, shifts.startTime)

    return rows
  })

  .post('/', async ({ body, cookie, set }) => {
    const isAdmin = cookie.admin_auth?.value === 'true'
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as any
    if (!b.userId || !b.date || !b.startTime || !b.endTime) {
      set.status = 400; return { error: 'userId, date, startTime, endTime gerekli' }
    }

    // Conflict check
    const existing = await db.select().from(shifts)
      .where(and(eq(shifts.userId, b.userId), eq(shifts.date, b.date)))
    if (existing.length > 0) {
      set.status = 409; return { error: 'Bu kullanıcının aynı güne zaten vardiyası var' }
    }

    const [created] = await db.insert(shifts).values({
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
    const user = isAdmin ? { id: null, role: 'yonetici' } : await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    await db.delete(shifts).where(eq(shifts.id, params.id))
    return { ok: true }
  })

  // Swap requests
  .get('/swap-requests', async ({ cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const rows = await db.select().from(shiftSwapRequests).orderBy(shiftSwapRequests.createdAt)
    return rows
  })

  .post('/swap-request', async ({ body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const b = body as any
    if (!b.targetId || !b.shiftId) {
      set.status = 400; return { error: 'targetId ve shiftId gerekli' }
    }

    const [created] = await db.insert(shiftSwapRequests).values({
      requesterId: user.id,
      targetId: b.targetId,
      shiftId: b.shiftId,
      targetShiftId: b.targetShiftId || null,
      reason: b.reason || null,
    }).returning()

    return created
  })

  .put('/swap-requests/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest((cookie.token?.value as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    if (user.role !== 'yonetici') { set.status = 403; return { error: 'Yetki yok' } }

    const b = body as { status: 'approved' | 'rejected' }
    if (!b.status || !['approved', 'rejected'].includes(b.status)) {
      set.status = 400; return { error: 'status: approved veya rejected' }
    }

    const [request] = await db.select().from(shiftSwapRequests).where(eq(shiftSwapRequests.id, params.id))
    if (!request) { set.status = 404; return { error: 'Talep bulunamadı' } }

    if (b.status === 'approved' && request.targetShiftId) {
      // Swap the shifts: update userId on each
      const [shift1] = await db.select().from(shifts).where(eq(shifts.id, request.shiftId))
      const [shift2] = await db.select().from(shifts).where(eq(shifts.id, request.targetShiftId))
      if (shift1 && shift2) {
        await db.update(shifts).set({ userId: shift2.userId }).where(eq(shifts.id, shift1.id))
        await db.update(shifts).set({ userId: shift1.userId }).where(eq(shifts.id, shift2.id))
      }
    }

    const [updated] = await db.update(shiftSwapRequests).set({
      status: b.status,
      reviewedBy: user.id,
      reviewedAt: new Date(),
    }).where(eq(shiftSwapRequests.id, params.id)).returning()

    return updated
  })
