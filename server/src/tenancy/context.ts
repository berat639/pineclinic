import { AsyncLocalStorage } from 'node:async_hooks'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { clinicDomains, clinics } from '../db/schema'

export interface TenantContext {
  clinicId: string
  hostname: string
}

const storage = new AsyncLocalStorage<TenantContext>()
const cache = new Map<string, { value: TenantContext | null; expiresAt: number }>()
const CACHE_TTL_MS = 30_000

export function normalizeHostname(value: string | null | undefined): string {
  if (!value) return ''
  const first = value.split(',')[0]?.trim().toLowerCase() ?? ''
  const withoutProtocol = first.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  return withoutProtocol.replace(/\.$/, '').replace(/:\d+$/, '')
}

export function hostnameFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')
  const host = forwarded || request.headers.get('host')
  return normalizeHostname(host)
}

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export async function findTenantByHostname(hostnameValue: string): Promise<TenantContext | null> {
  const hostname = normalizeHostname(hostnameValue)
  if (!hostname) return null

  const cached = cache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const [row] = await db.select({ clinicId: clinicDomains.clinicId })
    .from(clinicDomains)
    .innerJoin(clinics, eq(clinicDomains.clinicId, clinics.id))
    .where(and(
      eq(clinicDomains.hostname, hostname),
      eq(clinicDomains.isActive, true),
      eq(clinics.isActive, true),
    ))
    .limit(1)

  const value = row ? { clinicId: row.clinicId, hostname } : null
  cache.set(hostname, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export async function resolveTenantFromRequest(request: Request): Promise<TenantContext | null> {
  const hostname = hostnameFromRequest(request)
  const tenant = await findTenantByHostname(hostname)
  if (tenant) return tenant

  if (process.env.NODE_ENV !== 'production' && isLocalHostname(hostname)) {
    const [clinic] = await db.select({ id: clinics.id }).from(clinics)
      .where(eq(clinics.isActive, true)).limit(1)
    return clinic ? { clinicId: clinic.id, hostname } : null
  }

  return null
}

export function enterTenantContext(tenant: TenantContext | null): void {
  if (tenant) storage.enterWith(tenant)
}

export function runWithTenantContext<T>(tenant: TenantContext, operation: () => T): T {
  return storage.run(tenant, operation)
}

export function currentTenant(): TenantContext | null {
  return storage.getStore() ?? null
}

export function currentClinicId(): string | null {
  return currentTenant()?.clinicId ?? null
}

export function requireClinicId(): string {
  const clinicId = currentClinicId()
  if (!clinicId) throw new Error('Bu domain için aktif klinik bulunamadı')
  return clinicId
}

export function invalidateTenantCache(hostname?: string): void {
  if (hostname) cache.delete(normalizeHostname(hostname))
  else cache.clear()
}
