import { describe, expect, test } from 'bun:test'
import { hasMatchingRequestOrigin, isPlatformAdminHostname } from './access'

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
})
