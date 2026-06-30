import { sql as drizzleSql, inArray } from 'drizzle-orm'
import { db } from '../client'
import { businessSettings } from '../schema'

export async function getSetting(key: string): Promise<string | null> {
  const result = await db.execute(drizzleSql`
    SELECT value FROM business_settings WHERE key = ${key} LIMIT 1
  `)
  const rows = ((result as unknown as { rows?: Array<{ value: string }> }).rows
    ?? (result as unknown as Array<{ value: string }>))
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(drizzleSql`
    INSERT INTO business_settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
}

export async function deleteSetting(key: string): Promise<void> {
  await db.execute(drizzleSql`DELETE FROM business_settings WHERE key = ${key}`)
}

async function getMany(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const rows = await db
    .select({ key: businessSettings.key, value: businessSettings.value })
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

export async function getGreeting(): Promise<string | null> {
  return getSetting(AI_GREETING)
}

export async function setGreeting(text: string): Promise<{ greeting: string; updatedAt: string }> {
  await setSetting(AI_GREETING, text)
  return { greeting: text, updatedAt: new Date().toISOString() }
}
