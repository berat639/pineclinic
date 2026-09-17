import { NextRequest, NextResponse } from 'next/server'
import { getExternalHostname } from '@/lib/forwarded-request'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  const res = await fetch(`${SERVER_URL}/api/auth/logout`, {
    method: 'POST',
    headers: {
      cookie: `token=${token}`,
      'x-forwarded-host': getExternalHostname(req),
    },
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set('token', '', { maxAge: 0, path: '/' })
  return response
}
