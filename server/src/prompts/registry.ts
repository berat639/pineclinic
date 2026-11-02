import { sql } from 'drizzle-orm'
import { PROMPT_SECTIONS, getDefaultPromptValue } from '../data/default-prompts'

export function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? ''
  })
}

export async function getPromptTemplate(key: string, clinicId?: string): Promise<string> {
  try {
    const { getSetting } = await import('../db/repositories/settings')
    const dbVal = await getSetting(key, clinicId)
    if (dbVal && dbVal.trim()) return dbVal
  } catch {}
  return getDefaultPromptValue(key) ?? ''
}

let seeded = false

/**
 * Idempotently seeds missing default prompt templates into `clinic_settings`
 * for all active clinics using `ON CONFLICT (clinic_id, key) DO NOTHING`
 * so existing clinic customizations are never overwritten.
 */
export async function ensurePromptTemplates(): Promise<void> {
  if (seeded) return
  try {
    const { db } = await import('../db/client')
    const clinicRows = await db.execute<{ id: string }>(sql`SELECT id FROM clinics WHERE is_active = true`)
    for (const clinic of clinicRows) {
      for (const section of PROMPT_SECTIONS) {
        await db.execute(sql`
          INSERT INTO clinic_settings (clinic_id, key, value, updated_at)
          VALUES (${clinic.id}::uuid, ${section.key}, ${section.defaultValue}, now())
          ON CONFLICT (clinic_id, key) DO NOTHING
        `)
      }
    }
    seeded = true
  } catch (err) {
    console.warn('[PromptRegistry] Varsayılan prompt şablonları seed edilemedi:', err instanceof Error ? err.message : 'unknown')
  }
}
