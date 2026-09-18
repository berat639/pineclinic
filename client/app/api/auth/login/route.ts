import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': req.headers.get('x-forwarded-for') || (req as any).ip || '',
      'user-agent': req.headers.get('user-agent') || '',
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
  const response = NextResponse.json(data, { status: res.status })

  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    response.headers.set('set-cookie', setCookie)
  }

  return response
}
