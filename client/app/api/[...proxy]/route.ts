import { NextRequest, NextResponse } from 'next/server'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import { fetchBackend } from '@/lib/backend-request'

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
  const path = `/api/${(proxyPath || []).join('/')}`
  const search = req.nextUrl.search || ''
  const targetPath = `${path}${search}`

  const headers = new Headers(req.headers)
  for (const [name, value] of Object.entries(getTenantForwardingHeaders(req))) headers.set(name, value)
  // Fetch constructs its own HTTP framing. Forwarding hop-by-hop headers from
  // the incoming proxy connection (especially transfer-encoding) makes
  // undici reject the request before it reaches the backend.
  const connectionHeaders = headers.get('connection')?.split(',') ?? []
  for (const name of [...connectionHeaders, 'host', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'content-length']) {
    if (name.trim()) headers.delete(name.trim())
  }

  try {
    const options: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual'
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await req.arrayBuffer()
      if (body.byteLength > 0) options.body = body
    }

    const response = await fetchBackend(targetPath, options)

    const responseHeaders = new Headers(response.headers)
    responseHeaders.delete('content-encoding') // Next.js will handle encoding
    responseHeaders.delete('transfer-encoding')

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error(`[Proxy Error] ${req.method} ${targetPath}`, error)
    return NextResponse.json({ error: 'Proxy failed', details: error.message }, { status: 500 })
  }
}
