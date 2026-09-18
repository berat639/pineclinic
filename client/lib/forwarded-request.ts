import type { NextRequest } from 'next/server'
import { createHmac } from 'node:crypto'

function firstForwardedValue(value: string | null): string {
  return value?.split(',')[0]?.trim() || ''
}

/** Preserve the public clinic hostname across the Next.js → API proxy hop. */
export function getExternalHostname(request: NextRequest): string {
  return request.headers.get('host')
    || firstForwardedValue(request.headers.get('x-forwarded-host'))
    || request.nextUrl.host
}

export function getExternalProtocol(request: NextRequest): string {
  return firstForwardedValue(request.headers.get('x-forwarded-proto'))
    || request.nextUrl.protocol.replace(':', '')
}

/** Signed by the Next.js server so an internet client cannot choose a tenant
 * by forging forwarding headers on the public backend endpoint. */
export function getTenantForwardingHeaders(request: NextRequest): Record<string, string> {
  const hostname = getExternalHostname(request)
  const headers: Record<string, string> = {
    'x-forwarded-host': hostname,
    'x-forwarded-proto': getExternalProtocol(request),
  }
  const secret = process.env.INTERNAL_PROXY_SECRET?.trim()
  if (secret) {
    headers['x-voiceai-public-host'] = hostname
    headers['x-voiceai-public-host-signature'] = createHmac('sha256', secret).update(hostname).digest('hex')
  }
  return headers
}
