import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const resolvedParams = await params
  return handleProxy(req, resolvedParams.proxy)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const resolvedParams = await params
  return handleProxy(req, resolvedParams.proxy)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const resolvedParams = await params
  return handleProxy(req, resolvedParams.proxy)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const resolvedParams = await params
  return handleProxy(req, resolvedParams.proxy)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ proxy: string[] }> }) {
  const resolvedParams = await params
  return handleProxy(req, resolvedParams.proxy)
}

async function handleProxy(req: NextRequest, proxyPath: string[]) {
  const backendUrl = process.env.BACKEND_PROXY_URL || 'http://127.0.0.1:3001'
  const path = `/api/${(proxyPath || []).join('/')}`
  const search = req.nextUrl.search || ''
  const targetUrl = `${backendUrl}${path}${search}`

  const headers = new Headers(req.headers)
  headers.set('x-forwarded-host', req.headers.get('host') || req.nextUrl.host)
  headers.set('x-forwarded-proto', req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', ''))
  headers.delete('host')
  headers.delete('connection')

  try {
    const options: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual'
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = await req.arrayBuffer()
    }

    const response = await fetch(targetUrl, options)

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('content-encoding') // Next.js will handle encoding
    responseHeaders.delete('transfer-encoding')

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error(`[Proxy Error] ${req.method} ${targetUrl}`, error)
    return NextResponse.json({ error: 'Proxy failed', details: error.message }, { status: 500 })
  }
}
