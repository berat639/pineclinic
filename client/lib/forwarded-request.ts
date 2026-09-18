import type { NextRequest } from 'next/server'

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
