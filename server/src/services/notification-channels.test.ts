import { describe, expect, test } from 'bun:test'
import { consentAllows, NOTIFICATION_CHANNELS, notificationChannels } from '../../../client/lib/notification-channels'

describe('notification channel selection and consent', () => {
  test('round-trips every subset independently without falling back to SMS', () => {
    for (let mask = 0; mask < 16; mask++) {
      const channels = NOTIFICATION_CHANNELS.filter((_, index) => mask & (1 << index))
      expect(notificationChannels(channels.join(','))).toEqual(channels)
    }
    expect(notificationChannels('unknown')).toEqual([])
    expect(notificationChannels(null)).toEqual([])
  })
  test('keeps legacy combinations readable', () => {
    expect(notificationChannels('both')).toEqual(['sms', 'whatsapp', 'email'])
    expect(notificationChannels('whatsapp_sms')).toEqual(['sms', 'whatsapp'])
  })
  test('requires a current affirmative permission for each channel', () => {
    const preferences = NOTIFICATION_CHANNELS.map(channel => ({ channel, status: 'granted', textVersion: 'v1' }))
    for (const channel of NOTIFICATION_CHANNELS) {
      expect(consentAllows(channel, preferences, 'v1', {})).toBe(true)
      expect(consentAllows(channel, preferences, 'v2', {})).toBe(false)
      expect(consentAllows(channel, preferences, null, {})).toBe(false)
      for (const status of ['pending', 'refused', 'revoked']) expect(consentAllows(channel, [{ channel, status, textVersion: 'v1' }], 'v1', {})).toBe(false)
    }
    expect(consentAllows('sms', preferences, 'v1', { smsOptOut: true })).toBe(false)
    expect(consentAllows('whatsapp', preferences, 'v1', { whatsappOptOut: true })).toBe(false)
    expect(consentAllows('email', preferences, 'v1', { emailOptOut: true })).toBe(false)
  })
})
