import { Elysia, t } from 'elysia'
import { authenticateRequest } from '../middleware/auth'
import {
  ClinicProvisioningError,
  createPlatformClinic,
  listPlatformClinics,
} from '../db/repositories/platform-clinics'
import { hasMatchingRequestOrigin, isPlatformAdminRequest } from '../platform/access'
import { activateWhatsApp, configureWhatsAppSetup, prepareWhatsAppQr, publicWhatsAppConfig, refreshWhatsAppConnection } from '../db/repositories/whatsapp'
import { evolutionRequest } from '../integrations/whatsapp'
import { credentialsFor } from '../db/repositories/whatsapp'

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
  .post('/clinics/:clinicId/whatsapp/connect', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    if (!(await requirePlatformAdmin(cookie, request, set))) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try {
      const clinic = await prepareWhatsAppQr(params.clinicId)
      const result = await evolutionRequest<{ base64?: string; qrcode?: { base64?: string }; instance?: { state?: string } }>(credentialsFor(clinic), `/instance/connect/${encodeURIComponent(clinic.evolutionInstanceName!)}`)
      const qrcode = result.base64 || result.qrcode?.base64
      if (!qrcode || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qrcode) || qrcode.length >= 200_000) throw new Error('Evolution geçerli bir QR kodu döndürmedi.')
      return { clinic: publicWhatsAppConfig(clinic), qrcode, connectionState: result.instance?.state || 'connecting' }
    } catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'QR kodu hazırlanamadı.' } }
  }, { params: clinicParams })
  .post('/clinics/:clinicId/whatsapp/activate', async ({ params, cookie, request, set }) => {
    if (!isPlatformAdminRequest(request) || !hasMatchingRequestOrigin(request)) { set.status = 404; return { error: 'Sayfa bulunamadı.' } }
    const user = await requirePlatformAdmin(cookie, request, set)
    if (!user) return { error: 'Bu işlem yalnızca platform yöneticisine açıktır.' }
    try { return await activateWhatsApp(params.clinicId, user.id) }
    catch (error) { set.status = 400; return { error: error instanceof Error ? error.message : 'WhatsApp etkinleştirilemedi.' } }
  }, { params: clinicParams })
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
