import { describe, expect, it } from 'vitest'
import { IMask } from 'react-imask'
import {
  TR_PHONE_MASK,
  TR_PHONE_DEFINITIONS,
  normalizeTrPhone,
  formatTrPhoneDisplay,
  stripTrCountryCodeOnPaste,
  matchesPhoneSearch,
} from './phone-mask'

describe('phone-mask utilities & IMask integration', () => {
  it('normalizes Turkish phone numbers from all input variants into 0XXXXXXXXXX', () => {
    expect(normalizeTrPhone('')).toBe('')
    expect(normalizeTrPhone(null)).toBe('')
    expect(normalizeTrPhone(undefined)).toBe('')
    expect(normalizeTrPhone('0')).toBe('0')
    expect(normalizeTrPhone('05321234567')).toBe('05321234567')
    expect(normalizeTrPhone('5321234567')).toBe('05321234567')
    expect(normalizeTrPhone('+90 532 123 45 67')).toBe('05321234567')
    expect(normalizeTrPhone('905321234567')).toBe('05321234567')
    expect(normalizeTrPhone('00905321234567')).toBe('05321234567')
    expect(normalizeTrPhone('0 (850) 309 61 19')).toBe('08503096119')
    expect(normalizeTrPhone('+90 (850) 309 61 19')).toBe('08503096119')
  })

  it('formats Turkish phone numbers visually as 0 (XXX) XXX XX XX', () => {
    expect(formatTrPhoneDisplay('')).toBe('')
    expect(formatTrPhoneDisplay('0')).toBe('0')
    expect(formatTrPhoneDisplay('0532')).toBe('0 (532')
    expect(formatTrPhoneDisplay('0532123')).toBe('0 (532) 123')
    expect(formatTrPhoneDisplay('05321234567')).toBe('0 (532) 123 45 67')
    expect(formatTrPhoneDisplay('+905321234567')).toBe('0 (532) 123 45 67')
    expect(formatTrPhoneDisplay('08503096119')).toBe('0 (850) 309 61 19')
  })

  it('correctly masks and unmasks both 05... and 5... and +90... inputs with IMask', () => {
    const createTrMask = () =>
      IMask.createMask({
        mask: TR_PHONE_MASK,
        definitions: TR_PHONE_DEFINITIONS,
        lazy: true,
        prepare: stripTrCountryCodeOnPaste,
      })

    const m1 = createTrMask()
    for (const ch of '05321234567') m1.append(ch, { input: true })
    expect(m1.value).toBe('0 (532) 123 45 67')
    expect(m1.unmaskedValue).toBe('05321234567')

    const m2 = createTrMask()
    for (const ch of '5321234567') m2.append(ch, { input: true })
    expect(m2.value).toBe('0 (532) 123 45 67')
    expect(m2.unmaskedValue).toBe('05321234567')

    const m3 = createTrMask()
    m3.append('+90 532 123 45 67', { input: true })
    expect(m3.value).toBe('0 (532) 123 45 67')
    expect(m3.unmaskedValue).toBe('05321234567')

    const m4 = createTrMask()
    m4.append('08503096119', { input: true })
    expect(m4.value).toBe('0 (850) 309 61 19')
    expect(m4.unmaskedValue).toBe('08503096119')
  })

  it('matches phone search queries across 8503096119, 08503096119, +908503096119 and formatted strings', () => {
    expect(matchesPhoneSearch('08503096119', '8503096119')).toBe(true)
    expect(matchesPhoneSearch('08503096119', '08503096119')).toBe(true)
    expect(matchesPhoneSearch('08503096119', '0 (850) 309 61 19')).toBe(true)
    expect(matchesPhoneSearch('08503096119', '+90 850 309 61 19')).toBe(true)
    expect(matchesPhoneSearch('8503096119', '08503096119')).toBe(true)
    expect(matchesPhoneSearch('+908503096119', '8503096119')).toBe(true)
    expect(matchesPhoneSearch('05321234567', '532 123')).toBe(true)
    expect(matchesPhoneSearch('05321234567', '8503096119')).toBe(false)
    expect(matchesPhoneSearch('08503096119', 'ahmet')).toBe(false)
  })
})
