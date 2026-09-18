import { Elysia, t } from 'elysia'
import { authenticateRequest } from '../middleware/auth'
import {
  ClinicProvisioningError,
  createPlatformClinic,
  listPlatformClinics,
} from '../db/repositories/platform-clinics'
import { hasMatchingRequestOrigin, isPlatformAdminRequest } from '../platform/access'

export const platformPlugin = new Elysia({ prefix: '/api/platform' })
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
