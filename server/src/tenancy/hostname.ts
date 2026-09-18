export function normalizeHostname(value: string | null | undefined): string {
  if (!value) return ''
  const first = value.split(',')[0]?.trim().toLowerCase() ?? ''
  const withoutProtocol = first.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  return withoutProtocol.replace(/\.$/, '').replace(/:\d+$/, '')
}

export function hostnameFromRequest(request: Request, proxySecret = process.env.INTERNAL_PROXY_SECRET): string {
  const trusted = verifiedPublicHostname(request, proxySecret)
  if (trusted) return trusted
  const forwarded = request.headers.get('x-forwarded-host')
  const host = forwarded || request.headers.get('host')
  return normalizeHostname(host)
}

export function verifiedPublicHostname(
  request: Request,
  secret = process.env.INTERNAL_PROXY_SECRET,
): string {
  const hostname = normalizeHostname(request.headers.get('x-voiceai-public-host'))
  const actualSignature = request.headers.get('x-voiceai-public-host-signature') || ''
  if (!hostname || !secret || !actualSignature) return ''
  const expectedSignature = createHmac('sha256', secret).update(hostname).digest('hex')
  const actual = Buffer.from(actualSignature)
  const expected = Buffer.from(expectedSignature)
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? hostname : ''
}
import { createHmac, timingSafeEqual } from 'node:crypto'
