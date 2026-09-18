import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { hasMatchingRequestOrigin, isPlatformAdminHostname } from './access'
import { hostnameFromRequest } from '../tenancy/hostname'

describe('platform admin hostname access', () => {
  const configured = 'pineclinic.thinpine.com, platform-staging.thinpine.com'

  test('accepts only configured, normalized hostnames', () => {
    expect(isPlatformAdminHostname('pineclinic.thinpine.com', configured)).toBe(true)
    expect(isPlatformAdminHostname('PINECLINIC.THINPINE.COM:443', configured)).toBe(true)
    expect(isPlatformAdminHostname('https://platform-staging.thinpine.com/', configured)).toBe(true)
  })

  test('rejects suffix tricks and unconfigured hosts', () => {
    expect(isPlatformAdminHostname('pineclinic.thinpine.com.attacker.test', configured)).toBe(false)
    expect(isPlatformAdminHostname('fakepineclinic.thinpine.com', configured)).toBe(false)
    expect(isPlatformAdminHostname('thinpine.com', configured)).toBe(false)
  })

  test('fails closed when configuration is missing', () => {
    expect(isPlatformAdminHostname('pineclinic.thinpine.com', '')).toBe(false)
    expect(isPlatformAdminHostname('', configured)).toBe(false)
  })

  test('accepts only a matching browser origin when one is present', () => {
    expect(hasMatchingRequestOrigin(new Request('http://server/api/platform/clinics', { headers: {
      host: 'server', 'x-forwarded-host': 'pineclinic.thinpine.com', origin: 'https://pineclinic.thinpine.com',
    } }))).toBe(true)
    expect(hasMatchingRequestOrigin(new Request('http://server/api/platform/clinics', { headers: {
      host: 'server', 'x-forwarded-host': 'pineclinic.thinpine.com', origin: 'https://other-clinic.example.com',
    } }))).toBe(false)
  })

  test('uses a signed public hostname across the reverse proxy hop', () => {
    const secret = 'proxy-test-secret'
    const hostname = 'pineclinic.thinpine.com'
    const signature = createHmac('sha256', secret).update(hostname).digest('hex')
    const request = new Request('http://server/api/auth/me', { headers: {
      'x-forwarded-host': 'api.pinecllinic.thinpine.com',
      'x-voiceai-public-host': hostname,
      'x-voiceai-public-host-signature': signature,
    } })
    expect(hostnameFromRequest(request, secret)).toBe(hostname)
    expect(hostnameFromRequest(new Request(request.url, { headers: {
      ...Object.fromEntries(request.headers),
      'x-voiceai-public-host-signature': 'invalid',
    } }), secret)).toBe('api.pinecllinic.thinpine.com')
  })
})
