import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import type { SavePlanInput } from './treatment-planning'

// This suite only runs against an explicitly supplied isolated database.
const testUrl = process.env.TREATMENT_TEST_DATABASE_URL
describe.skipIf(!testUrl)('treatment planning transactions', () => {
  let sql: postgres.Sql
  let service: typeof import('./treatment-planning')
  let clinicId: string
  let otherClinicId: string
  let patientId: string
  let otherPatientId: string
  let userId: string
  let inventoryId: string
  let appointmentId: string
  let planId: string
  let treatmentId: string
  let createInput: SavePlanInput

  beforeAll(async () => {
    if (!testUrl) throw new Error('Test database is required')
    process.env.DATABASE_URL = testUrl
    sql = postgres(testUrl, { max: 1, onnotice: () => {} })
    service = await import('./treatment-planning')
    const [clinic] = await sql`SELECT id FROM clinics WHERE is_active = true LIMIT 1`
    const [user] = await sql`SELECT id FROM users LIMIT 1`
    clinicId = clinic.id
    userId = user.id
    const [otherClinic] = await sql`INSERT INTO clinics (name) VALUES ('Plan integration test') RETURNING id`
    otherClinicId = otherClinic.id
    const [patient] = await sql`INSERT INTO patients (clinic_id, name) VALUES (${clinicId}, 'Plan test patient') RETURNING id`
    const [otherPatient] = await sql`INSERT INTO patients (clinic_id, name) VALUES (${otherClinicId}, 'Other clinic patient') RETURNING id`
    patientId = patient.id
    otherPatientId = otherPatient.id
    const [inventory] = await sql`INSERT INTO inventory_items (clinic_id, name, quantity, cost_per_unit) VALUES (${clinicId}, 'Test material', 3, 20) RETURNING id`
    inventoryId = inventory.id
    const [appointment] = await sql`INSERT INTO dental_appointments (clinic_id, patient_id, title, start_time, end_time)
      VALUES (${clinicId}, ${patientId}, 'Test', NOW(), NOW() + INTERVAL '1 hour') RETURNING id`
    appointmentId = appointment.id
    createInput = {
      patientId, name: 'Test plan', appointmentId, idempotencyKey: crypto.randomUUID(), consultationNote: 'Test note',
      treatments: [{ procedureName: 'Dolgu', toothNumber: '16', basePriceMinor: 100000,
        materials: [{ inventoryItemId: inventoryId, quantity: 2, unitSalePriceMinor: 0 }] }],
    }
  })

  afterAll(async () => {
    if (sql) await sql.end()
  })

  test('creates once, links the appointment, retains materials and does not consume stock', async () => {
    const plan = await service.saveTreatmentPlan(createInput, clinicId, userId)
    expect(plan).not.toBeNull()
    planId = plan!.id
    treatmentId = plan!.treatments[0].id
    expect(plan!.version).toBe(1)
    expect(plan!.consultationNote).toBe('Test note')
    expect(plan!.treatments[0].materials).toEqual([{ inventoryItemId: inventoryId, name: 'Test material', quantity: 2, unitCostMinor: 2000, unitSalePriceMinor: 0 }])
    expect((await sql`SELECT quantity FROM inventory_items WHERE id = ${inventoryId}`)[0].quantity).toBe(3)
    expect((await sql`SELECT count(*)::int AS n FROM appointment_treatments WHERE treatment_plan_id = ${treatmentId}`)[0].n).toBe(1)
    const again = await service.saveTreatmentPlan(createInput, clinicId, userId)
    expect(again?.id).toBe(planId)
    expect((await sql`SELECT count(*)::int AS n FROM treatment_groups WHERE id = ${planId}`)[0].n).toBe(1)
  })

  test('rejects cross-clinic patients and cross-patient appointments without creating a group', async () => {
    const input = { ...createInput, patientId: otherPatientId, idempotencyKey: crypto.randomUUID() }
    await expect(service.saveTreatmentPlan(input, clinicId, userId)).rejects.toThrow('Hasta bulunamadı')
    const [other] = await sql`INSERT INTO patients (clinic_id, name) VALUES (${clinicId}, 'Other patient') RETURNING id`
    await expect(service.saveTreatmentPlan({ ...createInput, patientId: other.id, idempotencyKey: crypto.randomUUID() }, clinicId, userId))
      .rejects.toThrow('Randevu bu hastaya ait değil')
    expect((await sql`SELECT count(*)::int AS n FROM treatment_groups WHERE patient_id = ${other.id}`)[0].n).toBe(0)
  })

  test('concurrent retries with the same key create one group', async () => {
    const input = { ...createInput, idempotencyKey: crypto.randomUUID() }
    const [first, second] = await Promise.all([
      service.saveTreatmentPlan(input, clinicId, userId), service.saveTreatmentPlan(input, clinicId, userId),
    ])
    expect(first?.id).toBe(second?.id)
    expect((await sql`SELECT count(*)::int AS n FROM treatment_group_details WHERE idempotency_key = ${input.idempotencyKey}`)[0].n).toBe(1)
  })

  test('legacy single-item creation defers stock consumption as well', async () => {
    const before = (await sql`SELECT quantity FROM inventory_items WHERE id = ${inventoryId}`)[0].quantity
    const item = await service.createStandaloneTreatment(patientId, {
      procedureName: 'Muayene', cost: 10, materials: [{ inventoryItemId: inventoryId, quantity: 1 }],
    }, clinicId)
    expect(item.status).toBe('planned')
    expect((await sql`SELECT quantity FROM inventory_items WHERE id = ${inventoryId}`)[0].quantity).toBe(before)
    expect((await sql`SELECT stock_state FROM treatment_plan_details WHERE treatment_id = ${item.id}`)[0].stock_state).toBe('planned')
  })

  test('catalog scope is tenant-owned and validated against the target', async () => {
    const catalog = await import('./treatment-catalog')
    const entry = await catalog.saveTreatmentCatalog(clinicId, { kind: 'procedure', name: `Ağız işlemi ${crypto.randomUUID()}`, scope: 'mouth', priceMinor: 50000 })
    const input: SavePlanInput = { patientId, name: 'Scope test', idempotencyKey: crypto.randomUUID(), treatments: [{
      procedureName: entry.name, toothNumber: '16', basePriceMinor: 50000, metadata: { procedureId: entry.id, scope: 'mouth' },
    }] }
    await expect(service.saveTreatmentPlan(input, clinicId, userId)).rejects.toThrow('Tedavi hedefi')
    const saved = await service.saveTreatmentPlan({ ...input, treatments: [{ ...input.treatments[0], toothNumber: 'general' }] }, clinicId, userId)
    expect(saved?.treatments).toHaveLength(1)
    expect(saved?.treatments[0].toothNumber).toBe('general')
    await expect(catalog.saveTreatmentCatalog(otherClinicId, { kind: 'procedure', name: entry.name, scope: 'mouth' }, entry.id)).rejects.toThrow('bulunamadı')
  })

  test('uses optimistic version and preserves plan material details', async () => {
    const plan = await service.getTreatmentPlan(planId, clinicId)
    const input = { ...createInput, idempotencyKey: undefined, expectedVersion: plan!.version,
      name: 'Updated plan', treatments: [{ ...createInput.treatments[0], id: treatmentId }] }
    const updated = await service.saveTreatmentPlan(input, clinicId, userId, planId)
    expect(updated?.version).toBe(2)
    expect(updated?.treatments[0].materials).toEqual(plan?.treatments[0].materials)
    await expect(service.saveTreatmentPlan(input, clinicId, userId, planId)).rejects.toThrow('başka bir oturumda')
  })

  test('completion consumes stock only once, and insufficient stock rolls back', async () => {
    await sql`UPDATE inventory_items SET quantity = 1 WHERE id = ${inventoryId}`
    await expect(service.completeTreatmentItem(treatmentId, clinicId, { status: 'completed' })).rejects.toThrow('yeterli stok')
    expect((await sql`SELECT status FROM treatment_plans WHERE id = ${treatmentId}`)[0].status).toBe('planned')
    expect((await sql`SELECT count(*)::int AS n FROM inventory_movements WHERE item_id = ${inventoryId}`)[0].n).toBe(0)
    await sql`UPDATE inventory_items SET quantity = 3 WHERE id = ${inventoryId}`
    await service.completeTreatmentItem(treatmentId, clinicId, { status: 'completed' })
    await service.completeTreatmentItem(treatmentId, clinicId, { status: 'planned' })
    await service.completeTreatmentItem(treatmentId, clinicId, { status: 'completed' })
    expect((await sql`SELECT quantity FROM inventory_items WHERE id = ${inventoryId}`)[0].quantity).toBe(1)
    expect((await sql`SELECT count(*)::int AS n FROM inventory_movements WHERE item_id = ${inventoryId}`)[0].n).toBe(1)
  })

  test('completed item cannot be changed or removed from a plan', async () => {
    const plan = await service.getTreatmentPlan(planId, clinicId)
    const input = { ...createInput, idempotencyKey: undefined, expectedVersion: plan!.version, treatments: [] }
    await expect(service.saveTreatmentPlan(input, clinicId, userId, planId)).rejects.toThrow('kaldırılamaz')
    expect((await service.getTreatmentPlan(planId, clinicId))?.version).toBe(plan!.version)
    await expect(service.cancelTreatmentItem(treatmentId, clinicId)).rejects.toThrow('kaldırılamaz')
    await expect(service.cancelTreatmentGroup(planId, clinicId)).rejects.toThrow('kaldırılamaz')
  })
  test('retains multiple notification channels and clears the schedule when disabled', async () => {
    const plan = await service.saveTreatmentPlan({ ...createInput, idempotencyKey: crypto.randomUUID(),
      metadata: { notificationChannels: ['sms', 'email', 'assistant_call'] },
      treatments: [{ procedureName: 'Notification test', toothNumber: '17', basePriceMinor: 10000,
        notificationType: 'sms,email,assistant_call', notifyPatient: true, isPeriodic: true, periodDays: 90, nextNotificationDate: '2099-01-01' }],
    }, clinicId, userId)
    const loaded = await service.getTreatmentPlan(plan!.id, clinicId)
    expect(loaded!.treatments[0].notificationType).toBe('sms,email,assistant_call')
    expect(loaded!.metadata).toEqual({ notificationChannels: ['sms', 'email', 'assistant_call'] })
    const saved = await service.saveTreatmentPlan({ patientId, name: loaded!.name, expectedVersion: loaded!.version,
      treatments: [{ id: loaded!.treatments[0].id, procedureName: 'Notification test', toothNumber: '17', basePriceMinor: 10000,
        notificationType: '', notifyPatient: false, isPeriodic: false }],
    }, clinicId, userId, loaded!.id)
    expect(saved!.treatments[0].nextNotificationDate).toBeNull()
    expect(saved!.treatments[0].notifyPatient).toBe(false)
  })

  test('saves fractional kuruş prices and pro-rata percentage discounts cleanly', async () => {
    const plan = await service.saveTreatmentPlan({
      patientId, name: 'Kuruşlu Plan Testi', idempotencyKey: crypto.randomUUID(),
      discountPercentBps: 1500, discountFixedMinor: 10000,
      treatments: [
        { procedureName: 'Kompozit Dolgu', toothNumber: '11', basePriceMinor: 125050 },
        { procedureName: 'Kompozit Dolgu', toothNumber: '12', basePriceMinor: 125050 },
        { procedureName: 'Kompozit Dolgu', toothNumber: '13', basePriceMinor: 125050 },
      ],
    }, clinicId, userId)
    expect(plan).not.toBeNull()
    expect(plan!.treatments).toHaveLength(3)
    expect(plan!.treatments.every(t => t.basePriceMinor === 125050)).toBe(true)
  })

})
