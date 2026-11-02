import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import {
  appointmentTreatments, clinicMemberships, dentalAppointments, expenses,
  inventoryItems, inventoryMovements, materialUsages, patientPayments, patients, planAttachments,
  treatmentCatalog, treatmentGroupDetails, treatmentGroups, treatmentPlanDetails, treatmentPlans,
} from '../db/schema'
import { notificationChannels } from '../../../client/lib/notification-channels'
import { calculateTreatmentPrices } from './treatment-pricing'

type Material = { inventoryItemId: string; quantity: number; unitCostMinor: number; unitSalePriceMinor: number; name: string }
type TreatmentInput = {
  id?: string; procedureName: string; toothNumber?: string | null; indication?: string | null
  doctorId?: string | null; doctorIds?: string[] | null; cost?: number; basePriceMinor?: number; materials?: unknown
  dcmUrl?: string | null; isPeriodic?: boolean; periodDays?: number | null
  nextNotificationDate?: string | null; notifyPatient?: boolean; notificationType?: string | null
  metadata?: Record<string, unknown>
}
export type SavePlanInput = {
  patientId: string; name: string; treatments: TreatmentInput[]; appointmentId?: string | null
  expectedVersion?: number; idempotencyKey?: string; consultationNote?: string
  discountPercentBps?: number; discountFixedMinor?: number; metadata?: Record<string, unknown>
  attachmentIds?: string[]
}

export class TreatmentPlanError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function validUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) }
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function assertSafeInteger(value: unknown, label: string, min = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new TreatmentPlanError(`${label} geçersiz`)
}
function normalizeDoctorIds(doctorIds: unknown, doctorId: unknown): string[] {
  if (Array.isArray(doctorIds)) {
    const unique: string[] = []
    for (const raw of doctorIds) {
      if (!raw) continue
      if (!validUuid(raw)) throw new TreatmentPlanError('Hekim kimliği geçersiz')
      if (!unique.includes(raw)) unique.push(raw)
    }
    return unique
  }
  if (doctorId) {
    if (!validUuid(doctorId)) throw new TreatmentPlanError('Hekim kimliği geçersiz')
    return [doctorId]
  }
  return []
}

async function syncAppointmentTitles(tx: any, clinicId: string, appointmentIds: Iterable<string>) {
  const uniqueApptIds = Array.from(new Set(Array.from(appointmentIds).filter(id => validUuid(id))))
  if (!uniqueApptIds.length) return

  for (const apptId of uniqueApptIds) {
    const [appt] = await tx
      .select({
        id: dentalAppointments.id,
        patientId: dentalAppointments.patientId,
        title: dentalAppointments.title,
        type: dentalAppointments.type,
      })
      .from(dentalAppointments)
      .where(and(eq(dentalAppointments.id, apptId), eq(dentalAppointments.clinicId, clinicId)))
      .limit(1)
    if (!appt) continue

    let patientName = 'Hasta'
    if (appt.patientId) {
      const [pat] = await tx
        .select({ name: patients.name })
        .from(patients)
        .where(and(eq(patients.id, appt.patientId), eq(patients.clinicId, clinicId)))
        .limit(1)
      if (pat?.name) patientName = pat.name.trim()
    } else if (typeof appt.title === 'string' && appt.title.includes(' - ')) {
      patientName = appt.title.split(' - ')[0].trim() || 'Hasta'
    }

    const linkedRows = await tx
      .select({
        procedureName: treatmentPlans.procedureName,
        toothNumber: treatmentPlans.toothNumber,
      })
      .from(appointmentTreatments)
      .innerJoin(treatmentPlans, eq(appointmentTreatments.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          eq(appointmentTreatments.appointmentId, apptId),
          eq(treatmentPlans.clinicId, clinicId),
          ne(treatmentPlans.status, 'cancelled')
        )
      )
      .orderBy(appointmentTreatments.sessionNumber, treatmentPlans.createdAt)

    if (linkedRows.length > 0) {
      const labels = Array.from(
        new Set(
          linkedRows
            .map((row: { toothNumber: string | null; procedureName: string | null }) =>
              row.toothNumber
                ? `#${row.toothNumber} ${(row.procedureName || '').trim()}`.trim()
                : (row.procedureName || '').trim()
            )
            .filter(Boolean)
        )
      )
      if (labels.length > 0) {
        const nextTitle = `${patientName} - ${labels.join(', ')}`
        if (nextTitle !== appt.title) {
          await tx
            .update(dentalAppointments)
            .set({ title: nextTitle, updatedAt: new Date() })
            .where(eq(dentalAppointments.id, apptId))
        }
      }
    }
  }
}

/** Load a complete plan without exposing another clinic's data. */
export async function getTreatmentPlan(groupId: string, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!validUuid(groupId)) throw new TreatmentPlanError('Plan kimliği geçersiz')
  const [group] = await db.select().from(treatmentGroups)
    .where(and(eq(treatmentGroups.id, groupId), eq(treatmentGroups.clinicId, clinicId))).limit(1)
  if (!group || group.status === 'cancelled') return null
  const [details] = await db.select().from(treatmentGroupDetails)
    .where(and(eq(treatmentGroupDetails.groupId, groupId), eq(treatmentGroupDetails.clinicId, clinicId))).limit(1)
  const rows = await db.select({ plan: treatmentPlans, details: treatmentPlanDetails })
    .from(treatmentPlans).leftJoin(treatmentPlanDetails, eq(treatmentPlans.id, treatmentPlanDetails.treatmentId))
    .where(and(eq(treatmentPlans.groupId, groupId), eq(treatmentPlans.clinicId, clinicId)))
    .orderBy(treatmentPlans.createdAt, treatmentPlans.id)
  const paid = rows.length ? await db.select({ treatmentId: patientPayments.treatmentPlanId })
    .from(patientPayments).where(and(eq(patientPayments.clinicId, clinicId), inArray(patientPayments.treatmentPlanId, rows.map(row => row.plan.id)))) : []
  const paidIds = new Set(paid.map(row => row.treatmentId))
  const attachments = await db.select().from(planAttachments).where(and(
    eq(planAttachments.clinicId, clinicId),
    eq(planAttachments.patientId, group.patientId),
    eq(planAttachments.status, 'complete'),
    or(eq(planAttachments.groupId, groupId), isNull(planAttachments.groupId))
  )).orderBy(planAttachments.createdAt)
  return {
    ...group,
    version: details?.version ?? 0,
    consultationNote: details?.consultationNote ?? '',
    discountPercentBps: details?.discountPercentBps ?? 0,
    discountFixedMinor: details?.discountFixedMinor ?? 0,
    metadata: details?.metadata ?? {},
    attachments,
    treatments: rows.filter(row => row.plan.status !== 'cancelled').map(({ plan, details: item }) => {
      const metaObj = isObject(item?.metadata) ? item.metadata : {}
      const doctorIds = Array.isArray(metaObj.doctorIds)
        ? (metaObj.doctorIds as unknown[]).filter((id): id is string => validUuid(id))
        : (plan.doctorId ? [plan.doctorId] : [])
      return {
        ...plan, doctorIds, materials: item?.materials ?? [], basePriceMinor: item?.basePriceMinor ?? plan.cost * 100,
        netPriceMinor: item?.netPriceMinor ?? plan.cost * 100, metadata: item?.metadata ?? {},
        stockState: item?.stockState ?? 'legacy_unknown',
        locked: false,
        wasCompleted: plan.status === 'completed' || item?.stockState === 'consumed' || paidIds.has(plan.id),
      }
    }),
  }
}

/** Single transaction for the group, its items, material snapshots and links. */
export async function saveTreatmentPlan(input: SavePlanInput, clinicId: string, userId: string, groupId?: string) {
  await ensureTreatmentPlanningSchema()
  if (!isObject(input)) throw new TreatmentPlanError('Plan verisi geçersiz')
  if (!validUuid(input.patientId) || (groupId && !validUuid(groupId))) throw new TreatmentPlanError('Hasta veya plan kimliği geçersiz')
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 250) throw new TreatmentPlanError('Plan adı geçersiz')
  if (!Array.isArray(input.treatments) || input.treatments.length > 500) throw new TreatmentPlanError('Plan öğeleri geçersiz')
  if (input.appointmentId && !validUuid(input.appointmentId)) throw new TreatmentPlanError('Randevu kimliği geçersiz')
  if (input.idempotencyKey && (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length > 128)) throw new TreatmentPlanError('İstek anahtarı geçersiz')
  if (input.attachmentIds !== undefined && (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 10000 || input.attachmentIds.some(id => !validUuid(id)) || new Set(input.attachmentIds).size !== input.attachmentIds.length))
    throw new TreatmentPlanError('Plan ekleri geçersiz')
  for (const item of input.treatments) {
    if (item.notificationType !== undefined && item.notificationType !== null) {
      if (typeof item.notificationType !== 'string') throw new TreatmentPlanError('Bildirim kanalı geçersiz')
      const channels = notificationChannels(item.notificationType)
      const legacy = ['both', 'whatsapp_sms'].includes(item.notificationType)
      if (!legacy && (typeof item.notificationType !== 'string' || item.notificationType.split(',').filter(Boolean).some(channel => !channels.includes(channel as any))))
        throw new TreatmentPlanError('Bildirim kanalı geçersiz')
      if (item.notifyPatient && !channels.length) throw new TreatmentPlanError('En az bir bildirim kanalı seçin')
    }
    if (item.isPeriodic && (!Number.isInteger(item.periodDays) || Number(item.periodDays) < 1 || Number(item.periodDays) > 3650))
      throw new TreatmentPlanError('Hatırlatma aralığı 1 ile 3650 gün arasında olmalıdır')
  }
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const percentBps = input.discountPercentBps ?? 0
  const fixedMinor = input.discountFixedMinor ?? 0
  assertSafeInteger(percentBps, 'İskonto')
  assertSafeInteger(fixedMinor, 'Manuel iskonto')
  const normalized: Array<TreatmentInput & { materials: Material[]; basePriceMinor: number }> = []

  for (const item of input.treatments) {
    if (!isObject(item) || typeof item.procedureName !== 'string' || !item.procedureName.trim() || item.procedureName.length > 250)
      throw new TreatmentPlanError('İşlem adı geçersiz')
    if (item.id && !validUuid(item.id)) throw new TreatmentPlanError('Tedavi kimliği geçersiz')
    const itemDoctorIds = normalizeDoctorIds(item.doctorIds, item.doctorId)
    const primaryDoctorId = itemDoctorIds[0] ?? null
    if (item.basePriceMinor !== undefined) assertSafeInteger(item.basePriceMinor, 'İşlem fiyatı')
    const basePriceMinor = item.basePriceMinor ?? Math.round(Number(item.cost ?? 0) * 100)
    assertSafeInteger(basePriceMinor, 'İşlem fiyatı')
    if (item.materials !== undefined && !Array.isArray(item.materials)) throw new TreatmentPlanError('Malzeme listesi geçersiz')
    const materials: Material[] = []
    for (const raw of (item.materials ?? []) as unknown[]) {
      if (!isObject(raw) || !validUuid(raw.inventoryItemId)) throw new TreatmentPlanError('Malzeme kimliği geçersiz')
      const quantity = Number(raw.quantity)
      assertSafeInteger(quantity, 'Malzeme miktarı', 1)
      const unitSalePriceMinor = raw.unitSalePriceMinor === undefined ? 0 : Number(raw.unitSalePriceMinor)
      assertSafeInteger(unitSalePriceMinor, 'Malzeme satış fiyatı')
      if (materials.some(m => m.inventoryItemId === raw.inventoryItemId)) throw new TreatmentPlanError('Malzeme satırda yalnız bir kez bulunabilir')
      materials.push({ inventoryItemId: raw.inventoryItemId, quantity, unitSalePriceMinor, unitCostMinor: 0, name: '' })
    }
    const mergedMeta = isObject(item.metadata) ? { ...item.metadata } : {}
    if (item.doctorIds !== undefined || itemDoctorIds.length > 0) mergedMeta.doctorIds = itemDoctorIds
    normalized.push({ ...item, doctorId: primaryDoctorId, doctorIds: itemDoctorIds, metadata: Object.keys(mergedMeta).length ? mergedMeta : item.metadata, basePriceMinor, materials })
  }
  let pricing: ReturnType<typeof calculateTreatmentPrices>
  try { pricing = calculateTreatmentPrices(normalized, percentBps, fixedMinor) }
  catch (error) { throw new TreatmentPlanError(error instanceof Error ? error.message : 'Tutar geçersiz') }

  try {
    const savedId = await db.transaction(async tx => {
      const [patient] = await tx.select({ id: patients.id }).from(patients)
        .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, clinicId))).limit(1)
      if (!patient) throw new TreatmentPlanError('Hasta bulunamadı', 404)
      if (input.appointmentId) {
        const [appointment] = await tx.select({ id: dentalAppointments.id }).from(dentalAppointments).where(and(
          eq(dentalAppointments.id, input.appointmentId), eq(dentalAppointments.clinicId, clinicId), eq(dentalAppointments.patientId, input.patientId),
        )).limit(1)
        if (!appointment) throw new TreatmentPlanError('Randevu bu hastaya ait değil', 400)
      }
      const doctorIds = [...new Set(normalized.flatMap(item => item.doctorIds && item.doctorIds.length ? item.doctorIds : (item.doctorId ? [item.doctorId] : [])))]
      if (doctorIds.length) {
        const doctors = await tx.select({ id: clinicMemberships.userId }).from(clinicMemberships).where(and(
          eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'hekim'), eq(clinicMemberships.active, true), inArray(clinicMemberships.userId, doctorIds),
        ))
        if (doctors.length !== doctorIds.length) throw new TreatmentPlanError('Seçilen hekim kliniğe ait değil')
      }
      const materialIds = [...new Set(normalized.flatMap(item => item.materials.map(m => m.inventoryItemId)))]
      const stock = materialIds.length ? await tx.select().from(inventoryItems).where(and(eq(inventoryItems.clinicId, clinicId), inArray(inventoryItems.id, materialIds))) : []
      if (stock.length !== materialIds.length) throw new TreatmentPlanError('Seçilen malzeme kliniğe ait değil')
      for (const item of normalized) for (const material of item.materials) {
        const found = stock.find(row => row.id === material.inventoryItemId)!
        material.name = found.name
        material.unitCostMinor = found.costPerUnit * 100
      }

      let currentGroupId = groupId
      let oldRows: typeof treatmentPlans.$inferSelect[] = []
      if (currentGroupId) {
        const [group] = await tx.select().from(treatmentGroups).where(and(eq(treatmentGroups.id, currentGroupId), eq(treatmentGroups.clinicId, clinicId))).for('update')
        if (!group || group.patientId !== input.patientId || group.status === 'cancelled') throw new TreatmentPlanError('Plan bulunamadı', 404)
        const [details] = await tx.select().from(treatmentGroupDetails).where(eq(treatmentGroupDetails.groupId, currentGroupId))
        if ((input.expectedVersion ?? -1) !== (details?.version ?? 0)) throw new TreatmentPlanError('Plan başka bir oturumda değiştirildi. Güncel planı açın.', 409)
        await tx.update(treatmentGroups).set({ name: input.name.trim(), updatedById: userId }).where(eq(treatmentGroups.id, currentGroupId))
        if (details) await tx.update(treatmentGroupDetails).set({
          version: details.version + 1, consultationNote: input.consultationNote ?? details.consultationNote,
          discountPercentBps: percentBps, discountFixedMinor: fixedMinor, metadata: input.metadata ?? details.metadata
        }).where(eq(treatmentGroupDetails.groupId, currentGroupId))
        else await tx.insert(treatmentGroupDetails).values({ groupId: currentGroupId, clinicId, version: 1, consultationNote: input.consultationNote ?? '', discountPercentBps: percentBps, discountFixedMinor: fixedMinor, metadata: input.metadata ?? {} })
        oldRows = await tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.groupId, currentGroupId), eq(treatmentPlans.clinicId, clinicId))).for('update')
      } else {
        if (!input.idempotencyKey) throw new TreatmentPlanError('İstek anahtarı gerekli')
        const [previous] = await tx.select().from(treatmentGroupDetails).where(and(eq(treatmentGroupDetails.clinicId, clinicId), eq(treatmentGroupDetails.idempotencyKey, input.idempotencyKey))).limit(1)
        if (previous) {
          if (previous.requestHash !== requestHash) throw new TreatmentPlanError('İstek anahtarı farklı bir plan için kullanıldı', 409)
          return previous.groupId
        }
        const [group] = await tx.insert(treatmentGroups).values({ clinicId, patientId: input.patientId, name: input.name.trim(), createdById: userId }).returning()
        currentGroupId = group.id
        await tx.insert(treatmentGroupDetails).values({
          groupId: currentGroupId, clinicId, version: 1, idempotencyKey: input.idempotencyKey,
          requestHash, consultationNote: input.consultationNote ?? '', discountPercentBps: percentBps, discountFixedMinor: fixedMinor, metadata: input.metadata ?? {}
        })
      }
      if (input.attachmentIds !== undefined) {
        const selected = input.attachmentIds.length ? await tx.select().from(planAttachments).where(and(eq(planAttachments.clinicId, clinicId), inArray(planAttachments.id, input.attachmentIds))).for('update') : []
        if (selected.length !== input.attachmentIds.length || selected.some(file => file.patientId !== input.patientId || file.status !== 'complete'))
          throw new TreatmentPlanError('Plan ekleri bu hastaya ait değil veya yükleme tamamlanmadı')
        const existing = await tx.select().from(planAttachments).where(and(eq(planAttachments.clinicId, clinicId), eq(planAttachments.groupId, currentGroupId))).for('update')
        const removed = existing.filter(file => !input.attachmentIds!.includes(file.id)).map(file => file.id)
        if (removed.length) await tx.update(planAttachments).set({ groupId: null, updatedAt: new Date() }).where(inArray(planAttachments.id, removed))
        if (input.attachmentIds.length) await tx.update(planAttachments).set({ groupId: currentGroupId, updatedAt: new Date() }).where(inArray(planAttachments.id, input.attachmentIds))
      }
      const oldById = new Map(oldRows.map(row => [row.id, row]))
      const activeRows = oldRows.filter(row => row.status !== 'cancelled')
      const incomingIds = new Set<string>(
        normalized.map(item => item.id).filter((id): id is string => Boolean(id && validUuid(id)))
      )
      const existingApptLinks = activeRows.length
        ? await tx
          .select({
            id: appointmentTreatments.id,
            appointmentId: appointmentTreatments.appointmentId,
            treatmentPlanId: appointmentTreatments.treatmentPlanId,
            sessionNumber: appointmentTreatments.sessionNumber,
          })
          .from(appointmentTreatments)
          .where(inArray(appointmentTreatments.treatmentPlanId, activeRows.map(row => row.id)))
        : []
      const existingLinksByTreatmentId = new Map<string, string[]>()
      for (const link of existingApptLinks) {
        const list = existingLinksByTreatmentId.get(link.treatmentPlanId) || []
        if (!list.includes(link.appointmentId)) list.push(link.appointmentId)
        existingLinksByTreatmentId.set(link.treatmentPlanId, list)
      }
      // If a user replaced a treatment on the same tooth in Edit mode (deleted old item, added new item on same tooth),
      // preserve that tooth's scheduled appointment session(s) instead of jumping it to input.appointmentId.
      const replacedToothLinksQueue = new Map<string, string[][]>()
      for (const old of activeRows) {
        if (!incomingIds.has(old.id)) {
          const oldApptIds = existingLinksByTreatmentId.get(old.id)
          if (oldApptIds && oldApptIds.length > 0) {
            const toothKey = old.toothNumber || ''
            const queue = replacedToothLinksQueue.get(toothKey) || []
            queue.push(oldApptIds)
            replacedToothLinksQueue.set(toothKey, queue)
          }
        }
      }
      const affectedAppointmentIds = new Set<string>(existingApptLinks.map(l => l.appointmentId))
      if (input.appointmentId) affectedAppointmentIds.add(input.appointmentId)

      const payments = activeRows.length ? await tx.select({ id: patientPayments.treatmentPlanId }).from(patientPayments)
        .where(and(eq(patientPayments.clinicId, clinicId), inArray(patientPayments.treatmentPlanId, activeRows.map(row => row.id)))) : []
      const paidIds = new Set(payments.map(row => row.id))
      const existingDetails = activeRows.length ? await tx.select().from(treatmentPlanDetails)
        .where(and(eq(treatmentPlanDetails.clinicId, clinicId), inArray(treatmentPlanDetails.treatmentId, activeRows.map(row => row.id)))) : []
      const detailById = new Map(existingDetails.map(detail => [detail.treatmentId, detail]))
      const catalogIds = [...new Set(normalized.map(item => item.metadata?.procedureId).filter((id): id is string => typeof id === 'string'))]
      if (catalogIds.some(id => !validUuid(id))) throw new TreatmentPlanError('Katalog kimliği geçersiz')
      const catalog = catalogIds.length ? await tx.select().from(treatmentCatalog).where(and(eq(treatmentCatalog.clinicId, clinicId), inArray(treatmentCatalog.id, catalogIds))) : []
      if (catalog.length !== catalogIds.length) throw new TreatmentPlanError('Katalog kaydı bu kliniğe ait değil')

      const processedIds = new Set<string>()
      for (let i = 0; i < normalized.length; i++) {
        const item = normalized[i]
        const old = item.id ? oldById.get(item.id) : undefined
        if (item.id && (!old || old.status === 'cancelled' || processedIds.has(item.id))) throw new TreatmentPlanError('Tedavi bu plana ait değil veya tekrarlanmış')
        if (item.id) processedIds.add(item.id)
        const existingDetail = old ? detailById.get(old.id) : undefined
        const procedureId = item.metadata?.procedureId
        if (typeof procedureId === 'string') {
          const entry = catalog.find(row => row.id === procedureId)
          const previousMetadata = isObject(existingDetail?.metadata) ? existingDetail.metadata : {}
          const existingCatalogId = previousMetadata.procedureId
          if (!entry || entry.kind !== 'procedure' || (!entry.active && existingCatalogId !== procedureId)) throw new TreatmentPlanError('Tedavi katalog kaydı kullanılamıyor')
          const expectedScope = existingCatalogId === procedureId ? previousMetadata.scope : entry.scope
          if (item.metadata?.scope !== expectedScope) throw new TreatmentPlanError('Tedavi kapsamı katalogla uyuşmuyor')
          const target = item.toothNumber || ''
          if ((expectedScope === 'tooth' && !/^[1-4][1-8]$/.test(target)) ||
            (expectedScope === 'jaw' && !['upper', 'lower'].includes(target)) ||
            (expectedScope === 'mouth' && target !== 'general')) throw new TreatmentPlanError('Tedavi hedefi kapsamla uyuşmuyor')
        }
        // Internal cost is a snapshot, not the inventory's current price.
        if (existingDetail) for (const material of item.materials) {
          const original = (existingDetail.materials as Material[]).find(previous => previous.inventoryItemId === material.inventoryItemId)
          if (original) { material.unitCostMinor = original.unitCostMinor; material.name = original.name }
        }
        const values = {
          procedureName: item.procedureName.trim(), toothNumber: item.toothNumber || null,
          indication: item.indication || null, doctorId: item.doctorId || null,
          cost: Math.round(pricing.lineNetMinor[i] / 100),
          dcmUrl: item.dcmUrl === undefined ? (old?.dcmUrl ?? null) : item.dcmUrl,
          isPeriodic: item.isPeriodic ?? old?.isPeriodic ?? false, periodDays: item.periodDays ?? old?.periodDays ?? null,
          nextNotificationDate: item.notifyPatient === false || item.isPeriodic === false ? null : item.nextNotificationDate ?? old?.nextNotificationDate ?? null,
          notifyPatient: item.notifyPatient ?? old?.notifyPatient ?? false,
          notificationType: item.notificationType ?? old?.notificationType ?? 'sms',
        }
        const [saved] = old
          ? await tx.update(treatmentPlans).set(values).where(eq(treatmentPlans.id, old.id)).returning()
          : await tx.insert(treatmentPlans).values({ ...values, patientId: input.patientId, clinicId, groupId: currentGroupId, status: 'planned' }).returning()
        await tx.insert(treatmentPlanDetails).values({
          treatmentId: saved.id, clinicId, basePriceMinor: item.basePriceMinor,
          netPriceMinor: pricing.lineNetMinor[i], materials: item.materials, metadata: item.metadata ?? {}, stockState: existingDetail?.stockState ?? (old ? 'legacy_unknown' : 'planned')
        })
          .onConflictDoUpdate({ target: treatmentPlanDetails.treatmentId, set: { basePriceMinor: item.basePriceMinor, netPriceMinor: pricing.lineNetMinor[i], materials: item.materials, metadata: item.metadata ?? {} } })

        if (old) {
          // Existing treatment: only link to input.appointmentId if it had NO session links at all
          const existingLinks = existingLinksByTreatmentId.get(old.id) || []
          if (existingLinks.length === 0 && input.appointmentId) {
            await tx.insert(appointmentTreatments).values({ appointmentId: input.appointmentId, treatmentPlanId: saved.id })
          }
        } else {
          // New treatment: check if it replaced a cancelled treatment on the same tooth that had session links
          const toothKey = item.toothNumber || ''
          const toothQueue = replacedToothLinksQueue.get(toothKey)
          const inheritedApptIds = toothQueue && toothQueue.length > 0 ? toothQueue.shift() : undefined
          const targetApptIds = inheritedApptIds && inheritedApptIds.length > 0
            ? inheritedApptIds
            : (input.appointmentId ? [input.appointmentId] : [])
          for (const targetApptId of targetApptIds) {
            const [link] = await tx.select({ id: appointmentTreatments.id }).from(appointmentTreatments).where(and(
              eq(appointmentTreatments.appointmentId, targetApptId), eq(appointmentTreatments.treatmentPlanId, saved.id),
            )).limit(1)
            if (!link) await tx.insert(appointmentTreatments).values({ appointmentId: targetApptId, treatmentPlanId: saved.id })
            affectedAppointmentIds.add(targetApptId)
          }
        }
      }
      for (const old of activeRows) if (!incomingIds.has(old.id)) {
        await tx.delete(appointmentTreatments).where(eq(appointmentTreatments.treatmentPlanId, old.id))
        await tx.update(treatmentPlans).set({ status: 'cancelled' }).where(eq(treatmentPlans.id, old.id))
      }
      await syncAppointmentTitles(tx, clinicId, affectedAppointmentIds)
      return currentGroupId
    })
    return await getTreatmentPlan(savedId, clinicId)
  } catch (error) {
    const cause = isObject(error) && isObject(error.cause) ? error.cause : error
    if (!groupId && input.idempotencyKey && isObject(cause) && cause.code === '23505' && cause.constraint_name === 'treatment_group_details_request_idx') {
      const [previous] = await db.select().from(treatmentGroupDetails).where(and(eq(treatmentGroupDetails.clinicId, clinicId), eq(treatmentGroupDetails.idempotencyKey, input.idempotencyKey))).limit(1)
      if (previous?.requestHash === requestHash) return await getTreatmentPlan(previous.groupId, clinicId)
      throw new TreatmentPlanError('İstek anahtarı farklı bir plan için kullanıldı', 409)
    }
    throw error
  }
}

/** Legacy single-item entry point, using the same deferred stock policy. */
export async function createStandaloneTreatment(patientId: string, input: TreatmentInput & { groupId?: string | null; status?: string }, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!validUuid(patientId) || !isObject(input) || typeof input.procedureName !== 'string' || !input.procedureName.trim())
    throw new TreatmentPlanError('Hasta veya işlem geçersiz')
  const status = input.status ?? 'planned'
  if (!['planned', 'in_progress'].includes(status)) throw new TreatmentPlanError('Tedavi önce planlanmalı, ardından tamamlanmalıdır')
  if (input.groupId && !validUuid(input.groupId)) throw new TreatmentPlanError('Plan kimliği geçersiz')
  if (input.doctorId && !validUuid(input.doctorId)) throw new TreatmentPlanError('Hekim kimliği geçersiz')
  const priceMinor = input.basePriceMinor ?? Math.round(Number(input.cost ?? 0) * 100)
  assertSafeInteger(priceMinor, 'İşlem fiyatı')
  if (input.materials !== undefined && !Array.isArray(input.materials)) throw new TreatmentPlanError('Malzeme listesi geçersiz')
  const materials: Material[] = []
  for (const raw of (input.materials ?? []) as unknown[]) {
    if (!isObject(raw) || !validUuid(raw.inventoryItemId)) throw new TreatmentPlanError('Malzeme kimliği geçersiz')
    const quantity = Number(raw.quantity)
    assertSafeInteger(quantity, 'Malzeme miktarı', 1)
    if (materials.some(item => item.inventoryItemId === raw.inventoryItemId)) throw new TreatmentPlanError('Malzeme satırda yalnız bir kez bulunabilir')
    materials.push({ inventoryItemId: raw.inventoryItemId, quantity, unitCostMinor: 0, unitSalePriceMinor: 0, name: '' })
  }
  return db.transaction(async tx => {
    const [patient] = await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))).limit(1)
    if (!patient) throw new TreatmentPlanError('Hasta bulunamadı', 404)
    if (input.groupId) {
      const [group] = await tx.select().from(treatmentGroups).where(and(eq(treatmentGroups.id, input.groupId), eq(treatmentGroups.clinicId, clinicId), eq(treatmentGroups.patientId, patientId))).for('update')
      if (!group || group.status === 'cancelled') throw new TreatmentPlanError('Plan bulunamadı', 404)
      const [details] = await tx.select({ id: treatmentGroupDetails.groupId }).from(treatmentGroupDetails).where(eq(treatmentGroupDetails.groupId, group.id)).limit(1)
      if (details) throw new TreatmentPlanError('Bu plana öğe eklemek için plan düzenleyicisini kullanın', 409)
    }
    if (input.doctorId) {
      const [doctor] = await tx.select({ id: clinicMemberships.userId }).from(clinicMemberships).where(and(eq(clinicMemberships.userId, input.doctorId),
        eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'hekim'), eq(clinicMemberships.active, true))).limit(1)
      if (!doctor) throw new TreatmentPlanError('Seçilen hekim kliniğe ait değil')
    }
    const ids = materials.map(item => item.inventoryItemId)
    const stock = ids.length ? await tx.select().from(inventoryItems).where(and(eq(inventoryItems.clinicId, clinicId), inArray(inventoryItems.id, ids))) : []
    if (stock.length !== ids.length) throw new TreatmentPlanError('Seçilen malzeme kliniğe ait değil')
    for (const material of materials) {
      const item = stock.find(row => row.id === material.inventoryItemId)!
      material.name = item.name
      material.unitCostMinor = item.costPerUnit * 100
    }
    const [created] = await tx.insert(treatmentPlans).values({
      clinicId, patientId, groupId: input.groupId || null, doctorId: input.doctorId || null,
      procedureName: input.procedureName.trim(), toothNumber: input.toothNumber || null,
      indication: input.indication || null, cost: Math.round(priceMinor / 100), status, dcmUrl: input.dcmUrl || null,
      isPeriodic: input.isPeriodic ?? false, periodDays: input.periodDays || null,
      nextNotificationDate: input.nextNotificationDate || null, notifyPatient: input.notifyPatient ?? false,
      notificationType: input.notificationType || 'sms',
    }).returning()
    await tx.insert(treatmentPlanDetails).values({ treatmentId: created.id, clinicId, basePriceMinor: priceMinor, netPriceMinor: priceMinor, materials, stockState: 'planned' })
    return created
  })
}

/** Consume new-plan material once, atomically with completion. */
export async function completeTreatmentItem(id: string, clinicId: string, values: { status?: string; groupId?: string | null; doctorId?: string | null; doctorIds?: string[] | null }) {
  await ensureTreatmentPlanningSchema()
  if (!validUuid(id)) throw new TreatmentPlanError('Tedavi kimliği geçersiz')
  if (values.status !== undefined && !['planned', 'in_progress', 'completed'].includes(values.status)) throw new TreatmentPlanError('Tedavi durumu geçersiz')
  const hasDoctorUpdate = values.doctorIds !== undefined || values.doctorId !== undefined
  const resolvedDoctorIds = values.doctorIds !== undefined
    ? normalizeDoctorIds(values.doctorIds, null)
    : values.doctorId !== undefined
      ? normalizeDoctorIds(undefined, values.doctorId)
      : []
  const effectiveDoctorId = hasDoctorUpdate ? (resolvedDoctorIds[0] ?? null) : undefined
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId))).for('update')
    if (!plan) throw new TreatmentPlanError('Tedavi bulunamadı', 404)
    if (plan.status === 'cancelled') throw new TreatmentPlanError('İptal edilmiş tedavi değiştirilemez', 409)
    if (values.groupId !== undefined && values.groupId !== plan.groupId) throw new TreatmentPlanError('Tedavi başka bir plana taşınamaz')
    if (resolvedDoctorIds.length > 0) {
      const doctors = await tx.select({ id: clinicMemberships.userId }).from(clinicMemberships).where(and(
        inArray(clinicMemberships.userId, resolvedDoctorIds),
        eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.role, 'hekim'), eq(clinicMemberships.active, true),
      ))
      if (doctors.length !== resolvedDoctorIds.length) throw new TreatmentPlanError('Seçilen hekim kliniğe ait değil')
    }
    const [details] = await tx.select().from(treatmentPlanDetails).where(eq(treatmentPlanDetails.treatmentId, id)).for('update')
    if (values.status === 'completed' && details?.stockState === 'planned') {
      const materials = [...(details.materials as Material[])].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))
      for (const material of materials) {
        const [updated] = await tx.update(inventoryItems).set({ quantity: sql`${inventoryItems.quantity} - ${material.quantity}` })
          .where(and(eq(inventoryItems.id, material.inventoryItemId), eq(inventoryItems.clinicId, clinicId), sql`${inventoryItems.quantity} >= ${material.quantity}`)).returning()
        if (!updated) throw new TreatmentPlanError(`${material.name} için yeterli stok bulunmuyor`, 409)
        const date = new Date().toISOString().slice(0, 10)
        await tx.insert(inventoryMovements).values({ clinicId, itemId: material.inventoryItemId, type: 'cikis', quantity: material.quantity, notes: `Tedavi ${plan.id}` })
        if (effectiveDoctorId || plan.doctorId) await tx.insert(materialUsages).values({ clinicId, doctorId: (effectiveDoctorId || plan.doctorId)!, patientId: plan.patientId, inventoryItemId: material.inventoryItemId, quantity: material.quantity, date })
        await tx.insert(expenses).values({
          clinicId, category: 'malzeme', itemName: material.name, quantity: material.quantity,
          unitCost: material.unitCostMinor / 100, totalCost: material.quantity * material.unitCostMinor / 100, date, notes: `Tedavi ${plan.id}`
        })
      }
      await tx.update(treatmentPlanDetails).set({ stockState: 'consumed' }).where(eq(treatmentPlanDetails.treatmentId, id))
    }
    if (hasDoctorUpdate) {
      const currentMeta = isObject(details?.metadata) ? { ...details.metadata } : {}
      currentMeta.doctorIds = resolvedDoctorIds
      if (details) {
        await tx.update(treatmentPlanDetails).set({ metadata: currentMeta }).where(eq(treatmentPlanDetails.treatmentId, id))
      } else {
        await tx.insert(treatmentPlanDetails).values({
          treatmentId: id, clinicId, basePriceMinor: plan.cost * 100, netPriceMinor: plan.cost * 100,
          materials: [], metadata: currentMeta, stockState: 'legacy_unknown',
        }).onConflictDoUpdate({ target: treatmentPlanDetails.treatmentId, set: { metadata: currentMeta } })
      }
    }
    const update: { status?: string; doctorId?: string | null } = {}
    if (values.status !== undefined) update.status = values.status
    if (effectiveDoctorId !== undefined) update.doctorId = effectiveDoctorId
    if (!Object.keys(update).length) {
      return { ...plan, doctorIds: hasDoctorUpdate ? resolvedDoctorIds : (plan.doctorId ? [plan.doctorId] : []) }
    }
    const [saved] = await tx.update(treatmentPlans).set(update).where(eq(treatmentPlans.id, id)).returning()
    return { ...saved, doctorIds: hasDoctorUpdate ? resolvedDoctorIds : (saved.doctorId ? [saved.doctorId] : []) }
  })
}

export async function cancelTreatmentItem(id: string, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!validUuid(id)) throw new TreatmentPlanError('Tedavi kimliği geçersiz')
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.id, id), eq(treatmentPlans.clinicId, clinicId))).for('update')
    if (!plan) return false
    const links = await tx.select({ appointmentId: appointmentTreatments.appointmentId }).from(appointmentTreatments).where(eq(appointmentTreatments.treatmentPlanId, id))
    await tx.delete(appointmentTreatments).where(eq(appointmentTreatments.treatmentPlanId, id))
    await tx.update(treatmentPlans).set({ status: 'cancelled' }).where(eq(treatmentPlans.id, id))
    await syncAppointmentTitles(tx, clinicId, links.map(l => l.appointmentId))
    return true
  })
}

export async function cancelTreatmentGroup(id: string, clinicId: string) {
  await ensureTreatmentPlanningSchema()
  if (!validUuid(id)) throw new TreatmentPlanError('Plan kimliği geçersiz')
  return db.transaction(async tx => {
    const [group] = await tx.select().from(treatmentGroups).where(and(eq(treatmentGroups.id, id), eq(treatmentGroups.clinicId, clinicId))).for('update')
    if (!group) return false
    const items = await tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.groupId, id), eq(treatmentPlans.clinicId, clinicId))).for('update')
    const ids = items.map(item => item.id)
    if (ids.length) await tx.update(treatmentPlans).set({ status: 'cancelled' }).where(inArray(treatmentPlans.id, ids))
    await tx.update(treatmentGroups).set({ status: 'cancelled' }).where(eq(treatmentGroups.id, id))
    return true
  })
}
