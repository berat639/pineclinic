import { mkdir, open, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { patients, planAttachmentFiles, planAttachments } from '../db/schema'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import { getSetting, setSetting } from '../db/repositories/settings'
import { TreatmentPlanError } from './treatment-planning'

const ROOT = resolve(import.meta.dir, '../../public/uploads/plan-assets')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 8 * 1024 * 1024
const DEFAULTS = { imageBytes: 20 * 1024 * 1024, dicomBytes: 256 * 1024 * 1024, seriesBytes: 2 * 1024 * 1024 * 1024, seriesFiles: 10000 }
type Limits = typeof DEFAULTS
type FileInput = { name: string; size: number }
type AttachmentKind = 'photo' | 'radiology' | 'cbct'
const settingKey = 'treatment_attachments.limits'

export async function attachmentLimits(clinicId: string): Promise<Limits> {
  const raw = await getSetting(settingKey, clinicId)
  if (!raw) return DEFAULTS
  try {
    const value = JSON.parse(raw)
    const result = { ...DEFAULTS }
    for (const key of Object.keys(result) as (keyof Limits)[]) {
      if (Number.isSafeInteger(value[key]) && value[key] > 0 && value[key] <= (key === 'seriesFiles' ? 50000 : 10 * 1024 * 1024 * 1024)) result[key] = value[key]
    }
    return result
  } catch { return DEFAULTS }
}

export async function saveAttachmentLimits(clinicId: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TreatmentPlanError('Dosya sınırları geçersiz')
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(DEFAULTS) as (keyof Limits)[]) {
    const limit = key === 'seriesFiles' ? 50000 : 10 * 1024 * 1024 * 1024
    if (!Number.isSafeInteger(obj[key]) || Number(obj[key]) <= 0 || Number(obj[key]) > limit) throw new TreatmentPlanError('Dosya sınırları geçersiz')
  }
  await setSetting(settingKey, JSON.stringify(obj), clinicId)
  return attachmentLimits(clinicId)
}

function pathFor(clinicId: string, attachmentId: string, index?: number) {
  if (!UUID.test(clinicId) || !UUID.test(attachmentId) || (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index >= 50000)))
    throw new TreatmentPlanError('Dosya kimliği geçersiz')
  return resolve(ROOT, clinicId, attachmentId, ...(index === undefined ? [] : [String(index)]))
}

function fileType(name: string): 'image/jpeg' | 'image/png' | 'application/dicom' | null {
  const extension = name.toLocaleLowerCase('en-US').split('.').pop()
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'png' ? 'image/png' : extension === 'dcm' || extension === 'dicom' ? 'application/dicom' : null
}

export async function createPlanAttachment(clinicId: string, patientId: string, input: { kind: AttachmentKind; files: FileInput[]; requestKey: string }) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId) || !input || !['photo', 'radiology', 'cbct'].includes(input.kind) || !Array.isArray(input.files) ||
    !input.requestKey || input.requestKey.length > 128) throw new TreatmentPlanError('Dosya isteği geçersiz')
  const limits = await attachmentLimits(clinicId)
  const maxFiles = input.kind === 'cbct' ? limits.seriesFiles : input.kind === 'photo' ? 1000 : 1
  if (!input.files.length || input.files.length > maxFiles) throw new TreatmentPlanError('Dosya adedi sınırı aşıldı')
  let total = 0
  const files = input.files.map((file, index) => {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 255 || !Number.isSafeInteger(file.size) || file.size < 1)
      throw new TreatmentPlanError('Dosya bilgisi geçersiz')
    const type = fileType(file.name)
    if (!type || (input.kind === 'photo' && type === 'application/dicom') || (input.kind === 'cbct' && type !== 'application/dicom'))
      throw new TreatmentPlanError('Dosya türü desteklenmiyor')
    if (file.size > (type === 'application/dicom' ? limits.dicomBytes : limits.imageBytes)) throw new TreatmentPlanError('Dosya boyutu sınırı aşıldı')
    total += file.size
    return { fileIndex: index, name: file.name, contentType: type, sizeBytes: file.size, uploadedBytes: 0 }
  })
  if (!Number.isSafeInteger(total) || (input.kind !== 'radiology' && total > limits.seriesBytes)) throw new TreatmentPlanError('Seri boyutu sınırı aşıldı')
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment:${clinicId}:${input.requestKey}`}, 0))`)
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1)
    if (!patient) throw new TreatmentPlanError('Hasta bulunamadı', 404)
    const [previous] = await tx.select().from(planAttachments).where(and(eq(planAttachments.clinicId, clinicId), eq(planAttachments.requestKey, input.requestKey))).limit(1)
    if (previous) {
      const oldFiles = await tx.select().from(planAttachmentFiles).where(eq(planAttachmentFiles.attachmentId, previous.id)).orderBy(planAttachmentFiles.fileIndex)
      if (previous.patientId !== patientId || previous.kind !== input.kind || previous.totalBytes !== total || oldFiles.length !== files.length ||
        oldFiles.some((file, i) => file.name !== files[i].name || file.sizeBytes !== files[i].sizeBytes)) throw new TreatmentPlanError('İstek anahtarı başka bir dosya için kullanıldı', 409)
      return { ...previous, files: oldFiles }
    }
    const [attachment] = await tx.insert(planAttachments).values({ clinicId, patientId, kind: input.kind, requestKey: input.requestKey, totalBytes: total }).returning()
    for (let start = 0; start < files.length; start += 500) {
      await tx.insert(planAttachmentFiles).values(files.slice(start, start + 500).map(file => ({ ...file, attachmentId: attachment.id })))
    }
    return { ...attachment, files }
  })
}

export async function getPlanAttachment(clinicId: string, patientId: string, id: string) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId) || !UUID.test(id)) throw new TreatmentPlanError('Dosya kimliği geçersiz')
  const [attachment] = await db.select().from(planAttachments).where(and(eq(planAttachments.id, id), eq(planAttachments.clinicId, clinicId), eq(planAttachments.patientId, patientId))).limit(1)
  if (!attachment) throw new TreatmentPlanError('Dosya bulunamadı', 404)
  const files = await db.select().from(planAttachmentFiles).where(eq(planAttachmentFiles.attachmentId, id)).orderBy(planAttachmentFiles.fileIndex)
  return { ...attachment, files }
}

export async function readLimitedChunk(request: Request) {
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > CHUNK) throw new TreatmentPlanError('Parça boyutu sınırı aşıldı', 413)
  if (!request.body) throw new TreatmentPlanError('Dosya parçası boş')
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > CHUNK) { await reader.cancel(); throw new TreatmentPlanError('Parça boyutu sınırı aşıldı', 413) }
      parts.push(result.value)
    }
  } finally { reader.releaseLock() }
  if (!size) throw new TreatmentPlanError('Dosya parçası boş')
  return Buffer.concat(parts, size)
}

export async function uploadPlanChunk(clinicId: string, patientId: string, id: string, index: number, offset: number, chunk: Buffer) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId) || !UUID.test(id) || !Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(offset) || offset < 0 || !chunk.length || chunk.length > CHUNK)
    throw new TreatmentPlanError('Dosya parçası geçersiz')
  return db.transaction(async tx => {
    const [attachment] = await tx.select().from(planAttachments).where(and(eq(planAttachments.id, id), eq(planAttachments.clinicId, clinicId), eq(planAttachments.patientId, patientId))).for('update')
    if (!attachment) throw new TreatmentPlanError('Dosya bulunamadı', 404)
    if (attachment.status !== 'pending') throw new TreatmentPlanError('Yükleme tamamlandı veya iptal edildi', 409)
    const [file] = await tx.select().from(planAttachmentFiles).where(and(eq(planAttachmentFiles.attachmentId, id), eq(planAttachmentFiles.fileIndex, index))).for('update')
    if (!file) throw new TreatmentPlanError('Dosya bulunamadı', 404)
    if (file.uploadedBytes !== offset) throw new TreatmentPlanError(`Beklenen dosya konumu: ${file.uploadedBytes}`, 409)
    if (offset + chunk.length > file.sizeBytes) throw new TreatmentPlanError('Dosya boyutu aşıldı')
    const directory = pathFor(clinicId, id)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = pathFor(clinicId, id, index)
    const handle = await open(path, 'a+', 0o600)
    try {
      const existing = await handle.stat()
      if (existing.size < offset) throw new TreatmentPlanError('Yükleme eksik; yeni yükleme başlatın', 409)
      if (existing.size > offset) await handle.truncate(offset)
      await handle.writeFile(chunk)
      await handle.sync()
    } finally { await handle.close() }
    const uploadedBytes = offset + chunk.length
    await tx.update(planAttachmentFiles).set({ uploadedBytes }).where(and(eq(planAttachmentFiles.attachmentId, id), eq(planAttachmentFiles.fileIndex, index)))
    await tx.update(planAttachments).set({ updatedAt: new Date() }).where(eq(planAttachments.id, id))
    return { uploadedBytes }
  })
}

async function validateHeader(path: string, contentType: string) {
  const handle = await open(path, 'r')
  try {
    const size = (await handle.stat()).size
    const bytes = Buffer.alloc(132)
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (contentType === 'image/jpeg') return size >= 4 && bytesRead >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if (contentType === 'image/png') {
      if (size < 45 || bytesRead < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return false
      const tail = Buffer.alloc(12)
      await handle.read(tail, 0, tail.length, size - tail.length)
      return tail.readUInt32BE(0) === 0 && tail.subarray(4, 8).toString('ascii') === 'IEND'
    }
    // Part 10 files have DICM; a valid headerless dataset commonly starts with
    // a standard little-endian group. The viewer performs full DICOM parsing.
    return (bytesRead >= 132 && bytes.subarray(128, 132).toString('ascii') === 'DICM') ||
      (bytesRead >= 8 && [0x0002, 0x0008].includes(bytes.readUInt16LE(0)))
  } finally { await handle.close() }
}

export async function finishPlanAttachment(clinicId: string, patientId: string, id: string) {
  await ensureTreatmentPlanningSchema()
  if (!UUID.test(patientId) || !UUID.test(id)) throw new TreatmentPlanError('Dosya kimliği geçersiz')
  return db.transaction(async tx => {
    const [attachment] = await tx.select().from(planAttachments).where(and(eq(planAttachments.id, id), eq(planAttachments.clinicId, clinicId), eq(planAttachments.patientId, patientId))).for('update')
    if (!attachment) throw new TreatmentPlanError('Dosya bulunamadı', 404)
    if (attachment.status === 'complete') return attachment
    if (attachment.status !== 'pending') throw new TreatmentPlanError('Yükleme kapatılmış', 409)
    const files = await tx.select().from(planAttachmentFiles).where(eq(planAttachmentFiles.attachmentId, id)).orderBy(planAttachmentFiles.fileIndex)
    for (const file of files) {
      if (file.uploadedBytes !== file.sizeBytes) throw new TreatmentPlanError('Yükleme henüz tamamlanmadı', 409)
      const path = pathFor(clinicId, id, file.fileIndex)
      let size: number
      try { size = (await stat(path)).size } catch { throw new TreatmentPlanError('Dosya eksik; yüklemeyi yeniden başlatın', 409) }
      if (size !== file.sizeBytes || !await validateHeader(path, file.contentType)) throw new TreatmentPlanError('Dosya içeriği geçersiz')
    }
    const [saved] = await tx.update(planAttachments).set({ status: 'complete', updatedAt: new Date() }).where(eq(planAttachments.id, id)).returning()
    return saved
  })
}

export async function getPlanAttachmentFile(clinicId: string, patientId: string, id: string, index: number) {
  const attachment = await getPlanAttachment(clinicId, patientId, id)
  if (attachment.status !== 'complete') throw new TreatmentPlanError('Yükleme tamamlanmadı', 409)
  const file = attachment.files.find(item => item.fileIndex === index)
  if (!file) throw new TreatmentPlanError('Dosya bulunamadı', 404)
  const path = pathFor(clinicId, id, index)
  if (!(await Bun.file(path).exists())) throw new TreatmentPlanError('Dosya bulunamadı', 404)
  return { path, contentType: file.contentType, name: file.name }
}

export async function cleanupPlanAttachments() {
  await ensureTreatmentPlanningSchema()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const stale = await db.select().from(planAttachments).where(and(isNull(planAttachments.groupId), lt(planAttachments.updatedAt, cutoff)))
  for (const item of stale) {
    const deleted = await db.delete(planAttachments).where(and(eq(planAttachments.id, item.id), isNull(planAttachments.groupId), lt(planAttachments.updatedAt, cutoff))).returning({ id: planAttachments.id })
    if (deleted.length) await rm(pathFor(item.clinicId, item.id), { recursive: true, force: true })
  }
}
