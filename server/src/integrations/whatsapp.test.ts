import { describe, expect, test } from 'bun:test'
import {
  detectLocationRequest,
  detectOptOut,
  evolutionConnectionState,
  normalizeEvolutionQr,
  normalizePhone,
  parseEvolutionMessages,
  parseN8nInboundMessages,
  parseN8nStatusUpdates,
  signN8nPayload,
  verifyN8nSignature,
  verifyWebhookSecret,
} from './whatsapp'

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
  test('normalizes valid Evolution QR payloads and rejects non-PNG data', () => {
    const png = 'iVBORw0KGgo='
    expect(normalizeEvolutionQr(`data:image/png;base64,${png}`)).toBe(`data:image/png;base64,${png}`)
    expect(normalizeEvolutionQr(png)).toBe(`data:image/png;base64,${png}`)
    expect(normalizeEvolutionQr('data:image/jpeg;base64,/9j/4AAQ')).toBeNull()
    expect(normalizeEvolutionQr('not-a-qr')).toBeNull()
  })

  test('recognizes both Evolution connection-state response shapes', () => {
    expect(evolutionConnectionState({ instance: { state: 'open' } })).toBe('open')
    expect(evolutionConnectionState({ instance: { status: 'close' } })).toBe('close')
  })

  test('normalizes Turkish and international telephone formats', () => {
    expect(normalizePhone('0555 111 22 33')).toBe('+905551112233')
    expect(normalizePhone('+49 151 23456789')).toBe('+4915123456789')
  })

  test('requires an exact opt-out phrase', () => {
    expect(detectOptOut('DUR!')).toBe(true)
    expect(detectOptOut('Randevuyu iptal etmek istiyorum')).toBe(false)
  })

  test('recognizes common Turkish location requests', () => {
    expect(detectLocationRequest('Konum atar mısınız?')).toBe(true)
    expect(detectLocationRequest('Kliniğiniz nerede')).toBe(true)
    expect(detectLocationRequest('Yarın için randevu istiyorum')).toBe(false)
  })

  test('compares webhook secrets safely and requires 32 bytes', () => {
    const secret = 'a'.repeat(64)
    expect(verifyWebhookSecret(secret, secret)).toBe(true)
    expect(verifyWebhookSecret('b'.repeat(64), secret)).toBe(false)
    expect(verifyWebhookSecret('short', 'short')).toBe(false)
  })

  test('verifies n8n HMAC signature with ±300s replay protection', () => {
    const secret = 'c'.repeat(64)
    const rawBody = JSON.stringify({ externalId: 'wamid.1', from: '905551112233', text: 'Selam' })
    const tsSec = Math.floor(now / 1000)
    const { timestamp, signature } = signN8nPayload(rawBody, secret, tsSec)
    expect(verifyN8nSignature(rawBody, timestamp, signature, secret, now)).toBe(true)
    // Tampered body fails
    expect(verifyN8nSignature(`${rawBody} `, timestamp, signature, secret, now)).toBe(false)
    // Expired timestamp (>300s) fails
    expect(verifyN8nSignature(rawBody, timestamp, signature, secret, now + 305_000)).toBe(false)
  })

  test('parses both normalized n8n inbound messages and raw Meta Cloud API webhook entries', () => {
    const normalized = parseN8nInboundMessages({
      provider: 'n8n_meta',
      externalId: 'wamid.HBgM',
      from: '905551112233',
      timestamp: Math.floor(now / 1000),
      text: 'Randevu almak istiyorum',
    }, now)
    expect(normalized).toEqual([{
      externalId: 'wamid.HBgM',
      remoteJid: '905551112233@s.whatsapp.net',
      phone: '+905551112233',
      text: 'Randevu almak istiyorum',
      fromMe: false,
      timestamp: Math.floor(now / 1000) * 1000,
    }])

    const metaRaw = parseN8nInboundMessages({
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid.META2',
              from: '905559998877',
              timestamp: String(Math.floor(now / 1000)),
              type: 'text',
              text: { body: 'Merhaba klinik' },
            }],
          },
        }],
      }],
    }, now)
    expect(metaRaw).toHaveLength(1)
    expect(metaRaw[0]?.externalId).toBe('wamid.META2')
    expect(metaRaw[0]?.phone).toBe('+905559998877')
    expect(metaRaw[0]?.text).toBe('Merhaba klinik')
  })

  test('parses n8n and Meta delivery status updates', () => {
    expect(parseN8nStatusUpdates({ providerMessageId: 'wamid.1', status: 'delivered' })).toEqual([
      { providerMessageId: 'wamid.1', status: 'delivered' },
    ])
    expect(parseN8nStatusUpdates({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.2', status: 'read' }] } }] }],
    })).toEqual([
      { providerMessageId: 'wamid.2', status: 'read' },
    ])
  })
})
