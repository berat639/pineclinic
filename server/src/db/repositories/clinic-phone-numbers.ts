import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { clinicPhoneNumbers } from '../schema'
import { requireClinicId } from '../../tenancy/context'

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').replace(/^00/, '+')
}

export async function listClinicPhoneNumbers() {
  return db.select().from(clinicPhoneNumbers)
    .where(eq(clinicPhoneNumbers.clinicId, requireClinicId()))
    .orderBy(clinicPhoneNumbers.isPrimary, clinicPhoneNumbers.createdAt)
}

export async function addClinicPhoneNumber(data: { phoneNumber: string; label?: string; isPrimary?: boolean }) {
  const clinicId = requireClinicId()
  const phoneNumber = normalizePhone(data.phoneNumber)
  if (phoneNumber.length < 10) throw new Error('Geçerli bir telefon numarası girin')
  return db.transaction(async tx => {
    if (data.isPrimary) {
      await tx.update(clinicPhoneNumbers).set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(clinicPhoneNumbers.clinicId, clinicId))
    }
    const [row] = await tx.insert(clinicPhoneNumbers).values({
      clinicId, phoneNumber, label: data.label?.trim() || null, isPrimary: Boolean(data.isPrimary), isActive: true,
    }).returning()
    return row
  })
}

export async function updateClinicPhoneNumber(id: string, data: { phoneNumber?: string; label?: string; isActive?: boolean; isPrimary?: boolean }) {
  const clinicId = requireClinicId()
  return db.transaction(async tx => {
    if (data.isPrimary) {
      await tx.update(clinicPhoneNumbers).set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(clinicPhoneNumbers.clinicId, clinicId))
    }
    const [row] = await tx.update(clinicPhoneNumbers).set({
      ...(data.phoneNumber !== undefined ? { phoneNumber: normalizePhone(data.phoneNumber) } : {}),
      ...(data.label !== undefined ? { label: data.label.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
      updatedAt: new Date(),
    }).where(and(eq(clinicPhoneNumbers.id, id), eq(clinicPhoneNumbers.clinicId, clinicId))).returning()
    return row ?? null
  })
}

export async function deleteClinicPhoneNumber(id: string) {
  const rows = await db.delete(clinicPhoneNumbers).where(and(
    eq(clinicPhoneNumbers.id, id), eq(clinicPhoneNumbers.clinicId, requireClinicId()),
  )).returning({ id: clinicPhoneNumbers.id })
  return rows.length > 0
}

export async function findClinicByPhoneNumber(phone: string) {
  const normalized = normalizePhone(phone)
  const [row] = await db.select({ clinicId: clinicPhoneNumbers.clinicId })
    .from(clinicPhoneNumbers)
    .where(and(eq(clinicPhoneNumbers.phoneNumber, normalized), eq(clinicPhoneNumbers.isActive, true)))
    .limit(1)
  return row?.clinicId ?? null
}
