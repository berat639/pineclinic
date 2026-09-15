import { and, eq, sql as drizzleSql, inArray } from 'drizzle-orm'
import { db } from '../client'
import { businessSettings, clinicSettings } from '../schema'
import { currentClinicId } from '../../tenancy/context'

export async function getSetting(key: string, explicitClinicId?: string): Promise<string | null> {
  const clinicId = explicitClinicId ?? currentClinicId()
  if (clinicId) {
    const rows = await db.select({ value: clinicSettings.value }).from(clinicSettings)
      .where(drizzleSql`${clinicSettings.clinicId} = ${clinicId} AND ${clinicSettings.key} = ${key}`)
      .limit(1)
    return rows[0]?.value ?? null
  }
  const result = await db.execute(drizzleSql`
    SELECT value FROM business_settings WHERE key = ${key} LIMIT 1
  `)
  const rows = ((result as unknown as { rows?: Array<{ value: string }> }).rows
    ?? (result as unknown as Array<{ value: string }>))
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string, explicitClinicId?: string): Promise<void> {
  const clinicId = explicitClinicId ?? currentClinicId()
  if (clinicId) {
    await db.insert(clinicSettings).values({ clinicId, key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [clinicSettings.clinicId, clinicSettings.key],
        set: { value, updatedAt: new Date() },
      })
    return
  }
  await db.execute(drizzleSql`
    INSERT INTO business_settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
}

export async function deleteSetting(key: string, explicitClinicId?: string): Promise<void> {
  const clinicId = explicitClinicId ?? currentClinicId()
  if (clinicId) {
    await db.execute(drizzleSql`DELETE FROM clinic_settings WHERE clinic_id = ${clinicId} AND key = ${key}`)
    return
  }
  await db.execute(drizzleSql`DELETE FROM business_settings WHERE key = ${key}`)
}

async function getMany(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const clinicId = currentClinicId()
  const rows = clinicId
    ? await db.select({ key: clinicSettings.key, value: clinicSettings.value })
      .from(clinicSettings)
      .where(and(eq(clinicSettings.clinicId, clinicId), inArray(clinicSettings.key, keys)))
    : await db.select({ key: businessSettings.key, value: businessSettings.value })
      .from(businessSettings)
      .where(inArray(businessSettings.key, keys))
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return map
}

// ── Calendar settings ───────────────────────────────────────────────────────
const CAL_REFRESH = 'calendar.refresh_token'
const CAL_EMAIL = 'calendar.email'
const CAL_ID = 'calendar.calendar_id'

export interface CalendarSettings {
  refreshToken?: string | null
  email?: string | null
  calendarId?: string | null
}

export async function getCalendarSettings(): Promise<CalendarSettings> {
  const map = await getMany([CAL_REFRESH, CAL_EMAIL, CAL_ID])
  return {
    refreshToken: map[CAL_REFRESH] ?? null,
    email: map[CAL_EMAIL] ?? null,
    calendarId: map[CAL_ID] ?? null,
  }
}

export async function setCalendarSettings(patch: CalendarSettings): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (patch.refreshToken !== undefined) {
    if (patch.refreshToken === null || patch.refreshToken === '') {
      updates.push(deleteSetting(CAL_REFRESH))
    } else {
      updates.push(setSetting(CAL_REFRESH, patch.refreshToken))
    }
  }
  if (patch.email !== undefined) {
    if (patch.email === null || patch.email === '') {
      updates.push(deleteSetting(CAL_EMAIL))
    } else {
      updates.push(setSetting(CAL_EMAIL, patch.email))
    }
  }
  if (patch.calendarId !== undefined) {
    if (patch.calendarId === null || patch.calendarId === '') {
      updates.push(deleteSetting(CAL_ID))
    } else {
      updates.push(setSetting(CAL_ID, patch.calendarId))
    }
  }
  await Promise.all(updates)
}

export async function disconnectCalendar(): Promise<void> {
  await Promise.all([
    deleteSetting(CAL_REFRESH),
    deleteSetting(CAL_EMAIL),
    deleteSetting(CAL_ID),
  ])
}

// ── AI model settings ───────────────────────────────────────────────────────
const AI_MODEL = 'ai.model'

export async function getAiModel(): Promise<string | null> {
  return getSetting(AI_MODEL)
}

export async function setAiModel(model: string): Promise<{ model: string; updatedAt: string }> {
  await setSetting(AI_MODEL, model)
  return { model, updatedAt: new Date().toISOString() }
}

// ── Greeting settings ───────────────────────────────────────────────────────
const AI_GREETING = 'ai.greeting'
const AI_GREETING_OUTBOUND = 'ai.greeting_outbound'

export async function getGreeting(direction: string = 'inbound', explicitClinicId?: string): Promise<string | null> {
  if (direction === 'outbound') {
    const val = (await getSetting(AI_GREETING_OUTBOUND, explicitClinicId)) || (await getSetting('greeting_message_outbound', explicitClinicId))
    return val || null
  }
  const val = (await getSetting(AI_GREETING, explicitClinicId)) || (await getSetting('greeting_message', explicitClinicId))
  return val || null
}

export async function setGreeting(text: string, direction: string = 'inbound'): Promise<{ greeting: string; updatedAt: string }> {
  const key = direction === 'outbound' ? AI_GREETING_OUTBOUND : AI_GREETING
  await setSetting(key, text)
  // Also sync with legacy key to be safe
  if (direction === 'outbound') {
    await setSetting('greeting_message_outbound', text).catch(() => {})
  } else {
    await setSetting('greeting_message', text).catch(() => {})
  }
  return { greeting: text, updatedAt: new Date().toISOString() }
}

// ── Outbound Caller ID settings ─────────────────────────────────────────────
const OUTBOUND_CALLER_ID = 'outbound_caller_id'

export async function getOutboundCallerId(): Promise<string> {
  return (await getSetting(OUTBOUND_CALLER_ID)) || '08503096119'
}

export async function setOutboundCallerId(callerId: string): Promise<{ callerId: string; updatedAt: string }> {
  await setSetting(OUTBOUND_CALLER_ID, callerId)
  return { callerId, updatedAt: new Date().toISOString() }
}

// ── Connection mode settings ────────────────────────────────────────────────
const CONNECTION_MODE = 'ai.connection_mode'

export type ConnectionMode = 'server' | 'direct'

export async function getConnectionMode(): Promise<ConnectionMode> {
  const val = await getSetting(CONNECTION_MODE)
  return val === 'direct' ? 'direct' : 'server'
}

export async function setConnectionMode(mode: ConnectionMode): Promise<{ mode: ConnectionMode; updatedAt: string }> {
  await setSetting(CONNECTION_MODE, mode)
  return { mode, updatedAt: new Date().toISOString() }
}

// ── Prompt section settings ─────────────────────────────────────────────────
const PROMPT_PREFIX = 'prompt.'

export interface PromptSectionRow {
  key: string
  value: string
  updatedAt: string | null
}

/** Get all prompt.* sections from DB */
export async function getAllPromptSections(): Promise<Record<string, PromptSectionRow>> {
  const result = await db.execute(drizzleSql`
    SELECT key, value, updated_at FROM business_settings WHERE key LIKE 'prompt.%'
  `)
  const rows = (result as unknown as { rows?: Array<{ key: string; value: string; updated_at: string | null }> }).rows
    ?? (result as unknown as Array<{ key: string; value: string; updated_at: string | null }>)
  const map: Record<string, PromptSectionRow> = {}
  for (const row of rows) {
    map[row.key] = { key: row.key, value: row.value, updatedAt: row.updated_at ?? null }
  }
  return map
}

/** Get a single prompt section from DB */
export async function getPromptSection(key: string): Promise<string | null> {
  if (!key.startsWith(PROMPT_PREFIX)) return null
  return getSetting(key)
}

/** Set a prompt section in DB */
export async function setPromptSection(key: string, value: string): Promise<void> {
  if (!key.startsWith(PROMPT_PREFIX)) throw new Error('Key must start with prompt.')
  await setSetting(key, value)
}

/** Delete a prompt section (revert to default) */
export async function resetPromptSection(key: string): Promise<void> {
  if (!key.startsWith(PROMPT_PREFIX)) throw new Error('Key must start with prompt.')
  await deleteSetting(key)
}

// ── Tool description settings ───────────────────────────────────────────────
const TOOLS_PREFIX = 'tools.'

/** Get all tools.* descriptions from DB */
export async function getToolDescriptions(): Promise<Record<string, string>> {
  const result = await db.execute(drizzleSql`
    SELECT key, value FROM business_settings WHERE key LIKE 'tools.%'
  `)
  const rows = (result as unknown as { rows?: Array<{ key: string; value: string }> }).rows
    ?? (result as unknown as Array<{ key: string; value: string }>)
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  return map
}

/** Set a tool description in DB */
export async function setToolDescription(key: string, value: string): Promise<void> {
  if (!key.startsWith(TOOLS_PREFIX)) throw new Error('Key must start with tools.')
  await setSetting(key, value)
}

/** Delete a tool description (revert to default) */
export async function resetToolDescription(key: string): Promise<void> {
  if (!key.startsWith(TOOLS_PREFIX)) throw new Error('Key must start with tools.')
  await deleteSetting(key)
}

// ── Branding settings ───────────────────────────────────────────────────────
export interface BrandingSettings {
  title: string
  subtitle: string
  logoUrl: string
}

const BRANDING_DEFAULTS: BrandingSettings = {
  title: 'Asistan',
  subtitle: 'Randevu · Bilgi',
  logoUrl: '',
}

export async function getBranding(): Promise<BrandingSettings> {
  const map = await getMany(['branding.title', 'branding.subtitle', 'branding.logo_url'])
  return {
    title: map['branding.title'] || BRANDING_DEFAULTS.title,
    subtitle: map['branding.subtitle'] || BRANDING_DEFAULTS.subtitle,
    logoUrl: map['branding.logo_url'] || BRANDING_DEFAULTS.logoUrl,
  }
}

export async function setBranding(patch: Partial<BrandingSettings>): Promise<BrandingSettings> {
  const updates: Array<Promise<void>> = []
  if (patch.title !== undefined) updates.push(setSetting('branding.title', patch.title))
  if (patch.subtitle !== undefined) updates.push(setSetting('branding.subtitle', patch.subtitle))
  if (patch.logoUrl !== undefined) updates.push(setSetting('branding.logo_url', patch.logoUrl))
  await Promise.all(updates)
  return getBranding()
}
