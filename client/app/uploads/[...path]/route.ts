import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params
  const backendUrl = process.env.BACKEND_PROXY_URL || process.env.SERVER_URL || 'http://localhost:3001'
  const uploadPath = resolvedParams.path.join('/')
  const targetUrl = new URL(`${backendUrl}/uploads/${uploadPath}${req.nextUrl.search}`)

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        host: new URL(backendUrl).host,
      },
    })

    if (!response.ok) {
      return new NextResponse(null, { status: response.status })
    }

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('connection')
    responseHeaders.set('cache-control', 'public, max-age=86400')

    if (!responseHeaders.has('content-type')) {
      const ext = uploadPath.split('.').pop()?.toLowerCase()
      if (ext === 'png') responseHeaders.set('content-type', 'image/png')
      else if (ext === 'jpg' || ext === 'jpeg') responseHeaders.set('content-type', 'image/jpeg')
      else if (ext === 'svg') responseHeaders.set('content-type', 'image/svg+xml')
      else if (ext === 'webp') responseHeaders.set('content-type', 'image/webp')
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error(`[Uploads Proxy] Error fetching ${targetUrl.href}:`, err?.message || err)
    return new NextResponse(null, { status: 404 })
  }
}
