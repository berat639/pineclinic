import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import { fetchBackend } from '@/lib/backend-request'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  if (!token) return NextResponse.json({ error: 'Oturum yok' }, { status: 401 })

  const res = await fetchBackend('/api/auth/me', {
    headers: {
      cookie: `token=${token}`,
      ...getTenantForwardingHeaders(req),
    },
  })

  let data
  try {
    const text = await res.text()
    data = text ? JSON.parse(text) : {}
  } catch (e) {
    data = { error: 'Invalid response from server' }
  }
  return NextResponse.json(data, { status: res.status })
}
