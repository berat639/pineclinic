import { NextRequest, NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

/**
 * Request HTTPS üzerinden mi geldi? Dokploy/Traefik gibi reverse proxy
 * arkasında Next.js HTTP olarak istek alır; gerçek protokol
 * `x-forwarded-proto` header'ında olur.
 */
function isSecureRequest(req: NextRequest): boolean {
  const xfProto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  if (xfProto) return xfProto === 'https'
  try {
    return new URL(req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Yanlış şifre' }, { status: 401 })
  }

  const secure = isSecureRequest(req)
  const res = NextResponse.json({ success: true })
  res.cookies.set('admin_auth', 'true', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 saat
    path: '/',
  })
  return res
}

export async function DELETE(req: NextRequest) {
  const secure = isSecureRequest(req)
  const res = NextResponse.json({ success: true })
  res.cookies.set('admin_auth', '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}
