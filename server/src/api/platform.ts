import { Elysia, t } from 'elysia'
import { authenticateRequest } from '../middleware/auth'
import {
  ClinicProvisioningError,
  assignPlatformClinicSeedAdmin,
  createPlatformClinic,
  listPlatformClinicAdmins,
  listPlatformClinics,
  setPlatformClinicActive,
  setPlatformClinicAdminActive,
} from '../db/repositories/platform-clinics'
import { createStaffInvitation, revokeStaffInvitation } from '../services/staff-invitations'
import { hasMatchingRequestOrigin, isPlatformAdminRequest } from '../platform/access'
import { activateWhatsApp, clearWhatsAppSetup, configureWhatsAppSetup, prepareWhatsAppQr, publicWhatsAppConfig, refreshWhatsAppConnection } from '../db/repositories/whatsapp'
import { credentialsFor } from '../db/repositories/whatsapp'
import { requestEvolutionQr } from '../integrations/whatsapp'
import {
  deleteClinicGeminiKey,
  resolveClinicGeminiKeyInfo,
  setClinicGeminiKey,
  testClinicGeminiKey,
} from '../services/gemini-client'
import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { auditLog } from '../db/schema'
import {
  PROMPT_GROUPS,
  PROMPT_SECTIONS,
  PROMPT_SECTION_KEYS,
  PROMPT_SECTION_MAP,
  PROMPT_VARIABLES,
  humanizePromptDescription,
} from '../data/default-prompts'
import { ensurePlatformPromptTable, getEffectivePromptSections, invalidatePlatformPromptCache, renderPromptTemplate } from '../prompts/registry'

const promptKeyParams = t.Object({ key: t.String({ minLength: 8, maxLength: 80 }) })

function requestIp(request: Request): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}

async function writePromptAudit(userId: string, action: string, key: string, request: Request, extra: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({
    userId,
    action,
    targetType: 'platform_prompt',
    targetId: null,
    metadata: { key, ...extra },
    ipAddress: requestIp(request),
  } as typeof auditLog.$inferInsert).catch(() => {})
}

const clinicParams = t.Object({ clinicId: t.String({ format: 'uuid' }) })

async function requirePlatformAdmin(cookie: any, request: Request, set: any) {
  if (!isPlatformAdminRequest(request)) {
    set.status = 404
    return null
  }
  const user = await authenticateRequest(cookie.token?.value, request)
  if (!user) { set.status = 401; return null }
  if (!user.isPlatformAdmin) { set.status = 403; return null }
  return user
}

export const platformPlugin = new Elysia({ prefix: '/api/platform' })
  .get('/clinics/:clinicId/whatsapp', async ({ params, cookie, request, set }) => {
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try { return await refreshWhatsAppConnection(params.clinicId) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'WhatsApp durumu alınamadı.' } }
  }, { params: clinicParams })
  .put('/clinics/:clinicId/whatsapp', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try { return await configureWhatsAppSetup(params.clinicId, body) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'WhatsApp kurulumu kaydedilemedi.' } }
  }, { params: clinicParams, body: t.Object({ expectedPhone: t.String({ minLength: 8, maxLength: 32 }) }) })
  .delete('/clinics/:clinicId/whatsapp', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try { return await clearWhatsAppSetup(params.clinicId) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'WhatsApp numarası kaldırılamadı.' } }
  }, { params: clinicParams })
  .post('/clinics/:clinicId/whatsapp/connect', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      const clinic = await prepareWhatsAppQr(params.clinicId)
      const qr = await requestEvolutionQr(credentialsFor(clinic))
      const current = qr.connectionState === 'open' ? await refreshWhatsAppConnection(clinic.id) : publicWhatsAppConfig(clinic)
      return { clinic: current, qrcode: qr.qrcode, connectionState: qr.connectionState }
    } catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'QR kodu hazırlanamadı.' } }
  }, { params: clinicParams })
  .post('/clinics/:clinicId/whatsapp/activate', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try { return await activateWhatsApp(params.clinicId, user.id) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'WhatsApp etkinleştirilemedi.' } }
  }, { params: clinicParams })
  .get('/clinics/:clinicId/gemini-key', async ({ params, cookie, request, set }) => {
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      return await resolveClinicGeminiKeyInfo(params.clinicId)
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'API anahtarı durumu alınamadı.' }
    }
  }, { params: clinicParams })
  .put('/clinics/:clinicId/gemini-key', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      return await setClinicGeminiKey(params.clinicId, body.apiKey, user.id, ip)
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'API anahtarı kaydedilemedi.' }
    }
  }, { params: clinicParams, body: t.Object({ apiKey: t.String({ minLength: 10, maxLength: 256 }) }) })
  .delete('/clinics/:clinicId/gemini-key', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
      return await deleteClinicGeminiKey(params.clinicId, user.id, ip)
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'API anahtarı kaldırılamadı.' }
    }
  }, { params: clinicParams })
  .post('/clinics/:clinicId/gemini-key/test', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      return await testClinicGeminiKey(params.clinicId, body?.apiKey)
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'API anahtarı testi başarısız.' }
    }
  }, { params: clinicParams, body: t.Optional(t.Object({ apiKey: t.Optional(t.String({ maxLength: 256 })) })) })
  .get('/clinics', async ({ cookie, request, set }) => {
    if (!isPlatformAdminRequest(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await authenticateRequest(cookie.token?.value as string | undefined, request)
    if (!user) {
      set.status = 401
      return { error: 'Oturum geçersiz' }
    }
    if (!user.isPlatformAdmin) {
      set.status = 403
      return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    }
    return listPlatformClinics()
  })
  .post('/clinics', async ({ body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await authenticateRequest(cookie.token?.value as string | undefined, request)
    if (!user) {
      set.status = 401
      return { error: 'Oturum geçersiz' }
    }
    if (!user.isPlatformAdmin) {
      set.status = 403
      return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    }

    try {
      return await createPlatformClinic(body, user.id)
    } catch (error) {
      if (error instanceof ClinicProvisioningError) {
        set.status = error.status
        return { error: error.message }
      }
      console.error('[Platform] Klinik oluşturulamadı:', error)
      set.status = 500
      return { error: 'Klinik oluşturulamadı.' }
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 120 }),
      hostname: t.String({ minLength: 3, maxLength: 253 }),
      timezone: t.Optional(t.String({ minLength: 3, maxLength: 80 })),
    }),
  })
  .put('/clinics/:clinicId/status', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      return await setPlatformClinicActive(params.clinicId, Boolean(body.isActive), user.id)
    } catch (error) {
      if (error instanceof ClinicProvisioningError) {
        set.status = error.status
        return { error: error.message }
      }
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Klinik durumu güncellenemedi.' }
    }
  }, {
    params: clinicParams,
    body: t.Object({ isActive: t.Boolean() }),
  })
  .get('/clinics/:clinicId/admins', async ({ params, cookie, request, set }) => {
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      return await listPlatformClinicAdmins(params.clinicId)
    } catch (error) {
      if (error instanceof ClinicProvisioningError) {
        set.status = error.status
        return { error: error.message }
      }
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Klinik yöneticileri alınamadı.' }
    }
  }, { params: clinicParams })
  .post('/clinics/:clinicId/admins/seed', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      const admin = await assignPlatformClinicSeedAdmin(params.clinicId, body, user.id)
      return { ok: true, admin }
    } catch (error) {
      if (error instanceof ClinicProvisioningError) {
        set.status = error.status
        return { error: error.message }
      }
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Seed yönetici atanamadı.' }
    }
  }, {
    params: clinicParams,
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 120 }),
      email: t.String({ minLength: 4, maxLength: 160 }),
      password: t.String({ minLength: 6, maxLength: 128 }),
      phone: t.Optional(t.String({ maxLength: 40 })),
    }),
  })
  .post('/clinics/:clinicId/admins/invite', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      const info = await listPlatformClinicAdmins(params.clinicId)
      const requestHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
      const hostname = info.primaryHostname && !requestHost.startsWith('localhost')
        ? info.primaryHostname
        : requestHost
      const invitation = await createStaffInvitation({
        clinicId: params.clinicId,
        invitedBy: user.id,
        name: body.name,
        email: body.email,
        role: 'yonetici',
        hostname,
      })
      return { ok: true, invitation }
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Yönetici daveti gönderilemedi.' }
    }
  }, {
    params: clinicParams,
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 120 }),
      email: t.String({ minLength: 4, maxLength: 160 }),
    }),
  })
  .delete('/clinics/:clinicId/admins/invitations/:invitationId', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      const ok = await revokeStaffInvitation(params.clinicId, params.invitationId)
      if (!ok) {
        set.status = 404
        return { error: 'Davet bulunamadı.' }
      }
      return { ok: true }
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Davet iptal edilemedi.' }
    }
  }, {
    params: t.Object({
      clinicId: t.String({ format: 'uuid' }),
      invitationId: t.String({ format: 'uuid' }),
    }),
  })
  .put('/clinics/:clinicId/admins/:userId/status', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) {
      set.status = 404
      return { error: 'Sayfa bulunamadı.' }
    }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca satış / platform yöneticisine açıktır.' }

    try {
      return await setPlatformClinicAdminActive(params.clinicId, params.userId, Boolean(body.active), user.id)
    } catch (error) {
      if (error instanceof ClinicProvisioningError) {
        set.status = error.status
        return { error: error.message }
      }
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Yönetici durumu güncellenemedi.' }
    }
  }, {
    params: t.Object({
      clinicId: t.String({ format: 'uuid' }),
      userId: t.String({ format: 'uuid' }),
    }),
    body: t.Object({ active: t.Boolean() }),
  })
  .get('/system-prompts', async ({ cookie, request, set }) => {
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    await ensurePlatformPromptTable()
    const effective = await getEffectivePromptSections()
    const rows = await db.execute<{ key: string; updated_at: string | null }>(
      sql`SELECT key, updated_at FROM platform_settings WHERE key LIKE 'prompt.%'`,
    )
    const updated = new Map(rows.map(r => [r.key, r.updated_at]))
    const sectionFor = (key: string) => {
      const sec = PROMPT_SECTION_MAP.get(key)!
      return {
        key,
        label: sec.label,
        description: humanizePromptDescription(sec.description),
        value: effective[key],
        defaultValue: sec.defaultValue,
        isCustom: updated.has(key),
        updatedAt: updated.get(key) ?? null,
        variables: PROMPT_VARIABLES[key] ?? [],
      }
    }
    const grouped = new Set<string>()
    const groups = PROMPT_GROUPS.map(g => ({
      id: g.id,
      label: g.label,
      items: g.keys.filter(k => PROMPT_SECTION_MAP.has(k)).map(k => { grouped.add(k); return sectionFor(k) }),
    }))
    const rest = PROMPT_SECTIONS.filter(sec => !grouped.has(sec.key)).map(sec => sectionFor(sec.key))
    if (rest.length) groups.push({ id: 'other', label: 'Diğer', items: rest })
    return { groups: groups.filter(g => g.items.length > 0) }
  })
  .put('/system-prompts/:key', async ({ params, body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    if (!PROMPT_SECTION_MAP.has(params.key)) { set.status = 404; return { error: 'Talimat bulunamadı.' } }
    const value = body.value.trim()
    if (value.length < 5) { set.status = 400; return { error: 'Talimat en az 5 karakter olmalıdır.' } }
    await ensurePlatformPromptTable()
    await db.execute(sql`
      INSERT INTO platform_settings (key, value, updated_at) VALUES (${params.key}, ${value}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `)
    await db.execute(sql`INSERT INTO platform_prompt_history (key, value, action, changed_by) VALUES (${params.key}, ${value}, 'update', ${user.id}::uuid)`)
    invalidatePlatformPromptCache()
    await writePromptAudit(user.id, 'platform.system_prompt.update', params.key, request, { length: value.length })
    return { ok: true, key: params.key, updatedAt: new Date().toISOString() }
  }, { params: promptKeyParams, body: t.Object({ value: t.String({ maxLength: 20000 }) }) })
  .delete('/system-prompts/:key', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    const section = PROMPT_SECTION_MAP.get(params.key)
    if (!section) { set.status = 404; return { error: 'Talimat bulunamadı.' } }
    await ensurePlatformPromptTable()
    await db.execute(sql`DELETE FROM platform_settings WHERE key = ${params.key}`)
    await db.execute(sql`INSERT INTO platform_prompt_history (key, value, action, changed_by) VALUES (${params.key}, ${section.defaultValue}, 'reset', ${user.id}::uuid)`)
    invalidatePlatformPromptCache()
    await writePromptAudit(user.id, 'platform.system_prompt.reset', params.key, request)
    return { ok: true, key: params.key, value: section.defaultValue }
  }, { params: promptKeyParams })
  .get('/system-prompts/:key/history', async ({ params, cookie, request, set }) => {
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    if (!PROMPT_SECTION_MAP.has(params.key)) { set.status = 404; return { error: 'Talimat bulunamadı.' } }
    await ensurePlatformPromptTable()
    const rows = await db.execute<{ id: string; value: string; action: string; changed_at: string; changed_by_name: string | null }>(sql`
      SELECT h.id::text AS id, h.value, h.action, h.changed_at, u.name AS changed_by_name
      FROM platform_prompt_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.key = ${params.key}
      ORDER BY h.changed_at DESC, h.id DESC LIMIT 50
    `)
    return {
      items: rows.map(r => ({ id: r.id, value: r.value, action: r.action === 'reset' ? 'Varsayılana dönüldü' : 'Güncellendi', changedAt: r.changed_at, changedBy: r.changed_by_name })),
    }
  }, { params: promptKeyParams })
  .post('/system-prompts/preview', async ({ body, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      const { getGreeting } = await import('../db/repositories/settings')
      const greeting = (await getGreeting('inbound', body.clinicId)) || 'Merhaba, size nasıl yardımcı olabilirim?'
      const effective = await getEffectivePromptSections()
      if (body.key && PROMPT_SECTION_MAP.has(body.key) && typeof body.value === 'string') effective[body.key] = body.value
      const vars = { greeting, callerName: 'Ayşe Yılmaz', callerPhone: '0555 000 00 00' }
      const keys = body.key && !PROMPT_SECTION_KEYS.includes(body.key) ? [body.key] : PROMPT_SECTION_KEYS
      const prompt = keys.map(k => renderPromptTemplate(effective[k] ?? '', vars)).filter(Boolean).join('\n\n')
      return { prompt }
    } catch (error) {
      set.status = 400
      return { error: error instanceof Error ? error.message : 'Önizleme oluşturulamadı.' }
    }
  }, { body: t.Object({ clinicId: t.String({ format: 'uuid' }), key: t.Optional(t.String({ maxLength: 80 })), value: t.Optional(t.String({ maxLength: 20000 })) }) })
