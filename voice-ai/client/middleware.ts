import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const isAdminPath = req.nextUrl.pathname.startsWith('/admin')
  const isAuthApi = req.nextUrl.pathname === '/api/admin-auth'

  if (isAdminPath && !isAuthApi) {
    const cookie = req.cookies.get('admin_auth')
    if (!cookie || cookie.value !== 'true') {
      return NextResponse.redirect(new URL('/admin-login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
