import { AsyncLocalStorage } from 'node:async_hooks'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { clinicDomains, clinics } from '../db/schema'
import { hostnameFromRequest, normalizeHostname } from './hostname'

export { hostnameFromRequest, normalizeHostname } from './hostname'

export interface TenantContext {
  clinicId: string
  hostname: string
}

const storage = new AsyncLocalStorage<TenantContext>()
const requestStorage = new AsyncLocalStorage<Request>()
const requestTenants = new WeakMap<Request, TenantContext | null>()
const cache = new Map<string, { value: TenantContext | null; expiresAt: number }>()
const CACHE_TTL_MS = 30_000

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

/** Bind the request before any awaited lifecycle work. Elysia can resume an
 * async hook on a different resource; the request object itself remains a
 * stable, concurrency-safe key for the resolved tenant. */
export function bindRequestContext(request: Request): void {
  requestStorage.enterWith(request)
}

export function setRequestTenant(request: Request, tenant: TenantContext | null): void {
  requestTenants.set(request, tenant)
  if (tenant) storage.enterWith(tenant)
}

export function runWithTenantContext<T>(tenant: TenantContext, operation: () => T): T {
  return storage.run(tenant, operation)
}

export function currentTenant(): TenantContext | null {
  const stored = storage.getStore()
  if (stored) return stored
  const request = requestStorage.getStore()
  return request ? (requestTenants.get(request) ?? null) : null
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
