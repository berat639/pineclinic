import { NextRequest, NextResponse } from 'next/server'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function GET(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  if (!token) return NextResponse.json({ error: 'Oturum yok' }, { status: 401 })

  const res = await fetch(`${SERVER_URL}/api/auth/me`, {
    headers: { cookie: `token=${token}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
