import { describe, expect, test } from 'bun:test'
import { treatmentTargets } from '../../../client/lib/treatment-targets'

describe('treatment scope', () => {
  test('tooth scope creates one target per valid selected tooth', () => {
    expect(treatmentTargets('tooth', [16, 16, 36, 99])).toEqual(['16', '36'])
  })
  test('jaw and mouth scopes do not multiply a single fee by tooth count', () => {
    expect(treatmentTargets('jaw', [11, 12, 36, 37])).toEqual(['upper', 'lower'])
    expect(treatmentTargets('jaw', [])).toEqual([])
    expect(treatmentTargets('mouth', [11, 12, 36, 37])).toEqual(['general'])
    expect(treatmentTargets('mouth', [])).toEqual(['general'])
  })
})
