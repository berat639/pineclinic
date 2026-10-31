'use client'

import React from 'react'
import { IMaskInput } from 'react-imask'

export const TR_PHONE_MASK = '{\\0} (N00) 000 00 00'
export const TR_PHONE_DEFINITIONS = { N: /[1-9]/ }

/**
 * Normalizes a Turkish phone string into the canonical 11-digit `0XXXXXXXXXX`
 * representation (or partial `0...` while typing, or `""` when empty).
 */
export function normalizeTrPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  let digits = String(raw).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0090')) {
    digits = digits.slice(4)
  } else if (digits.startsWith('90') && digits.length >= 10) {
    digits = digits.slice(2)
  }
  if (digits === '0') return '0'
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  digits = digits.replace(/^0+/, '').slice(0, 10)
  return digits ? `0${digits}` : '0'
}

/**
 * Formats a Turkish phone value visually as `0 (5XX) XXX XX XX` (or returns
 * the original text if it is a non-numeric label).
 */
export function formatTrPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const norm = normalizeTrPhone(raw)
  if (!norm) return ''
  if (norm === '0') return '0'
  const nat = norm.slice(1)
  if (nat.length <= 3) return `0 (${nat}`
  if (nat.length <= 6) return `0 (${nat.slice(0, 3)}) ${nat.slice(3)}`
  if (nat.length <= 8) return `0 (${nat.slice(0, 3)}) ${nat.slice(3, 6)} ${nat.slice(6)}`
  return `0 (${nat.slice(0, 3)}) ${nat.slice(3, 6)} ${nat.slice(6, 8)} ${nat.slice(8, 10)}`
}

export function stripTrCountryCodeOnPaste(appended: string, masked: { unmaskedValue?: string }): string {
  if (!masked.unmaskedValue && appended.length > 2 && /^[\d+\s()-]+$/.test(appended)) {
    const norm = normalizeTrPhone(appended)
    return norm.startsWith('0') ? norm.slice(1) : norm
  }
  return appended
}

export interface PhoneMaskedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  /**
   * - `'tr'` (default): Turkish 11-digit phone mask `0 (XXX) XXX XX XX` -> emits `0XXXXXXXXXX`
   * - `'phoneOrLabel'`: Masks numeric inputs as `0 (XXX) XXX XX XX` -> `0XXXXXXXXXX`, while allowing text labels (e.g. `resepsiyon`, `banko`)
   */
  mode?: 'tr' | 'phoneOrLabel'
}

const FLOW_DYNAMIC_MASK = [
  {
    mask: TR_PHONE_MASK,
    definitions: TR_PHONE_DEFINITIONS,
    lazy: true,
  },
  {
    mask: /^.*$/,
  },
]

export function PhoneMaskedInput({
  value,
  onValueChange,
  mode = 'tr',
  placeholder = '0 (5XX) XXX XX XX',
  inputMode,
  autoComplete = 'tel',
  ...rest
}: PhoneMaskedInputProps) {
  if (mode === 'phoneOrLabel') {
    const isNumericLike = !value || /^[\d+\s()-]+$/.test(value.trim())
    const displayVal = isNumericLike ? formatTrPhoneDisplay(value) : value
    return (
      <IMaskInput
        {...(rest as Record<string, unknown>)}
        mask={FLOW_DYNAMIC_MASK as never}
        unmask={false}
        value={displayVal}
        placeholder={placeholder}
        inputMode={inputMode ?? 'text'}
        autoComplete={autoComplete}
        prepare={stripTrCountryCodeOnPaste}
        dispatch={(appended: string, dynamicMasked: { value: string; compiledMasks: unknown[] }) => {
          const next = (dynamicMasked.value + appended).trim()
          if (!next || /^[\d+\s()-]+$/.test(next)) {
            return dynamicMasked.compiledMasks[0] as never
          }
          return dynamicMasked.compiledMasks[1] as never
        }}
        onAccept={(acceptedValue: unknown, maskRef: { unmaskedValue: string; value: string }) => {
          const rawStr = String(acceptedValue ?? '')
          if (!rawStr) {
            onValueChange('')
            return
          }
          if (/^[\d+\s()-]+$/.test(rawStr.trim())) {
            onValueChange(normalizeTrPhone( maskRef?.unmaskedValue || rawStr ))
          } else {
            onValueChange(rawStr)
          }
        }}
      />
    )
  }

  const normalizedValue = normalizeTrPhone(value)

  return (
    <IMaskInput
      {...(rest as Record<string, unknown>)}
      mask={TR_PHONE_MASK}
      definitions={TR_PHONE_DEFINITIONS}
      lazy={true}
      unmask={true}
      value={normalizedValue}
      placeholder={placeholder}
      inputMode={inputMode ?? 'tel'}
      autoComplete={autoComplete}
      prepare={stripTrCountryCodeOnPaste}
      onAccept={(unmasked: unknown) => {
        const next = String(unmasked ?? '')
        onValueChange(next)
      }}
    />
  )
}
