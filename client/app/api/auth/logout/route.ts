import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import { fetchBackend } from '@/lib/backend-request'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  await fetchBackend('/api/auth/logout', {
    method: 'POST',
    headers: {
      cookie: `token=${token}`,
      ...getTenantForwardingHeaders(req),
    },
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set('token', '', { maxAge: 0, path: '/' })
  return response
}
