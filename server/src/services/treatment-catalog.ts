import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { treatmentCatalog } from '../db/schema'
import { ensureTreatmentPlanningSchema } from '../db/treatment-planning-schema'
import { TreatmentPlanError } from './treatment-planning'

type CatalogInput = { kind: 'procedure' | 'indication'; name: string; scope?: 'tooth' | 'jaw' | 'mouth'; priceMinor?: number; color?: string; materials?: unknown[] }

export async function listTreatmentCatalog(clinicId: string) {
  await ensureTreatmentPlanningSchema()
  return db.select().from(treatmentCatalog).where(and(eq(treatmentCatalog.clinicId, clinicId), eq(treatmentCatalog.active, true))).orderBy(treatmentCatalog.name)
}

export async function saveTreatmentCatalog(clinicId: string, input: CatalogInput, id?: string) {
  await ensureTreatmentPlanningSchema()
  if (!input || !['procedure', 'indication'].includes(input.kind) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120)
    throw new TreatmentPlanError('Katalog adı veya türü geçersiz')
  if (id && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new TreatmentPlanError('Katalog kimliği geçersiz')
  const scope = input.kind === 'indication' ? 'tooth' : (input.scope || 'tooth')
  if (!['tooth', 'jaw', 'mouth'].includes(scope)) throw new TreatmentPlanError('Tedavi kapsamı geçersiz')
  const priceMinor = input.kind === 'indication' ? 0 : (input.priceMinor ?? 0)
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new TreatmentPlanError('Fiyat geçersiz')
  if (input.color && !/^#[0-9a-f]{6}$/i.test(input.color)) throw new TreatmentPlanError('Renk geçersiz')
  if (input.materials && (!Array.isArray(input.materials) || input.materials.length > 100)) throw new TreatmentPlanError('Malzeme listesi geçersiz')
  const values = {
    clinicId, kind: input.kind, name: input.name.trim(), nameKey: input.name.trim().toLocaleLowerCase('tr-TR'),
    scope, priceMinor, color: input.color || '#0284c7', materials: input.materials || [], active: true,
  }
  try {
    if (id) {
      const [row] = await db.update(treatmentCatalog).set(values).where(and(eq(treatmentCatalog.id, id), eq(treatmentCatalog.clinicId, clinicId), eq(treatmentCatalog.active, true), eq(treatmentCatalog.kind, input.kind))).returning()
      if (!row) throw new TreatmentPlanError('Katalog kaydı bulunamadı', 404)
      return row
    }
    const [row] = await db.insert(treatmentCatalog).values(values).returning()
    return row
  } catch (error) {
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505') throw new TreatmentPlanError('Bu adla aktif bir katalog kaydı zaten var', 409)
    throw error
  }
}

export async function archiveTreatmentCatalog(clinicId: string, id: string) {
  await ensureTreatmentPlanningSchema()
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new TreatmentPlanError('Katalog kimliği geçersiz')
  const [row] = await db.update(treatmentCatalog).set({ active: false }).where(and(eq(treatmentCatalog.id, id), eq(treatmentCatalog.clinicId, clinicId), eq(treatmentCatalog.active, true))).returning({ id: treatmentCatalog.id })
  return !!row
}
