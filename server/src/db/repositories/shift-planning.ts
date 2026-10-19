import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { clinicMemberships, doctorLeaves, shiftPlanOperationItems, shiftPlanOperations, shifts, shiftSwapRequests, users } from '../schema'

export type ShiftPlanInput = {
  userIds: string[]
  startDate: string
  endDate: string
  weekdays: number[] // Monday = 0
  startTime: string
  endTime: string
  shiftType: string
  overwriteShiftIds?: string[]
}

type ShiftSnapshot = { userId: string; date: string; startTime: string; endTime: string; shiftType: string; notes: string | null }
type PlanCandidate = ShiftSnapshot & { existingId?: string; state: 'create' | 'same' | 'existing' | 'leave'; leaveReason?: string | null }

export async function ensureShiftPlanningTables() {
  await db.execute(sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id)`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shift_plan_operations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      request_id text NOT NULL, created_by uuid REFERENCES users(id), status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (clinic_id, request_id)
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shift_plan_operation_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES shift_plan_operations(id) ON DELETE CASCADE,
      shift_id uuid REFERENCES shifts(id), action text NOT NULL, before_state jsonb, after_state jsonb NOT NULL
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS shift_plan_operations_clinic_created_idx ON shift_plan_operations(clinic_id, created_at DESC)`)
}

function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) }
function assertInput(input: ShiftPlanInput) {
  if (!Array.isArray(input.userIds) || !input.userIds.length || input.userIds.length > 100) throw new Error('En az bir, en fazla 100 personel seçin.')
  if (!isDate(input.startDate) || !isDate(input.endDate) || input.startDate > input.endDate) throw new Error('Geçerli bir tarih aralığı seçin.')
  if (!Array.isArray(input.weekdays) || !input.weekdays.length || input.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('En az bir gün seçin.')
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.startTime >= input.endTime) throw new Error('Başlangıç saati bitiş saatinden önce olmalıdır.')
}
function dates(input: ShiftPlanInput) {
  const selected = new Set(input.weekdays)
  const result: string[] = []
  const cursor = new Date(`${input.startDate}T12:00:00`)
  const end = new Date(`${input.endDate}T12:00:00`)
  while (cursor <= end) {
    const mondayIndex = (cursor.getDay() + 6) % 7
    if (selected.has(mondayIndex)) result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

async function candidates(clinicId: string, input: ShiftPlanInput): Promise<PlanCandidate[]> {
  assertInput(input)
  const selectedDates = dates(input)
  const [allowedUsers, existing, leaves] = await Promise.all([
    db.select({ id: users.id }).from(users).innerJoin(clinicMemberships, eq(clinicMemberships.userId, users.id)).where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.active, true), inArray(users.id, [...new Set(input.userIds)]))),
    db.select().from(shifts).where(and(eq(shifts.clinicId, clinicId), inArray(shifts.userId, input.userIds), gte(shifts.date, input.startDate), lte(shifts.date, input.endDate))),
    db.select().from(doctorLeaves).where(and(eq(doctorLeaves.clinicId, clinicId), inArray(doctorLeaves.doctorId, input.userIds), gte(doctorLeaves.date, input.startDate), lte(doctorLeaves.date, input.endDate))),
  ])
  if (allowedUsers.length !== new Set(input.userIds).size) throw new Error('Seçilen personellerden biri bu kliniğe ait değil.')
  const existingByKey = new Map(existing.map(item => [`${item.userId}:${item.date}`, item]))
  return input.userIds.flatMap(userId => selectedDates.map(date => {
    const base: ShiftSnapshot = { userId, date, startTime: input.startTime, endTime: input.endTime, shiftType: input.shiftType.trim() || 'Mesai', notes: null }
    const leave = leaves.find(item => item.doctorId === userId && item.date === date && (item.isFullDay || (item.startTime < base.endTime && item.endTime > base.startTime)))
    if (leave) return { ...base, state: 'leave' as const, leaveReason: leave.reason }
    const current = existingByKey.get(`${userId}:${date}`)
    if (!current) return { ...base, state: 'create' as const }
    if (current.startTime === base.startTime && current.endTime === base.endTime && current.shiftType === base.shiftType) return { ...base, existingId: current.id, state: 'same' as const }
    return { ...base, existingId: current.id, state: 'existing' as const }
  }))
}

export async function previewShiftPlan(clinicId: string, input: ShiftPlanInput) {
  await ensureShiftPlanningTables()
  const rows = await candidates(clinicId, input)
  return { rows, summary: rows.reduce((all, item) => ({ ...all, [item.state]: all[item.state] + 1 }), { create: 0, same: 0, existing: 0, leave: 0 } as Record<PlanCandidate['state'], number>) }
}

export async function applyShiftPlan(clinicId: string, actorId: string | null, requestId: string, input: ShiftPlanInput) {
  await ensureShiftPlanningTables()
  if (!requestId || requestId.length > 120) throw new Error('Geçerli işlem anahtarı gerekli.')
  const rows = await candidates(clinicId, input)
  const overwriteIds = new Set(input.overwriteShiftIds || [])
  const changes = rows.filter(row => row.state === 'create' || (row.state === 'existing' && overwriteIds.has(row.existingId!)))
  if (!changes.length) throw new Error('Kaydedilecek yeni veya değiştirilecek mesai yok.')
  return db.transaction(async tx => {
    const [operation] = await tx.insert(shiftPlanOperations).values({ clinicId, requestId, createdBy: actorId }).onConflictDoNothing().returning()
    if (!operation) {
      const [previous] = await tx.select().from(shiftPlanOperations).where(and(eq(shiftPlanOperations.clinicId, clinicId), eq(shiftPlanOperations.requestId, requestId))).limit(1)
      if (!previous) throw new Error('Mesai işlemi yeniden denenemedi.')
      const items = await tx.select({ id: shiftPlanOperationItems.id }).from(shiftPlanOperationItems).where(eq(shiftPlanOperationItems.operationId, previous.id))
      return { operationId: previous.id, repeated: true, created: 0, updated: 0, count: items.length }
    }
    let created = 0; let updated = 0
    for (const row of changes) {
      const snapshot: ShiftSnapshot = { userId: row.userId, date: row.date, startTime: row.startTime, endTime: row.endTime, shiftType: row.shiftType, notes: row.notes }
      // One person can only receive one concrete mesai for a day. The lock also
      // makes two independently submitted planning panels re-evaluate the slot
      // serially instead of creating duplicate rows.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${clinicId}:${row.userId}:${row.date}`}))`)
      const [currentForSlot] = await tx.select().from(shifts).where(and(eq(shifts.clinicId, clinicId), eq(shifts.userId, row.userId), eq(shifts.date, row.date))).limit(1)
      if (row.state === 'same' || row.state === 'leave' || (row.state === 'existing' && !overwriteIds.has(row.existingId!))) continue
      if (row.state === 'create') {
        if (currentForSlot) continue
        const [saved] = await tx.insert(shifts).values({ clinicId, ...snapshot, createdBy: actorId }).returning()
        await tx.insert(shiftPlanOperationItems).values({ operationId: operation.id, shiftId: saved.id, action: 'created', afterState: snapshot })
        created++
      } else {
        const current = currentForSlot
        if (!current || current.id !== row.existingId) throw new Error('Mesai kaydı değişti; önizlemeyi yenileyin.')
        const before: ShiftSnapshot = { userId: current.userId, date: current.date, startTime: current.startTime, endTime: current.endTime, shiftType: current.shiftType, notes: current.notes }
        const [saved] = await tx.update(shifts).set({ startTime: row.startTime, endTime: row.endTime, shiftType: row.shiftType }).where(and(eq(shifts.id, row.existingId!), eq(shifts.clinicId, clinicId))).returning()
        await tx.insert(shiftPlanOperationItems).values({ operationId: operation.id, shiftId: saved.id, action: 'updated', beforeState: before, afterState: snapshot })
        updated++
      }
    }
    return { operationId: operation.id, repeated: false, created, updated, count: created + updated }
  })
}

export async function latestShiftPlanOperation(clinicId: string) {
  await ensureShiftPlanningTables()
  const [operation] = await db.select().from(shiftPlanOperations).where(and(eq(shiftPlanOperations.clinicId, clinicId), eq(shiftPlanOperations.status, 'active'))).orderBy(sql`${shiftPlanOperations.createdAt} DESC`).limit(1)
  if (!operation) return null
  const items = await db.select().from(shiftPlanOperationItems).where(eq(shiftPlanOperationItems.operationId, operation.id))
  return { id: operation.id, createdAt: operation.createdAt, count: items.length }
}

export async function undoShiftPlan(clinicId: string, operationId: string) {
  await ensureShiftPlanningTables()
  return db.transaction(async tx => {
    const [operation] = await tx.select().from(shiftPlanOperations).where(and(eq(shiftPlanOperations.id, operationId), eq(shiftPlanOperations.clinicId, clinicId), eq(shiftPlanOperations.status, 'active'))).limit(1)
    if (!operation) throw new Error('Geri alınabilecek mesai işlemi bulunamadı.')
    const items = await tx.select().from(shiftPlanOperationItems).where(eq(shiftPlanOperationItems.operationId, operationId))
    for (const item of items) {
      const [linked] = item.shiftId ? await tx.select({ id: shiftSwapRequests.id }).from(shiftSwapRequests).where(or(eq(shiftSwapRequests.shiftId, item.shiftId), eq(shiftSwapRequests.targetShiftId, item.shiftId))).limit(1) : []
      const [current] = item.shiftId ? await tx.select().from(shifts).where(and(eq(shifts.id, item.shiftId), eq(shifts.clinicId, clinicId))).limit(1) : []
      const after = item.afterState as ShiftSnapshot
      if (linked || !current || current.userId !== after.userId || current.date !== after.date || current.startTime !== after.startTime || current.endTime !== after.endTime || current.shiftType !== after.shiftType) throw new Error('Mesai kayıtları sonradan değiştiği için bu işlem güvenle geri alınamaz.')
    }
    for (const item of items) {
      if (item.action === 'created') await tx.delete(shifts).where(and(eq(shifts.id, item.shiftId!), eq(shifts.clinicId, clinicId)))
      else {
        const before = item.beforeState as ShiftSnapshot
        await tx.update(shifts).set({ startTime: before.startTime, endTime: before.endTime, shiftType: before.shiftType, notes: before.notes }).where(and(eq(shifts.id, item.shiftId!), eq(shifts.clinicId, clinicId)))
      }
    }
    await tx.update(shiftPlanOperations).set({ status: 'undone' }).where(eq(shiftPlanOperations.id, operationId))
    return { ok: true, count: items.length }
  })
}
