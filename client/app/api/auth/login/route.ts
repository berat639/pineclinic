import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import { fetchBackend } from '@/lib/backend-request'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetchBackend('/api/auth/login', {
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
    } catch {
      data = { error: 'Sunucudan geçersiz yanıt alındı' }
    }
    const response = NextResponse.json(data, { status: res.status })

    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      response.headers.set('set-cookie', setCookie)
    }

    return response
  } catch (error) {
    console.error('[Auth Proxy] Backend login request failed', error)
    return NextResponse.json(
      { error: 'Kimlik doğrulama servisine şu anda ulaşılamıyor' },
      { status: 503 },
    )
  }
}
