import { Elysia, t } from 'elysia'
import { authenticateRequest } from '../middleware/auth'
import { hasMatchingRequestOrigin, isPlatformAdminRequest } from '../platform/access'
import { serviceOf, SetupError } from '../integrations/managed/model'
import { integrationView, saveConfig } from '../integrations/managed/store'
import { beginTest, cancelTest, confirmTest, setEnabled, testInfo } from '../integrations/managed/workflow'
const params = t.Object({clinicId:t.String({format:'uuid'}),service:t.Union([t.Literal('phone'),t.Literal('sms'),t.Literal('smtp')])})
export const platformIntegrations = new Elysia({prefix:'/api/platform/clinics'})
  .onBeforeHandle(async ({request,cookie,set}) => {
    if (!isPlatformAdminRequest(request) || (request.method!=='GET' && !hasMatchingRequestOrigin(request))) { set.status=404; return {error:'Sayfa bulunamadı'} }
    const user=await authenticateRequest(cookie.token?.value as string | undefined,request)
    if (!user?.isPlatformAdmin) { set.status=user?403:401; return {error:'Platform yöneticisi yetkisi gerekli'} }
  })
  .onError(({error,set})=>{ if(error instanceof SetupError) {set.status=error.status;return {error:error.message}}; if ('code' in error && error.code==='23505') {set.status=409;return {error:'Bu numara veya hesap zaten kullanımda'}}; set.status=500;return {error:'Entegrasyon işlemi tamamlanamadı'} })
  .get('/:clinicId/integrations',({params})=>integrationView(params.clinicId,true),{params:t.Object({clinicId:t.String({format:'uuid'})})})
  .put('/:clinicId/integrations/:service',async ({params,body,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return saveConfig(params.clinicId,serviceOf(params.service),body as Record<string,unknown>,user!.id)
  },{params,body:t.Record(t.String(),t.Unknown())})
  .post('/:clinicId/integrations/:service/test',async ({params,body,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return beginTest(params.clinicId,serviceOf(params.service),body as Record<string,unknown>,user!.id)
  },{params,body:t.Record(t.String(),t.Unknown())})
  .get('/:clinicId/integrations/:service/tests/:testId',({params})=>testInfo(params.clinicId,serviceOf(params.service),params.testId),{params:t.Composite([params,t.Object({testId:t.String({format:'uuid'})})])})
  .post('/:clinicId/integrations/:service/tests/:testId/confirm',async ({params,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return confirmTest(params.clinicId,serviceOf(params.service),params.testId,user!.id)
  },{params:t.Composite([params,t.Object({testId:t.String({format:'uuid'})})])})
  .post('/:clinicId/integrations/:service/tests/:testId/cancel',async ({params,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return cancelTest(params.clinicId,serviceOf(params.service),params.testId,user!.id)
  },{params:t.Composite([params,t.Object({testId:t.String({format:'uuid'})})])})
  .post('/:clinicId/integrations/:service/activate',async ({params,body,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return setEnabled(params.clinicId,serviceOf(params.service),true,body.revision,user!.id)
  },{params,body:t.Object({revision:t.Number()})})
  .post('/:clinicId/integrations/:service/deactivate',async ({params,body,cookie,request})=>{
    const user=await authenticateRequest(cookie.token?.value as string,request)
    return setEnabled(params.clinicId,serviceOf(params.service),false,body.revision,user!.id)
  },{params,body:t.Object({revision:t.Number()})})
