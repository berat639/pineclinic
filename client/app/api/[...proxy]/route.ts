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
  const backendUrl = process.env.BACKEND_PROXY_URL || 'http://localhost:3001'
  const targetUrl = new URL(req.url)
  
  // Construct the backend URL
  const path = `/api/${proxyPath.join('/')}`
  targetUrl.href = `${backendUrl}${path}${targetUrl.search}`

  const headers = new Headers(req.headers)
  headers.set('host', new URL(backendUrl).host)
  // Ensure we don't send Next.js specific headers that might confuse the backend
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
    console.error(`[Proxy Error] ${req.method} ${targetUrl.href}`, error)
    return NextResponse.json({ error: 'Proxy failed', details: error.message }, { status: 500 })
  }
}
