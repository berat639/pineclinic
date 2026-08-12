import { NextRequest, NextResponse } from 'next/server'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function PUT(req: NextRequest) {
  const token = req.cookies.get('token')?.value || ''
  const body = await req.json()
  const res = await fetch(`${SERVER_URL}/api/auth/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie: `token=${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
