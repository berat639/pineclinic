import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'

const testUrl = process.env.TREATMENT_TEST_DATABASE_URL
describe.skipIf(!testUrl)('plan attachment uploads', () => {
  let sql: postgres.Sql
  let attachments: typeof import('./plan-attachments')
  let plans: typeof import('./treatment-planning')
  let clinicId: string
  let otherClinicId: string
  let patientId: string
  let userId: string
  const created: string[] = []
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

  beforeAll(async () => {
    if (!testUrl) throw new Error('Test database is required')
    process.env.DATABASE_URL = testUrl
    sql = postgres(testUrl, { max: 1, onnotice: () => {} })
    attachments = await import('./plan-attachments'); plans = await import('./treatment-planning')
    const [clinic] = await sql`SELECT id FROM clinics ORDER BY created_at LIMIT 1`
    const [other] = await sql`INSERT INTO clinics (name) VALUES ('Attachment test other') RETURNING id`
    const [patient] = await sql`INSERT INTO patients (clinic_id, name) VALUES (${clinic.id}, 'Attachment test') RETURNING id`
    const [user] = await sql`SELECT id FROM users LIMIT 1`
    clinicId = clinic.id; otherClinicId = other.id; patientId = patient.id; userId = user.id
  })
  afterAll(async () => {
    for (const id of created) await rm(resolve(import.meta.dir, '../../public/uploads/plan-assets', clinicId, id), { recursive: true, force: true })
    if (sql) await sql.end()
  })

  test('chunk upload resumes by offset and only complete validated files can be linked', async () => {
    const input = { kind: 'photo' as const, files: [{ name: 'image.png', size: png.length }], requestKey: crypto.randomUUID() }
    const [first, retry] = await Promise.all([
      attachments.createPlanAttachment(clinicId, patientId, input), attachments.createPlanAttachment(clinicId, patientId, input),
    ])
    expect(first.id).toBe(retry.id)
    created.push(first.id)
    await expect(attachments.finishPlanAttachment(clinicId, patientId, first.id)).rejects.toThrow('henüz tamamlanmadı')
    await attachments.uploadPlanChunk(clinicId, patientId, first.id, 0, 0, png.subarray(0, 10))
    await expect(attachments.uploadPlanChunk(clinicId, patientId, first.id, 0, 0, png.subarray(0, 10))).rejects.toThrow('dosya konumu')
    await attachments.uploadPlanChunk(clinicId, patientId, first.id, 0, 10, png.subarray(10))
    await attachments.finishPlanAttachment(clinicId, patientId, first.id)
    await expect(attachments.getPlanAttachment(otherClinicId, patientId, first.id)).rejects.toThrow('bulunamadı')
    const file = await attachments.getPlanAttachmentFile(clinicId, patientId, first.id, 0)
    expect(Buffer.from(await Bun.file(file.path).arrayBuffer())).toEqual(png)
    const plan = await plans.saveTreatmentPlan({ patientId, name: 'Attachment plan', treatments: [], idempotencyKey: crypto.randomUUID(), attachmentIds: [first.id] }, clinicId, userId)
    expect(plan?.attachments.map(item => item.id)).toEqual([first.id])
  })

  test('file types, limits and contents are checked server-side', async () => {
    await expect(attachments.createPlanAttachment(clinicId, patientId, { kind: 'photo', files: [{ name: 'bad.exe', size: 10 }], requestKey: crypto.randomUUID() })).rejects.toThrow('türü')
    await expect(attachments.createPlanAttachment(clinicId, patientId, { kind: 'photo', files: [{ name: 'big.png', size: 20 * 1024 * 1024 + 1 }], requestKey: crypto.randomUUID() })).rejects.toThrow('boyutu')
    const bad = await attachments.createPlanAttachment(clinicId, patientId, { kind: 'photo', files: [{ name: 'bad.png', size: 8 }], requestKey: crypto.randomUUID() })
    created.push(bad.id)
    await attachments.uploadPlanChunk(clinicId, patientId, bad.id, 0, 0, Buffer.alloc(8))
    await expect(attachments.finishPlanAttachment(clinicId, patientId, bad.id)).rejects.toThrow('içeriği')
    expect((await attachments.getPlanAttachment(clinicId, patientId, bad.id)).status).toBe('pending')
  })
})
