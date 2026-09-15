import { NextRequest, NextResponse } from 'next/server'

function decodeJwtPayload(token: string): { sub: string; role: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch { return null }
}

const PROTECTED_PREFIXES = ['/admin', '/panel', '/yonetici', '/hekim', '/host', '/shift', '/bildirimler', '/profil']
const ROLE_ROUTES: Record<string, string[]> = {
  yonetici: ['/admin', '/yonetici', '/panel', '/shift', '/bildirimler', '/profil'],
  moderator: ['/admin', '/yonetici', '/panel', '/shift', '/bildirimler', '/profil'],
  hekim: ['/hekim', '/shift', '/bildirimler', '/profil'],
  host: ['/host', '/shift', '/bildirimler', '/profil'],
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // /admin → /panel redirect
  if (pathname.startsWith('/admin')) {
    const token = req.cookies.get('token')?.value
    if (!token) return NextResponse.redirect(new URL('/login', req.url))
    const payload = decodeJwtPayload(token)
    if (!payload || (payload.role !== 'yonetici' && payload.role !== 'moderator')) return NextResponse.redirect(new URL('/login', req.url))
    return NextResponse.redirect(new URL('/panel', req.url))
  }

  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const token = req.cookies.get('token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const payload = decodeJwtPayload(token)
  if (!payload) return NextResponse.redirect(new URL('/login', req.url))

  const role = payload.role
  const allowed = ROLE_ROUTES[role]
  if (!allowed) return NextResponse.redirect(new URL('/login', req.url))

  const hasAccess = allowed.some(p => pathname.startsWith(p))
  if (!hasAccess) {
    const home = (role === 'yonetici' || role === 'moderator') ? '/panel' : role === 'hekim' ? '/hekim' : '/host'
    return NextResponse.redirect(new URL(home, req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/panel/:path*', '/yonetici/:path*', '/hekim/:path*', '/host/:path*', '/shift/:path*', '/bildirimler/:path*', '/profil/:path*', '/login'],
}
