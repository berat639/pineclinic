/**
 * Google Calendar integration.
 * Credentials and calendar ID are read from the `business_settings` DB table.
 *
 * Supported auth methods (in priority order):
 *   1. OAuth2 refresh token  (key: `google_calendar_oauth_refresh_token`)
 *   2. Service account JSON  (key: `google_calendar_credentials`, base64-encoded)
 *
 * Calendar ID key: `google_calendar_id`
 *
 * If the keys are missing, all operations are no-ops.
 */

import { db } from '../db/client'
import { businessSettings } from '../db/schema'
import { sql } from 'drizzle-orm'

export type CalendarEventInput = {
  title: string          // e.g., "Servis Randevusu - Ahmet Yılmaz"
  description: string    // appointment details
  date: string           // YYYY-MM-DD
  time: string           // HH:MM
  durationMinutes?: number  // default 60
  attendeePhone?: string
}

export type CalendarEventResult =
  | { success: true; eventId: string; eventLink?: string }
  | { success: false; reason: string }

// ── Auth types ─────────────────────────────────────────────────────────────

type CalendarAuth =
  | { type: 'oauth2'; accessToken: string; calendarId: string }
  | { type: 'service_account'; credentials: { client_email: string; private_key: string }; calendarId: string }

// ── Auth helpers ───────────────────────────────────────────────────────────

async function getOAuthAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID veya GOOGLE_OAUTH_CLIENT_SECRET tanımlı değil')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token yenileme hatası: ${response.status}`)
  }

  const data = await response.json() as { access_token: string }
  return data.access_token
}

async function getCalendarAuth(): Promise<CalendarAuth | null> {
  const rows = await db
    .select()
    .from(businessSettings)
    .where(sql`key IN ('google_calendar_id', 'google_calendar_credentials', 'google_calendar_oauth_refresh_token')`)

  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

  const calendarId = map['google_calendar_id']
  if (!calendarId) return null

  // OAuth2 takes priority
  const refreshToken = map['google_calendar_oauth_refresh_token']
  if (refreshToken) {
    try {
      const accessToken = await getOAuthAccessToken(refreshToken)
      return { type: 'oauth2', accessToken, calendarId }
    } catch (err) {
      console.error('[Calendar] OAuth2 token yenileme hatası:', err)
      return null
    }
  }

  // Fall back to service account
  const credentialsB64 = map['google_calendar_credentials']
  if (!credentialsB64) return null

  try {
    const credentials = JSON.parse(
      Buffer.from(credentialsB64, 'base64').toString('utf-8')
    ) as { client_email: string; private_key: string }
    return { type: 'service_account', credentials, calendarId }
  } catch {
    return null
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if Google Calendar integration is configured.
 */
export async function isCalendarConfigured(): Promise<boolean> {
  const auth = await getCalendarAuth()
  return auth !== null
}

/**
 * Create a Google Calendar event for an appointment.
 * Returns a no-op result if integration is not configured.
 */
export async function createCalendarEvent(
  input: CalendarEventInput
): Promise<CalendarEventResult> {
  const auth = await getCalendarAuth()
  if (!auth) {
    return { success: false, reason: 'Google Calendar yapılandırılmamış' }
  }

  const { calendarId } = auth
  let accessToken: string

  if (auth.type === 'oauth2') {
    accessToken = auth.accessToken
  } else {
    accessToken = await getServiceAccountToken(auth.credentials, [
      'https://www.googleapis.com/auth/calendar.events',
    ])
  }

  try {
    // Build event datetime (assume Istanbul timezone UTC+3)
    const [year, month, day] = input.date.split('-').map(Number)
    const [hour, minute] = input.time.split(':').map(Number)
    const durationMs = (input.durationMinutes ?? 60) * 60 * 1000

    const startDateTime = new Date(
      Date.UTC(year!, month! - 1, day!, hour! - 3, minute!)
    )
    const endDateTime = new Date(startDateTime.getTime() + durationMs)

    const event = {
      summary: input.title,
      description: input.description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Istanbul',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Europe/Istanbul',
      },
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('[Calendar] API hatası:', err)
      return { success: false, reason: `API hatası: ${response.status}` }
    }

    const data = await response.json() as { id: string; htmlLink?: string }
    console.log('[Calendar] Etkinlik oluşturuldu:', data.id)
    return { success: true, eventId: data.id, eventLink: data.htmlLink }
  } catch (err) {
    console.error('[Calendar] Hata:', err)
    return { success: false, reason: 'Beklenmeyen hata' }
  }
}

// ── JWT / Service Account helpers ──────────────────────────────────────────

async function getServiceAccountToken(
  credentials: { client_email: string; private_key: string },
  scopes: string[]
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const payload = btoa(JSON.stringify({
    iss: credentials.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const signingInput = `${header}.${payload}`

  // Use Web Crypto API (available in Bun) to sign with RS256
  const privateKeyPem = credentials.private_key
  const privateKeyBuffer = pemToArrayBuffer(privateKeyPem)

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${signingInput}.${signatureB64}`

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error(`Token alınamadı: ${tokenResponse.status}`)
  }

  const tokenData = await tokenResponse.json() as { access_token: string }
  return tokenData.access_token
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const buffer = new ArrayBuffer(binary.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i)
  }
  return buffer
}
