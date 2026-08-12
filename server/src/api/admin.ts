import { Elysia, t } from 'elysia'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { checkRedisHealth } from '../db/redis'
import { checkDbHealth } from '../db/client'
import { accounts, accountUsage, businessSettings } from '../db/schema'
import { getQueueStats } from '../queue/session-queue'
import { indexDocument, indexDocumentDirect, deleteDocument, listDocuments, extractTextFromFile } from '../services/knowledge'

export const adminPlugin = new Elysia({ prefix: '/api/admin' })

  // Health check
  .get('/health', async () => {
    const [dbOk, redisOk] = await Promise.all([checkDbHealth(), checkRedisHealth()])
    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'error',
      redis: redisOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    }
  })

  // System stats
  .get('/stats', async () => {
    const [allAccounts, queueStats] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.isActive, true)),
      getQueueStats(),
    ])
    const today = new Date().toISOString().split('T')[0]!
    const usages = await db.select().from(accountUsage)
      .where(eq(accountUsage.date, today))

    const totalTokensToday = usages.reduce((sum, u) => sum + (u.totalTokens ?? 0), 0)
    const totalConcurrent = usages.reduce((sum, u) => sum + (u.concurrentSessions ?? 0), 0)

    return {
      accounts: { total: allAccounts.length, active: allAccounts.filter(a => a.isActive).length },
      tokens: { today: totalTokensToday },
      concurrent: { active: totalConcurrent },
      queue: queueStats,
    }
  })

  // List all accounts with today's usage
  .get('/accounts', async () => {
    const today = new Date().toISOString().split('T')[0]!
    const rows = await db.select({
      id: accounts.id,
      name: accounts.name,
      projectId: accounts.projectId,
      location: accounts.location,
      isActive: accounts.isActive,
      priority: accounts.priority,
      dailyTokenLimit: accounts.dailyTokenLimit,
      monthlyTokenLimit: accounts.monthlyTokenLimit,
      maxConcurrentSessions: accounts.maxConcurrentSessions,
      createdAt: accounts.createdAt,
      // DO NOT return credentials
    }).from(accounts).orderBy(desc(accounts.priority))

    // Attach today's usage
    const usages = await db.select().from(accountUsage)
      .where(eq(accountUsage.date, today))
    const usageMap = new Map(usages.map(u => [u.accountId, u]))

    return rows.map(account => ({
      ...account,
      usage: usageMap.get(account.id) ?? {
        promptTokens: 0, responseTokens: 0, totalTokens: 0,
        sessionCount: 0, concurrentSessions: 0,
      },
    }))
  })

  // Get single account (no credentials)
  .get('/accounts/:id', async ({ params }) => {
    const [account] = await db.select({
      id: accounts.id,
      name: accounts.name,
      projectId: accounts.projectId,
      location: accounts.location,
      isActive: accounts.isActive,
      priority: accounts.priority,
      dailyTokenLimit: accounts.dailyTokenLimit,
      monthlyTokenLimit: accounts.monthlyTokenLimit,
      maxConcurrentSessions: accounts.maxConcurrentSessions,
      createdAt: accounts.createdAt,
    }).from(accounts).where(eq(accounts.id, params.id))

    if (!account) return new Response('Not found', { status: 404 })
    return account
  })

  // Create account
  .post('/accounts', async ({ body }) => {
    const [account] = await db.insert(accounts).values({
      name: body.name,
      credentials: body.credentials,
      projectId: body.projectId,
      location: body.location ?? 'europe-west1',
      priority: body.priority ?? 0,
      dailyTokenLimit: body.dailyTokenLimit ?? 1000000,
      monthlyTokenLimit: body.monthlyTokenLimit ?? 30000000,
      maxConcurrentSessions: body.maxConcurrentSessions ?? 5,
    }).returning({
      id: accounts.id, name: accounts.name, projectId: accounts.projectId,
      location: accounts.location, isActive: accounts.isActive,
    })
    return account
  }, {
    body: t.Object({
      name: t.String(),
      credentials: t.String(),        // base64 encoded service account JSON
      projectId: t.String(),
      location: t.Optional(t.String()),
      priority: t.Optional(t.Number()),
      dailyTokenLimit: t.Optional(t.Number()),
      monthlyTokenLimit: t.Optional(t.Number()),
      maxConcurrentSessions: t.Optional(t.Number()),
    })
  })

  // Update account
  .put('/accounts/:id', async ({ params, body }) => {
    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.credentials !== undefined) updateData.credentials = body.credentials
    if (body.projectId !== undefined) updateData.projectId = body.projectId
    if (body.location !== undefined) updateData.location = body.location
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.dailyTokenLimit !== undefined) updateData.dailyTokenLimit = body.dailyTokenLimit
    if (body.monthlyTokenLimit !== undefined) updateData.monthlyTokenLimit = body.monthlyTokenLimit
    if (body.maxConcurrentSessions !== undefined) updateData.maxConcurrentSessions = body.maxConcurrentSessions

    const [updated] = await db.update(accounts)
      .set(updateData as any)
      .where(eq(accounts.id, params.id))
      .returning({ id: accounts.id, name: accounts.name, isActive: accounts.isActive })

    if (!updated) return new Response('Not found', { status: 404 })
    return updated
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      credentials: t.Optional(t.String()),
      projectId: t.Optional(t.String()),
      location: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean()),
      priority: t.Optional(t.Number()),
      dailyTokenLimit: t.Optional(t.Number()),
      monthlyTokenLimit: t.Optional(t.Number()),
      maxConcurrentSessions: t.Optional(t.Number()),
    })
  })

  // Delete account (soft delete — sets is_active = false)
  .delete('/accounts/:id', async ({ params }) => {
    const [updated] = await db.update(accounts)
      .set({ isActive: false })
      .where(eq(accounts.id, params.id))
      .returning({ id: accounts.id })

    if (!updated) return new Response('Not found', { status: 404 })
    return { success: true }
  })

  // Get account usage history (last 30 days)
  .get('/accounts/:id/usage', async ({ params }) => {
    const rows = await db.select().from(accountUsage)
      .where(eq(accountUsage.accountId, params.id))
      .orderBy(desc(accountUsage.date))
      .limit(30)
    return rows
  })

  // Get calendar settings (never returns credentials value)
  .get('/settings/calendar', async () => {
    const rows = await db.select().from(businessSettings)
      .where(sql`key IN ('google_calendar_id', 'google_calendar_credentials')`)

    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    return {
      calendarId: map['google_calendar_id'] ?? null,
      hasCredentials: !!map['google_calendar_credentials'],
      updatedAt: rows.find(r => r.key === 'google_calendar_credentials')?.updatedAt ?? null,
    }
  })

  // Upsert calendar settings
  .put('/settings/calendar', async ({ body }) => {
    const { calendarId, credentialsJson } = body as { calendarId: string; credentialsJson?: string }

    await db.insert(businessSettings).values({ key: 'google_calendar_id', value: calendarId })
      .onConflictDoUpdate({ target: businessSettings.key, set: { value: calendarId, updatedAt: sql`now()` } })

    if (credentialsJson) {
      await db.insert(businessSettings).values({ key: 'google_calendar_credentials', value: credentialsJson })
        .onConflictDoUpdate({ target: businessSettings.key, set: { value: credentialsJson, updatedAt: sql`now()` } })
    }

    return { success: true }
  }, {
    body: t.Object({
      calendarId: t.String(),
      credentialsJson: t.Optional(t.String()),
    })
  })

  // Delete calendar settings
  .delete('/settings/calendar', async () => {
    await db.delete(businessSettings)
      .where(sql`key IN ('google_calendar_id', 'google_calendar_credentials')`)
    return { success: true }
  })

  // OAuth2: Return authorization URL
  .get('/settings/calendar/auth', () => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001'

    if (!clientId) {
      return { error: 'GOOGLE_OAUTH_CLIENT_ID tanımlı değil' }
    }

    const redirectUri = `${appUrl}/api/admin/settings/calendar/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'email',
        'profile',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    })

    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }
  })

  // OAuth2: Exchange code for tokens, store, redirect
  .get('/settings/calendar/callback', async ({ query, redirect }) => {
    const { code } = query as { code?: string; error?: string }
    const clientAppUrl = process.env.CLIENT_APP_URL ?? 'http://localhost:3000'
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001'

    if (!code) {
      return redirect(`${clientAppUrl}/admin?calendar=error&reason=no_code`)
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!
    const redirectUri = `${appUrl}/api/admin/settings/calendar/callback`

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      return redirect(`${clientAppUrl}/admin?calendar=error&reason=token_exchange`)
    }

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token?: string
    }

    if (!tokens.refresh_token) {
      return redirect(`${clientAppUrl}/admin?calendar=error&reason=no_refresh_token`)
    }

    // Get user email from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userResponse.json() as { email?: string }

    // Store refresh token and email
    await db.insert(businessSettings)
      .values({ key: 'google_calendar_oauth_refresh_token', value: tokens.refresh_token })
      .onConflictDoUpdate({
        target: businessSettings.key,
        set: { value: tokens.refresh_token, updatedAt: sql`now()` },
      })

    if (userInfo.email) {
      await db.insert(businessSettings)
        .values({ key: 'google_calendar_oauth_email', value: userInfo.email })
        .onConflictDoUpdate({
          target: businessSettings.key,
          set: { value: userInfo.email, updatedAt: sql`now()` },
        })
    }

    return redirect(`${clientAppUrl}/admin?calendar=connected`)
  })

  // OAuth2: Full connection status
  .get('/settings/calendar/status', async () => {
    const rows = await db.select().from(businessSettings)
      .where(sql`key IN ('google_calendar_id', 'google_calendar_oauth_refresh_token', 'google_calendar_oauth_email', 'google_calendar_credentials')`)

    const map = Object.fromEntries(rows.map(r => [r.key, r.value]))

    return {
      connected: !!(map['google_calendar_oauth_refresh_token'] || map['google_calendar_credentials']),
      authType: map['google_calendar_oauth_refresh_token'] ? 'oauth2' : map['google_calendar_credentials'] ? 'service_account' : null,
      email: map['google_calendar_oauth_email'] ?? null,
      calendarId: map['google_calendar_id'] ?? null,
      hasRefreshToken: !!map['google_calendar_oauth_refresh_token'],
    }
  })

  // OAuth2: List calendars for the connected account
  .get('/settings/calendar/calendars', async () => {
    const rows = await db.select().from(businessSettings)
      .where(sql`key = 'google_calendar_oauth_refresh_token'`)

    const refreshToken = rows[0]?.value
    if (!refreshToken) return { error: 'OAuth2 ile bağlı değil' }

    // Get fresh access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      }),
    })

    if (!tokenResponse.ok) return { error: 'Token yenilenemedi' }
    const { access_token } = await tokenResponse.json() as { access_token: string }

    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    if (!calendarResponse.ok) return { error: 'Takvim listesi alınamadı' }
    const data = await calendarResponse.json() as { items: { id: string; summary: string; primary?: boolean }[] }

    return {
      calendars: data.items.map(c => ({
        id: c.id,
        name: c.summary,
        isPrimary: c.primary ?? false,
      }))
    }
  })

  // OAuth2: Remove OAuth2 tokens only
  .delete('/settings/calendar/disconnect', async () => {
    await db.delete(businessSettings)
      .where(sql`key IN ('google_calendar_oauth_refresh_token', 'google_calendar_oauth_email')`)
    return { success: true }
  })

  // ── Integrations ───────────────────────────────────────────────────────────
  .get('/integrations', async () => {
    const { getIntegrations } = await import('../db/repositories/integrations')
    return await getIntegrations()
  })

  .put('/integrations', async ({ body }) => {
    const { updateIntegrations } = await import('../db/repositories/integrations')
    await updateIntegrations(body as any)
    return { success: true }
  }, {
    body: t.Object({
      voipProvider: t.Optional(t.Union([t.String(), t.Null()])),
      voipLabel: t.Optional(t.Union([t.String(), t.Null()])),
      voipBaseUrl: t.Optional(t.Union([t.String(), t.Null()])),
      voipTrunkHost: t.Optional(t.Union([t.String(), t.Null()])),
      smtpHost: t.Optional(t.Union([t.String(), t.Null()])),
      smtpPort: t.Optional(t.Union([t.String(), t.Null()])),
      smtpUser: t.Optional(t.Union([t.String(), t.Null()])),
      smtpPass: t.Optional(t.Union([t.String(), t.Null()])),
      smsUsercode: t.Optional(t.Union([t.String(), t.Null()])),
      smsPassword: t.Optional(t.Union([t.String(), t.Null()])),
      smsSenderId: t.Optional(t.Union([t.String(), t.Null()])),
    })
  })

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  .get('/knowledge', async () => {
    return listDocuments()
  })

  .post('/knowledge/upload', async ({ body }) => {
    const { name, text, file } = body as { name?: string; text?: string; file?: File }

    let content: string
    let fileName: string
    let fileType: string

    if (file && file.size > 0) {
      fileName = name || file.name
      fileType = file.type || 'text/plain'

      const TEXT_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json']
      if (TEXT_TYPES.some(t => fileType.startsWith(t))) {
        content = await file.text()
      } else {
        const buffer = await file.arrayBuffer()
        try {
          content = await extractTextFromFile(buffer, fileType, fileName)
          // If extracted text is too short, fall back to direct binary embedding
          if (content.trim().length < 50) throw new Error('yetersiz metin')
        } catch {
          console.log(`[Admin] "${fileName}" metin çıkartılamadı — direkt binary embedding`)
          const id = await indexDocumentDirect(fileName, fileType, buffer)
          return { id, name: fileName, message: 'Döküman direkt indexlendi' }
        }
      }
    } else if (text?.trim()) {
      fileName = name || 'Manuel Giriş'
      fileType = 'text/plain'
      content = text.trim()
    } else {
      return new Response(JSON.stringify({ error: 'Dosya veya metin gerekli' }), { status: 400 })
    }

    if (content.length < 10) {
      return new Response(JSON.stringify({ error: 'İçerik çok kısa' }), { status: 400 })
    }

    const id = await indexDocument(fileName, fileType, content)
    return { id, name: fileName, message: 'Döküman indexlendi' }
  })

  .delete('/knowledge/:id', async ({ params }) => {
    await deleteDocument(params.id)
    return { success: true }
  })
