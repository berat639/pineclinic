import type { NextRequest } from 'next/server'
import { fetchBackend } from './backend-request'
import { getTenantForwardingHeaders } from './forwarded-request'

export async function hasAuthenticatedSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('token')?.value
  if (!token) return false
  try {
    const response = await fetchBackend('/api/auth/me', {
      headers: { cookie: `token=${token}`, ...getTenantForwardingHeaders(request) },
    })
    return response.ok
  } catch {
    return false
  }
}
