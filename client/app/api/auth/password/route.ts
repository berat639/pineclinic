import { NextRequest, NextResponse } from 'next/server'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function PUT(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  const body = await req.json()
  const res = await fetch(`${SERVER_URL}/api/auth/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      cookie: `token=${token}`,
      'x-forwarded-host': req.headers.get('host') || req.nextUrl.host,
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
