import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import { fetchBackend } from '@/lib/backend-request'

export async function PUT(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  const body = await req.json()
  const res = await fetchBackend('/api/auth/password', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      cookie: `token=${token}`,
      ...getTenantForwardingHeaders(req),
    },
    body: JSON.stringify(body),
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
