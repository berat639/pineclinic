import { Elysia } from 'elysia'
import { randomUUID } from 'crypto'
import { getUserByEmail, createUser, createSession, deleteSessionByJti, updateUser } from '../db/repositories/users'
import { signToken, authenticateRequest } from '../middleware/auth'
import { ensurePlatformAdminMembership, getActiveMembership } from '../db/repositories/tenancy'
import { resolveTenantFromRequest } from '../tenancy/context'

export const authPlugin = new Elysia({ prefix: '/api/auth' })

  .post('/login', async ({ body, set, cookie, request }) => {
    const { email, password } = body as { email: string; password: string }
    if (!email || !password) { set.status = 400; return { error: 'Email ve şifre gerekli' } }

    const user = await getUserByEmail(email.toLowerCase().trim())
    if (!user || !user.active) { set.status = 401; return { error: 'Geçersiz kimlik bilgileri' } }

    const valid = await Bun.password.verify(password, user.passwordHash)
    if (!valid) { set.status = 401; return { error: 'Geçersiz kimlik bilgileri' } }

    const tenant = await resolveTenantFromRequest(request)
    if (!tenant) {
      set.status = 404
      return { error: 'Bu domain için aktif klinik bulunamadı. Klinikler platform panelinden oluşturulmalıdır.' }
    }

    const existingMembership = await getActiveMembership(user.id, tenant.clinicId)
    const membership = existingMembership ?? (user.isPlatformAdmin
      ? await ensurePlatformAdminMembership(user.id, tenant.clinicId)
      : null)
    if (!membership) { set.status = 403; return { error: 'Bu klinik için erişim yetkiniz yok' } }

    const jti = randomUUID()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
    const ua = request.headers.get('user-agent') || undefined

    await createSession({ userId: user.id, tokenJti: jti, ipAddress: ip, userAgent: ua, expiresAt })
    const token = await signToken({ id: user.id, role: membership.role, clinicId: tenant.clinicId }, jti)

    await updateUser(user.id, { lastLoginAt: new Date() })

    cookie.token.set({
      value: token,
      httpOnly: true,
      secure: request.headers.get('x-forwarded-proto') === 'https',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })

    return { id: user.id, name: user.name, email: user.email, role: membership.role, clinicId: tenant.clinicId, hostname: tenant.hostname, isPlatformAdmin: user.isPlatformAdmin }
  })

  .post('/logout', async ({ cookie, set }) => {
    const token = ((cookie.token?.value as string | undefined) as string | undefined)
    if (!token) { set.status = 200; return { ok: true } }

    const { verifyToken } = await import('../middleware/auth')
    const payload = await verifyToken(token)
    if (payload) await deleteSessionByJti(payload.jti)

    cookie.token.set({ value: '', maxAge: 0, path: '/' })
    return { ok: true }
  })

  .get('/me', async ({ cookie, set, request }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined), request)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }
    return user
  })

  .put('/password', async ({ body, cookie, set, request }) => {
    const user = await authenticateRequest(((cookie.token?.value as string | undefined) as string | undefined), request)
    if (!user) { set.status = 401; return { error: 'Oturum geçersiz' } }

    const { currentPassword, newPassword } = body as { currentPassword: string; newPassword: string }
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      set.status = 400; return { error: 'Yeni şifre en az 6 karakter olmalı' }
    }

    const dbUser = await getUserByEmail(user.email)
    if (!dbUser) { set.status = 401; return { error: 'Kullanıcı bulunamadı' } }

    const valid = await Bun.password.verify(currentPassword, dbUser.passwordHash)
    if (!valid) { set.status = 401; return { error: 'Mevcut şifre yanlış' } }

    const newHash = await Bun.password.hash(newPassword)
    await updateUser(user.id, { passwordHash: newHash })
    return { ok: true }
  })
