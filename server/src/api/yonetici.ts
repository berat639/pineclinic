import { Elysia } from 'elysia'
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm'
import { db } from '../db/client'
import {
  patientPayments, expenses, patients, dentalAppointments,
  completedWorks, inventoryItems, deviceMaintenances, attendance,
  auditLog, users, sessions, revenueTargets, treatmentPlans, inventoryMovements,
} from '../db/schema'
import { authenticateRequest } from '../middleware/auth'

function requireYonetici(user: any, set: any) {
  if (!user) { set.status = 401; return false }
  if (user.role !== 'yonetici') { set.status = 403; return false }
  return true
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const yoneticiPlugin = new Elysia({ prefix: '/api/yonetici' })

  // ── Finance ────────────────────────────────────────────────────────────────
  .get('/finance/revenue', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const period = (query.period as string) || 'daily'
    const now = new Date()
    let startDate: string

    if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]!
    } else if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 7 * 86400000).toISOString().split('T')[0]!
    } else {
      startDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]!
    }

    const payments = await db.select({
      date: patientPayments.date,
      total: sql<number>`sum(amount)::int`,
    })
      .from(patientPayments)
      .where(gte(patientPayments.date, startDate))
      .groupBy(patientPayments.date)
      .orderBy(patientPayments.date)

    return payments
  })

  .get('/finance/income-expense-chart', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const period = (query.period as string) || 'daily'
    const now = new Date()
    let startDate: string

    if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]!
    } else if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 7 * 86400000).toISOString().split('T')[0]!
    } else {
      startDate = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]!
    }

    const revenueRows = await db.select({
      date: patientPayments.date,
      total: sql<number>`coalesce(sum(amount), 0)::int`,
    })
      .from(patientPayments)
      .where(gte(patientPayments.date, startDate))
      .groupBy(patientPayments.date)
      .orderBy(patientPayments.date)

    const expenseRows = await db.select({
      date: expenses.date,
      total: sql<number>`coalesce(sum(total_cost), 0)::int`,
    })
      .from(expenses)
      .where(gte(expenses.date, startDate))
      .groupBy(expenses.date)
      .orderBy(expenses.date)

    const merged = new Map<string, { date: string; gelir: number; gider: number }>()

    for (const row of revenueRows) {
      merged.set(row.date, { date: row.date, gelir: Number(row.total || 0), gider: 0 })
    }

    for (const row of expenseRows) {
      const existing = merged.get(row.date)
      if (existing) {
        existing.gider = Number(row.total || 0)
      } else {
        merged.set(row.date, { date: row.date, gelir: 0, gider: Number(row.total || 0) })
      }
    }

    return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
  })

  .get('/finance/expenses', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    return db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(100)
  })

  .post('/finance/expenses', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.itemName || !b.date) { set.status = 400; return { error: 'itemName ve date gerekli' } }

    const totalCost = (b.quantity || 1) * (b.unitCost || 0)
    const [created] = await db.insert(expenses).values({
      itemName: b.itemName,
      quantity: b.quantity || 1,
      unitCost: b.unitCost || 0,
      totalCost,
      date: b.date,
      notes: b.notes,
      enteredBy: user!.id,
    }).returning()

    return created
  })

  .get('/finance/profit-loss', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const month = (query.month as string) || new Date().toISOString().slice(0, 7)
    const startDate = `${month}-01`
    const endDate = `${month}-31`

    const [revenue] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)::int` })
      .from(patientPayments)
      .where(and(gte(patientPayments.date, startDate), lte(patientPayments.date, endDate)))

    const [expense] = await db.select({ total: sql<number>`coalesce(sum(total_cost), 0)::int` })
      .from(expenses)
      .where(and(gte(expenses.date, startDate), lte(expenses.date, endDate)))

    return { revenue: revenue?.total ?? 0, expenses: expense?.total ?? 0, net: (revenue?.total ?? 0) - (expense?.total ?? 0) }
  })

  .get('/finance/targets', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }
    return db.select().from(revenueTargets).orderBy(desc(revenueTargets.year), desc(revenueTargets.month))
  })

  .post('/finance/targets', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    const [created] = await db.insert(revenueTargets).values({
      month: b.month, year: b.year, targetAmount: b.targetAmount,
    }).returning()
    return created
  })

  .get('/finance/debtors', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    return db.select().from(patients).where(sql`balance < 0`).orderBy(patients.balance)
  })

  // ── Attendance ─────────────────────────────────────────────────────────────
  .get('/attendance', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const rows = await db.select({
      id: attendance.id,
      userId: attendance.userId,
      userName: users.name,
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      totalHours: attendance.totalHours,
    })
      .from(attendance)
      .leftJoin(users, eq(attendance.userId, users.id))
      .orderBy(desc(attendance.date))
      .limit(100)

    return rows
  })

  .post('/attendance/clock-in', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const today = new Date().toISOString().split('T')[0]!
    const [created] = await db.insert(attendance).values({
      userId: user.id, date: today, clockIn: new Date(),
    }).returning()
    return created
  })

  .post('/attendance/clock-out', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const today = new Date().toISOString().split('T')[0]!
    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.userId, user.id), eq(attendance.date, today)))
      .limit(1)

    if (!existing) { set.status = 404; return { error: 'Bugün giriş kaydı yok' } }

    const clockOut = new Date()
    const hours = existing.clockIn ? Math.round((clockOut.getTime() - new Date(existing.clockIn).getTime()) / 3600000) : 0

    const [updated] = await db.update(attendance)
      .set({ clockOut, totalHours: hours })
      .where(eq(attendance.id, existing.id))
      .returning()

    return updated
  })

  // ── Analytics ──────────────────────────────────────────────────────────────
  .get('/analytics/ai-calls', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const rows = await db.select({
      hour: sql<number>`extract(hour from started_at)::int`,
      count: sql<number>`count(*)::int`,
    }).from(sessions).groupBy(sql`extract(hour from started_at)`).orderBy(sql`extract(hour from started_at)`)

    return rows
  })

  .get('/analytics/treatments', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    return db.select({
      procedureName: treatmentPlans.procedureName,
      count: sql<number>`count(*)::int`,
    }).from(treatmentPlans).groupBy(treatmentPlans.procedureName).orderBy(sql`count(*) desc`).limit(20)
  })

  .get('/analytics/no-shows', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(dentalAppointments)
    const [noShows] = await db.select({ count: sql<number>`count(*)::int` }).from(dentalAppointments).where(eq(dentalAppointments.status, 'no_show'))

    const rate = total?.count ? Math.round((noShows?.count ?? 0) / total.count * 100) : 0
    return { total: total?.count ?? 0, noShows: noShows?.count ?? 0, rate }
  })

  .get('/analytics/occupancy', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const rows = await db.select({
      doctorId: dentalAppointments.doctorId,
      count: sql<number>`count(*)::int`,
    }).from(dentalAppointments).groupBy(dentalAppointments.doctorId)

    return rows
  })

  // ── Inventory ──────────────────────────────────────────────────────────────
  .get('/inventory', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }
    return db.select().from(inventoryItems).orderBy(inventoryItems.name)
  })

  .post('/inventory', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.name) { set.status = 400; return { error: 'name gerekli' } }

    const quantity = Number(b.quantity || 0)
    const unitCost = Number(b.costPerUnit || 0)
    const totalCost = Number(b.totalCost || (quantity * unitCost) || 0)
    const isRefund = Boolean(b.isRefund)

    const [created] = await db.insert(inventoryItems).values({
      name: b.name, category: b.category || 'genel', quantity: b.quantity || 0,
      minThreshold: b.minThreshold || 5, unit: b.unit || 'adet', costPerUnit: unitCost,
      brand: b.brand || null, expiryDate: b.expiryDate || null, supplierName: b.supplierName || null,
    }).returning()

    if (totalCost > 0) {
      await db.insert(expenses).values({
        category: b.category === 'cihaz' ? 'cihaz_alim' : 'malzeme_alim',
        itemName: created.name,
        quantity: Math.max(1, quantity || 1),
        unitCost,
        totalCost: isRefund ? -Math.abs(totalCost) : Math.abs(totalCost),
        enteredBy: user!.id,
        notes: b.notes || (isRefund ? 'Alım iadesi' : 'Stok alımı'),
        date: new Date().toISOString().slice(0, 10),
      })
    }

    return created
  })

  .get('/inventory/movements', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }
    const { inventoryMovements, users: u } = await import('../db/schema')
    return db.select({
      id: inventoryMovements.id, itemId: inventoryMovements.itemId,
      type: inventoryMovements.type, quantity: inventoryMovements.quantity,
      notes: inventoryMovements.notes, userName: u.name, createdAt: inventoryMovements.createdAt,
    }).from(inventoryMovements).leftJoin(u, eq(inventoryMovements.userId, u.id))
      .orderBy(desc(inventoryMovements.createdAt)).limit(50)
  })

  .post('/inventory/movement', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.itemId || !b.type || !b.quantity) { set.status = 400; return { error: 'itemId, type, quantity gerekli' } }
    if (!['giris', 'cikis', 'fire', 'imha', 'iade', 'duzeltme_arti'].includes(b.type)) {
      set.status = 400
      return { error: 'Geçersiz hareket tipi' }
    }

    const quantity = Number(b.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      set.status = 400
      return { error: 'quantity pozitif sayı olmalı' }
    }

    const { inventoryMovements } = await import('../db/schema')
    const [mov] = await db.insert(inventoryMovements).values({
      itemId: b.itemId, type: b.type, quantity, notes: b.notes || null, userId: user!.id,
    }).returning()

    const deltaByType: Record<string, number> = {
      giris: quantity,
      duzeltme_arti: quantity,
      cikis: -quantity,
      fire: -quantity,
      imha: -quantity,
      iade: -quantity,
    }
    const delta = deltaByType[b.type] ?? 0

    if (delta < 0) {
      const [currentItem] = await db.select({
        quantity: inventoryItems.quantity,
      }).from(inventoryItems).where(eq(inventoryItems.id, b.itemId)).limit(1)

      if (!currentItem) {
        set.status = 404
        return { error: 'Stok kaydı bulunamadı' }
      }

      if ((currentItem.quantity + delta) < 0) {
        set.status = 400
        return { error: 'Stok 0 altına düşemez' }
      }
    }

    await db.update(inventoryItems).set({ quantity: sql`quantity + ${delta}` }).where(eq(inventoryItems.id, b.itemId))
    if (b.type === 'giris') await db.update(inventoryItems).set({ lastRestockedAt: new Date() }).where(eq(inventoryItems.id, b.itemId))

    const unitCost = Number(b.unitCost || 0)
    const totalCost = Number(b.totalCost || (unitCost * Number(b.quantity || 0)))

    if (totalCost > 0 && b.type === 'iade') {
      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, b.itemId)).limit(1)
      await db.insert(expenses).values({
        category: 'stok_iade',
        itemName: item?.name || 'Stok iadesi',
        quantity: Number(b.quantity || 1),
        unitCost,
        totalCost: -Math.abs(totalCost),
        enteredBy: user!.id,
        notes: b.notes || 'Tedarikçi iadesi',
        date: new Date().toISOString().slice(0, 10),
      })
    }

    return mov
  })

  .put('/inventory/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    const [updated] = await db.update(inventoryItems).set({
      ...(b.name && { name: b.name }),
      ...(b.quantity !== undefined && { quantity: b.quantity }),
      ...(b.minThreshold !== undefined && { minThreshold: b.minThreshold }),
      ...(b.costPerUnit !== undefined && { costPerUnit: b.costPerUnit }),
      ...(b.quantity !== undefined && { lastRestockedAt: new Date() }),
    }).where(eq(inventoryItems.id, params.id)).returning()
    return updated
  })

  // ── Device Maintenance ─────────────────────────────────────────────────────
  .get('/device-maintenance', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }
    return db.select().from(deviceMaintenances).orderBy(deviceMaintenances.scheduledDate)
  })

  .post('/device-maintenance', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.deviceName || !b.maintenanceType || !b.scheduledDate) {
      set.status = 400; return { error: 'deviceName, maintenanceType, scheduledDate gerekli' }
    }

    const isPeriodic = Boolean(b.isPeriodic)
    const periodicDays = Number(b.periodicDays || 0)
    const nextMaintenanceDate = isPeriodic && periodicDays > 0
      ? (b.nextMaintenanceDate || addDays(String(b.scheduledDate), periodicDays))
      : null

    const [created] = await db.insert(deviceMaintenances).values({
      deviceName: b.deviceName,
      maintenanceType: b.maintenanceType,
      isPeriodic,
      periodicDays: isPeriodic && periodicDays > 0 ? periodicDays : null,
      scheduledDate: b.scheduledDate,
      nextMaintenanceDate,
      serialNumber: b.serialNumber || null,
      maintenanceFirm: b.maintenanceFirm || null,
      warrantyEnd: b.warrantyEnd || null,
      notes: b.notes || null,
    }).returning()

    // Bakım işlemi stok üzerinden takip edilsin: cihaz stokta yoksa oluştur, sonra hareket yaz.
    let [deviceItem] = await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.name, b.deviceName), eq(inventoryItems.category, 'cihaz')))
      .limit(1)

    if (!deviceItem) {
      const [createdItem] = await db.insert(inventoryItems).values({
        name: b.deviceName,
        category: 'cihaz',
        quantity: 1,
        minThreshold: 1,
        unit: 'adet',
        costPerUnit: 0,
        brand: b.serialNumber || null,
        supplierName: b.maintenanceFirm || null,
      }).returning()
      deviceItem = createdItem
    }

    await db.insert(inventoryMovements).values({
      itemId: deviceItem.id,
      type: 'bakim',
      quantity: 1,
      notes: b.notes || null,
      userId: user!.id,
    })

    const amount = Number(b.amount || 0)
    const isRefund = Boolean(b.isRefund)
    if (amount > 0) {
      await db.insert(expenses).values({
        category: 'bakim',
        itemName: `${b.deviceName} bakımı`,
        quantity: 1,
        unitCost: amount,
        totalCost: isRefund ? -Math.abs(amount) : Math.abs(amount),
        enteredBy: user!.id,
        notes: isRefund ? 'Bakım iadesi' : (b.notes || 'Bakım gideri'),
        date: b.scheduledDate || new Date().toISOString().slice(0, 10),
      })
    }

    return created
  })

  .put('/device-maintenance/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    const [updated] = await db.update(deviceMaintenances).set({
      ...(b.status && { status: b.status }),
      ...(b.completedDate && { completedDate: b.completedDate }),
      ...(b.notes !== undefined && { notes: b.notes }),
    }).where(eq(deviceMaintenances.id, params.id)).returning()
    return updated
  })

  // ── KVKK / GDPR ───────────────────────────────────────────────────────────
  .post('/gdpr/anonymize/:patientId', async ({ params, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    await db.update(patients).set({
      name: 'Anonim Hasta',
      phone: null,
    }).where(eq(patients.id, params.patientId))

    await db.insert(auditLog).values({
      userId: user!.id, action: 'gdpr.anonymize', targetType: 'patient', targetId: params.patientId,
    })

    return { ok: true }
  })

  .get('/audit-log', async ({ query, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const limit = Math.min(parseInt(query.limit as string) || 50, 200)
    return db.select({
      id: auditLog.id,
      userId: auditLog.userId,
      userName: users.name,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      createdAt: auditLog.createdAt,
    })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
  })

  // ── Automation Settings ────────────────────────────────────────────────────
  .get('/automation/settings', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { db: dbClient } = await import('../db/client')
    const { businessSettings } = await import('../db/schema')
    const rows = await dbClient.select().from(businessSettings)
      .where(sql`key LIKE 'automation.%'`)

    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return result
  })

  .put('/automation/settings', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { db: dbClient } = await import('../db/client')
    const { businessSettings } = await import('../db/schema')
    const entries = Object.entries(body as Record<string, string>)

    for (const [key, value] of entries) {
      if (!key.startsWith('automation.')) continue
      await dbClient.insert(businessSettings).values({ key, value }).onConflictDoUpdate({
        target: businessSettings.key, set: { value, updatedAt: new Date() },
      })
    }
    return { ok: true }
  })

  // ── User Management (CRUD) ────────────────────────────────────────────────
  .post('/users', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const b = body as any
    if (!b.email || !b.name || !b.password || !b.role) {
      set.status = 400; return { error: 'email, name, password, role gerekli' }
    }
    if (!['yonetici', 'hekim', 'host'].includes(b.role)) {
      set.status = 400; return { error: 'role: yonetici, hekim veya host' }
    }

    const { getUserByEmail, createUser } = await import('../db/repositories/users')
    const existing = await getUserByEmail(b.email.toLowerCase().trim())
    if (existing) { set.status = 409; return { error: 'Bu e-posta zaten kayıtlı' } }

    const hash = await Bun.password.hash(b.password)
    const created = await createUser({
      email: b.email.toLowerCase().trim(),
      passwordHash: hash,
      name: b.name,
      role: b.role,
      phone: b.phone,
      specialty: b.specialty,
      color: b.color,
    })

    return { id: created.id, email: created.email, name: created.name, role: created.role }
  })

  .put('/users/:id', async ({ params, body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { updateUser } = await import('../db/repositories/users')
    const b = body as any
    const data: any = {}
    if (b.name) data.name = b.name
    if (b.email) data.email = b.email.toLowerCase().trim()
    if (b.phone !== undefined) data.phone = b.phone
    if (b.role && ['yonetici', 'hekim', 'host'].includes(b.role)) data.role = b.role
    if (b.specialty !== undefined) data.specialty = b.specialty || null
    if (b.color !== undefined) data.color = b.color || null
    if (b.active !== undefined) data.active = b.active
    if (b.password) data.passwordHash = await Bun.password.hash(b.password)

    const updated = await updateUser(params.id, data)
    if (!updated) { set.status = 404; return { error: 'Kullanıcı bulunamadı' } }
    return { id: updated.id, email: updated.email, name: updated.name, role: updated.role, active: updated.active }
  })

  // ── Integrations ───────────────────────────────────────────────────────────
  .get('/integrations', async ({ cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { getIntegrations } = await import('../db/repositories/integrations')
    return await getIntegrations()
  })

  .put('/integrations', async ({ body, cookie, set }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined))
    if (!requireYonetici(user, set)) return { error: 'Yetki yok' }

    const { updateIntegrations } = await import('../db/repositories/integrations')
    await updateIntegrations(body as any)
    return { success: true }
  })
