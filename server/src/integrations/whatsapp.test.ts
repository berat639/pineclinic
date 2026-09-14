import { describe, expect, test } from 'bun:test'
import { detectOptOut, normalizePhone, parseEvolutionMessages, verifyWebhookSecret } from './whatsapp'

const now = Date.now()
const payload = (overrides: Record<string, unknown> = {}) => ({
  event: 'messages.upsert',
  instance: 'clinic',
  data: {
    key: { id: 'ABC123', remoteJid: '905551112233@s.whatsapp.net', fromMe: false },
    messageTimestamp: Math.floor(now / 1000),
    message: { conversation: 'Merhaba' },
    ...overrides,
  },
})

describe('Evolution webhook normalization', () => {
  test('accepts a recent direct text message', () => {
    expect(parseEvolutionMessages(payload(), now)).toEqual([{
      externalId: 'ABC123', remoteJid: '905551112233@s.whatsapp.net', phone: '+905551112233',
      text: 'Merhaba', fromMe: false, timestamp: Math.floor(now / 1000) * 1000,
    }])
  })

  test('rejects groups, stale history and unsupported events', () => {
    expect(parseEvolutionMessages(payload({ key: { id: '1', remoteJid: '1-2@g.us', fromMe: false } }), now)).toEqual([])
    expect(parseEvolutionMessages(payload({ messageTimestamp: Math.floor((now - 11 * 60_000) / 1000) }), now)).toEqual([])
    expect(parseEvolutionMessages({ ...payload(), event: 'messages.set' }, now)).toEqual([])
  })

  test('keeps LID identity separate from telephone identity', () => {
    const [message] = parseEvolutionMessages(payload({ key: { id: 'LID', remoteJid: '123456@lid', fromMe: false } }), now)
    expect(message?.remoteJid).toBe('123456@lid')
    expect(message?.phone).toBeNull()
  })
})

describe('WhatsApp safety helpers', () => {
  test('normalizes Turkish and international telephone formats', () => {
    expect(normalizePhone('0555 111 22 33')).toBe('+905551112233')
    expect(normalizePhone('+49 151 23456789')).toBe('+4915123456789')
  })

  test('requires an exact opt-out phrase', () => {
    expect(detectOptOut('DUR!')).toBe(true)
    expect(detectOptOut('Randevuyu iptal etmek istiyorum')).toBe(false)
  })

  test('compares webhook secrets safely and requires 32 bytes', () => {
    const secret = 'a'.repeat(64)
    expect(verifyWebhookSecret(secret, secret)).toBe(true)
    expect(verifyWebhookSecret('b'.repeat(64), secret)).toBe(false)
    expect(verifyWebhookSecret('short', 'short')).toBe(false)
  })
})
