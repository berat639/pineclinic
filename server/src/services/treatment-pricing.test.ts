import { describe, expect, test } from 'bun:test'
import { calculateTreatmentPrices } from './treatment-pricing'

describe('treatment pricing', () => {
  test('includes sale price, percentage and fixed discounts', () => {
    const result = calculateTreatmentPrices([
      { basePriceMinor: 180000, materials: [{ quantity: 1, unitSalePriceMinor: 15000 }] },
      { basePriceMinor: 2705000, materials: [] },
    ], 1000, 0)
    expect(result.subtotalMinor).toBe(2900000)
    expect(result.totalMinor).toBe(2610000)
    expect(result.lineNetMinor.reduce((a, b) => a + b, 0)).toBe(result.totalMinor)
  })

  test('distributes remainder deterministically and preserves total', () => {
    const result = calculateTreatmentPrices(Array.from({ length: 3 }, () => ({ basePriceMinor: 101, materials: [] })), 1000, 1)
    expect(result.lineNetMinor).toEqual([91, 91, 90])
    expect(result.totalMinor).toBe(272)
  })

  test('rejects invalid quantities, discounts and unsafe values', () => {
    expect(() => calculateTreatmentPrices([{ basePriceMinor: 100, materials: [{ quantity: 0, unitSalePriceMinor: 5 }] }], 0, 0)).toThrow()
    expect(() => calculateTreatmentPrices([{ basePriceMinor: 100, materials: [] }], 0, 101)).toThrow()
    expect(() => calculateTreatmentPrices([{ basePriceMinor: Number.MAX_SAFE_INTEGER + 1, materials: [] }], 0, 0)).toThrow()
    expect(() => calculateTreatmentPrices([], 10001, 0)).toThrow()
  })
})
