import { Elysia } from 'elysia'
import { eq, desc, and, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { notifications } from '../db/schema'
import { authenticateRequest } from '../middleware/auth'
import { requireClinicId } from '../tenancy/context'

export const notificationsPlugin = new Elysia({ prefix: '/api/notifications' })

  .get('/', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const limit = Math.min(parseInt(query.limit as string) || 50, 100)
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.clinicId, requireClinicId()), eq(notifications.userId, user.id)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)

    return rows
  })

  .get('/unread-count', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.clinicId, requireClinicId()), eq(notifications.userId, user.id), eq(notifications.read, false)))

    return { count: result?.count ?? 0 }
  })

  .put('/:id/read', async ({ params, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.clinicId, requireClinicId()), eq(notifications.id, params.id), eq(notifications.userId, user.id)))

    return { ok: true }
  })

  .put('/read-all', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.clinicId, requireClinicId()), eq(notifications.userId, user.id), eq(notifications.read, false)))

    return { ok: true }
  })
