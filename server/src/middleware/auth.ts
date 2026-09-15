import { SignJWT, jwtVerify } from 'jose'
import { getUserById, getSessionByJti } from '../db/repositories/users'
import { ensurePlatformAdminMembership, getActiveMembership } from '../db/repositories/tenancy'
import { resolveTenantFromRequest } from '../tenancy/context'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'voiceai-dev-secret-change-me')
const TOKEN_EXPIRY = '8h'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  clinicId: string
  hostname?: string
  isPlatformAdmin: boolean
}

export async function signToken(user: { id: string; role: string; clinicId: string }, jti: string): Promise<string> {
  return new SignJWT({ sub: user.id, role: user.role, clinicId: user.clinicId })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<{ sub: string; role: string; clinicId: string; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return {
      sub: payload.sub as string,
      role: payload.role as string,
      clinicId: payload.clinicId as string,
      jti: payload.jti as string,
    }
  } catch {
    return null
  }
}

export async function authenticateRequest(cookie: string | undefined, request?: Request): Promise<AuthUser | null> {
  if (!cookie) return null
  const payload = await verifyToken(cookie)
  if (!payload?.clinicId) return null

  const session = await getSessionByJti(payload.jti)
  if (!session || session.expiresAt < new Date()) return null

  const user = await getUserById(payload.sub)
  if (!user || !user.active) return null

  const existingMembership = await getActiveMembership(user.id, payload.clinicId)
  const membership = existingMembership ?? (user.isPlatformAdmin
    ? await ensurePlatformAdminMembership(user.id, payload.clinicId)
    : null)
  if (!membership) return null

  let hostname: string | undefined
  if (request) {
    const tenant = await resolveTenantFromRequest(request)
    if (!tenant || tenant.clinicId !== payload.clinicId) return null
    hostname = tenant.hostname
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: membership.role,
    clinicId: payload.clinicId,
    hostname,
    isPlatformAdmin: user.isPlatformAdmin,
  }
}
