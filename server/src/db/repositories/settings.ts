import { and, eq, sql as drizzleSql, inArray } from 'drizzle-orm'
import { db } from '../client'
import { clinicSettings } from '../schema'
import { requireClinicId } from '../../tenancy/context'

function settingClinicId(explicitClinicId?: string): string {
  return explicitClinicId ?? requireClinicId()
}

export async function getSetting(key: string, explicitClinicId?: string): Promise<string | null> {
  const clinicId = settingClinicId(explicitClinicId)
  const rows = await db.select({ value: clinicSettings.value }).from(clinicSettings)
    .where(drizzleSql`${clinicSettings.clinicId} = ${clinicId} AND ${clinicSettings.key} = ${key}`)
    .limit(1)
  return rows[0]?.value ?? null
}

export async function setSetting(key: string, value: string, explicitClinicId?: string): Promise<void> {
  const clinicId = settingClinicId(explicitClinicId)
  await db.insert(clinicSettings).values({ clinicId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [clinicSettings.clinicId, clinicSettings.key],
      set: { value, updatedAt: new Date() },
    })
}

export async function deleteSetting(key: string, explicitClinicId?: string): Promise<void> {
  const clinicId = settingClinicId(explicitClinicId)
  await db.execute(drizzleSql`DELETE FROM clinic_settings WHERE clinic_id = ${clinicId} AND key = ${key}`)
}

async function getMany(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {}
  const clinicId = requireClinicId()
  const rows = await db.select({ key: clinicSettings.key, value: clinicSettings.value })
    .from(clinicSettings)
    .where(and(eq(clinicSettings.clinicId, clinicId), inArray(clinicSettings.key, keys)))
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
  const clinicId = requireClinicId()
  const result = await db.execute(drizzleSql`
    SELECT key, value, updated_at
    FROM clinic_settings
    WHERE clinic_id = ${clinicId} AND key LIKE 'prompt.%'
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
  const clinicId = requireClinicId()
  const result = await db.execute(drizzleSql`
    SELECT key, value
    FROM clinic_settings
    WHERE clinic_id = ${clinicId} AND key LIKE 'tools.%'
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

// ── Notification Policy & Channel Priority settings ─────────────────────────
export type NotificationChannelKey = 'whatsapp' | 'sms' | 'email' | 'assistant_call'

export const ALL_NOTIFICATION_CHANNELS: readonly NotificationChannelKey[] = [
  'whatsapp',
  'sms',
  'email',
  'assistant_call',
] as const

export interface NotificationPolicy {
  channelPriority: NotificationChannelKey[]
  enabledChannels: Record<NotificationChannelKey, boolean>
  instantAppointmentNotify: boolean
  instantDebounceMinutes: number
  reminderLeadHours: number
  confirmationWaitHours: number
  recallWaitHours: number
  quietHoursEnabled: boolean
  quietHoursStart: string
  quietHoursEnd: string
}

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  channelPriority: ['whatsapp', 'sms', 'email', 'assistant_call'],
  enabledChannels: {
    whatsapp: true,
    sms: true,
    email: true,
    assistant_call: true,
  },
  instantAppointmentNotify: true,
  instantDebounceMinutes: 2,
  reminderLeadHours: 24,
  confirmationWaitHours: 4,
  recallWaitHours: 48,
  quietHoursEnabled: true,
  quietHoursStart: '21:00',
  quietHoursEnd: '09:00',
}

const NOTIFICATION_POLICY_KEY = 'notification.policy'

function normalizeNotificationPolicy(raw: Partial<NotificationPolicy> | null | undefined): NotificationPolicy {
  const seen = new Set<NotificationChannelKey>()
  const priority: NotificationChannelKey[] = []
  if (Array.isArray(raw?.channelPriority)) {
    for (const rawCh of raw.channelPriority) {
      const ch = (rawCh as string) === 'call' ? 'assistant_call' : rawCh
      if ((ALL_NOTIFICATION_CHANNELS as readonly string[]).includes(ch) && !seen.has(ch as NotificationChannelKey)) {
        seen.add(ch as NotificationChannelKey)
        priority.push(ch as NotificationChannelKey)
      }
    }
  }
  for (const ch of ALL_NOTIFICATION_CHANNELS) {
    if (!seen.has(ch)) priority.push(ch)
  }

  const rawEnabled = (raw?.enabledChannels || {}) as Record<string, boolean | undefined>
  const enabled: Record<NotificationChannelKey, boolean> = {
    whatsapp: rawEnabled.whatsapp ?? DEFAULT_NOTIFICATION_POLICY.enabledChannels.whatsapp,
    sms: rawEnabled.sms ?? DEFAULT_NOTIFICATION_POLICY.enabledChannels.sms,
    email: rawEnabled.email ?? DEFAULT_NOTIFICATION_POLICY.enabledChannels.email,
    assistant_call: rawEnabled.assistant_call ?? rawEnabled.call ?? DEFAULT_NOTIFICATION_POLICY.enabledChannels.assistant_call,
  }

  const clampInt = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val)
    if (!Number.isFinite(n)) return fallback
    return Math.max(min, Math.min(max, Math.round(n)))
  }

  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  return {
    channelPriority: priority,
    enabledChannels: enabled,
    instantAppointmentNotify: typeof raw?.instantAppointmentNotify === 'boolean' ? raw.instantAppointmentNotify : DEFAULT_NOTIFICATION_POLICY.instantAppointmentNotify,
    instantDebounceMinutes: clampInt(raw?.instantDebounceMinutes, DEFAULT_NOTIFICATION_POLICY.instantDebounceMinutes, 0, 30),
    reminderLeadHours: clampInt(raw?.reminderLeadHours, DEFAULT_NOTIFICATION_POLICY.reminderLeadHours, 1, 168),
    confirmationWaitHours: clampInt(raw?.confirmationWaitHours, DEFAULT_NOTIFICATION_POLICY.confirmationWaitHours, 1, 72),
    recallWaitHours: clampInt(raw?.recallWaitHours, DEFAULT_NOTIFICATION_POLICY.recallWaitHours, 1, 168),
    quietHoursEnabled: typeof raw?.quietHoursEnabled === 'boolean' ? raw.quietHoursEnabled : DEFAULT_NOTIFICATION_POLICY.quietHoursEnabled,
    quietHoursStart: typeof raw?.quietHoursStart === 'string' && timePattern.test(raw.quietHoursStart) ? raw.quietHoursStart : DEFAULT_NOTIFICATION_POLICY.quietHoursStart,
    quietHoursEnd: typeof raw?.quietHoursEnd === 'string' && timePattern.test(raw.quietHoursEnd) ? raw.quietHoursEnd : DEFAULT_NOTIFICATION_POLICY.quietHoursEnd,
  }
}

export async function getNotificationPolicy(explicitClinicId?: string): Promise<NotificationPolicy> {
  try {
    const raw = await getSetting(NOTIFICATION_POLICY_KEY, explicitClinicId)
    if (!raw) return { ...DEFAULT_NOTIFICATION_POLICY, channelPriority: [...DEFAULT_NOTIFICATION_POLICY.channelPriority], enabledChannels: { ...DEFAULT_NOTIFICATION_POLICY.enabledChannels } }
    return normalizeNotificationPolicy(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_NOTIFICATION_POLICY, channelPriority: [...DEFAULT_NOTIFICATION_POLICY.channelPriority], enabledChannels: { ...DEFAULT_NOTIFICATION_POLICY.enabledChannels } }
  }
}

export async function setNotificationPolicy(patch: Partial<NotificationPolicy>, explicitClinicId?: string): Promise<NotificationPolicy> {
  const current = await getNotificationPolicy(explicitClinicId)
  const merged = normalizeNotificationPolicy({
    ...current,
    ...patch,
    enabledChannels: {
      ...current.enabledChannels,
      ...(patch.enabledChannels || {}),
    },
  })
  await setSetting(NOTIFICATION_POLICY_KEY, JSON.stringify(merged), explicitClinicId)
  return merged
}

// ── Clinic General Working Hours (Genel Mesai Saatleri) ─────────────────────
export interface ClinicWorkingHours {
  startTime: string // e.g. "08:00"
  endTime: string   // e.g. "20:00" or "02:00" (gece 02:00) or "24:00"
  isOvernight: boolean
  slotStartHour: number // e.g. 8
  slotEndHour: number   // e.g. 20, or 26 when endTime is "02:00" overnight
  workingDays: number[] // 0=Pzt .. 6=Paz
}

export const DEFAULT_CLINIC_WORKING_HOURS: ClinicWorkingHours = {
  startTime: '08:00',
  endTime: '20:00',
  isOvernight: false,
  slotStartHour: 8,
  slotEndHour: 20,
  workingDays: [0, 1, 2, 3, 4, 5],
}

const CLINIC_WORKING_HOURS_KEY = 'clinic.working_hours'

function normalizeClinicWorkingHours(raw: Partial<ClinicWorkingHours> | null | undefined): ClinicWorkingHours {
  const timePattern = /^([01]\d|2[0-4]):[0-5]\d$/
  const startTime = typeof raw?.startTime === 'string' && timePattern.test(raw.startTime) && raw.startTime !== '24:00'
    ? raw.startTime
    : DEFAULT_CLINIC_WORKING_HOURS.startTime
  const endTime = typeof raw?.endTime === 'string' && timePattern.test(raw.endTime)
    ? raw.endTime
    : DEFAULT_CLINIC_WORKING_HOURS.endTime

  const rawDays = Array.isArray(raw?.workingDays)
    ? raw.workingDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : null
  const workingDays = rawDays && rawDays.length > 0
    ? Array.from(new Set(rawDays)).sort((a, b) => a - b)
    : [...DEFAULT_CLINIC_WORKING_HOURS.workingDays]

  const startH = parseInt(startTime.slice(0, 2), 10) || 0
  const endH = parseInt(endTime.slice(0, 2), 10) || 0
  const endM = parseInt(endTime.slice(3, 5), 10) || 0
  const endCeilH = endM > 0 ? endH + 1 : endH

  const slotStartHour = Math.max(0, Math.min(23, startH))
  let slotEndHour = 20
  let isOvernight = false

  if (endTime === '24:00' || endTime === '00:00') {
    slotEndHour = 24
    isOvernight = false
  } else if (endH <= startH) {
    // Overnight working hours (e.g. Sabah 08:00 -> Gece 02:00)
    isOvernight = true
    slotEndHour = Math.min(32, 24 + Math.max(1, endCeilH))
  } else {
    isOvernight = false
    slotEndHour = Math.max(slotStartHour + 1, Math.min(24, endCeilH))
  }

  return {
    startTime,
    endTime,
    isOvernight,
    slotStartHour,
    slotEndHour,
    workingDays,
  }
}

export async function getClinicWorkingHours(explicitClinicId?: string): Promise<ClinicWorkingHours> {
  try {
    const raw = await getSetting(CLINIC_WORKING_HOURS_KEY, explicitClinicId)
    if (!raw) return { ...DEFAULT_CLINIC_WORKING_HOURS }
    return normalizeClinicWorkingHours(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CLINIC_WORKING_HOURS }
  }
}

export async function setClinicWorkingHours(patch: Partial<ClinicWorkingHours>, explicitClinicId?: string): Promise<ClinicWorkingHours> {
  const current = await getClinicWorkingHours(explicitClinicId)
  const merged = normalizeClinicWorkingHours({
    ...current,
    ...patch,
  })
  await setSetting(CLINIC_WORKING_HOURS_KEY, JSON.stringify(merged), explicitClinicId)
  return merged
}
