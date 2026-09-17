import { NextRequest, NextResponse } from 'next/server'
import { getExternalHostname, getExternalProtocol } from '@/lib/forwarded-request'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  if (!token) return NextResponse.json({ error: 'Oturum yok' }, { status: 401 })

  const res = await fetch(`${SERVER_URL}/api/auth/me`, {
    headers: {
      cookie: `token=${token}`,
      'x-forwarded-host': getExternalHostname(req),
      'x-forwarded-proto': getExternalProtocol(req),
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
