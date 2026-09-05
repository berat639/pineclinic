import { sql as drizzleSql, eq, desc } from 'drizzle-orm'
import { db } from '../client'
import { vipAssistants, type VipAssistant, type NewVipAssistant } from '../schema'

export async function listVipAssistants(): Promise<VipAssistant[]> {
  return db.select().from(vipAssistants).orderBy(desc(vipAssistants.createdAt))
}

export async function findVipByPhone(phone: string): Promise<VipAssistant | null> {
  if (!phone) return null
  const normalized = phone.replace(/\D/g, '')
  if (normalized.length < 10) return null
  const last10 = normalized.slice(-10)

  const result = await db.execute(drizzleSql`
    SELECT id, phone, contact_name, greeting, custom_prompt, grounding_enabled, active, created_at, updated_at
    FROM vip_assistants
    WHERE active = true
      AND regexp_replace(phone, '\D', '', 'g') LIKE ${'%' + last10}
    LIMIT 1
  `)

  const rows = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows
    ?? (result as unknown as Array<Record<string, unknown>>))
  if (rows.length === 0) return null

  const r = rows[0]
  return {
    id: r.id as string,
    phone: r.phone as string,
    contactName: (r.contact_name as string) || null,
    greeting: (r.greeting as string) || "Merhaba! Ben Berat Bey'in kişisel asistanı Pine Asistan, hoş geldiniz! Nasıl yardımcı olabilirim?",
    customPrompt: (r.custom_prompt as string) || null,
    groundingEnabled: r.grounding_enabled as boolean,
    active: r.active as boolean,
    createdAt: r.created_at ? new Date(r.created_at as string) : new Date(),
    updatedAt: r.updated_at ? new Date(r.updated_at as string) : new Date(),
  }
}

export async function createVipAssistant(data: {
  phone: string
  contactName?: string
  greeting?: string
  customPrompt?: string
  groundingEnabled?: boolean
  active?: boolean
}): Promise<VipAssistant> {
  const [created] = await db
    .insert(vipAssistants)
    .values({
      phone: data.phone.trim(),
      contactName: data.contactName?.trim() || null,
      greeting: data.greeting?.trim() || "Merhaba! Ben Berat Bey'in kişisel asistanı Pine Asistan, hoş geldiniz! Nasıl yardımcı olabilirim?",
      customPrompt: data.customPrompt?.trim() || null,
      groundingEnabled: data.groundingEnabled ?? true,
      active: data.active ?? true,
    })
    .returning()
  return created
}

export async function updateVipAssistant(
  id: string,
  data: Partial<{
    phone: string
    contactName: string | null
    greeting: string
    customPrompt: string | null
    groundingEnabled: boolean
    active: boolean
  }>,
): Promise<VipAssistant | null> {
  const [updated] = await db
    .update(vipAssistants)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(vipAssistants.id, id))
    .returning()
  return updated || null
}

export async function deleteVipAssistant(id: string): Promise<boolean> {
  const rows = await db.delete(vipAssistants).where(eq(vipAssistants.id, id)).returning({ id: vipAssistants.id })
  return rows.length > 0
}
