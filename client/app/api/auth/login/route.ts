import { NextRequest, NextResponse } from 'next/server'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': req.headers.get('x-forwarded-for') || (req as any).ip || '',
      'user-agent': req.headers.get('user-agent') || '',
      'x-forwarded-proto': req.headers.get('x-forwarded-proto') || 'http',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  const response = NextResponse.json(data, { status: res.status })

  const setCookie = res.headers.get('set-cookie')
  if (setCookie) {
    response.headers.set('set-cookie', setCookie)
  }

  return response
}
