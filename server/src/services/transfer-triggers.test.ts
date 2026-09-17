import { describe, expect, test } from 'bun:test'
import { buildAutomaticTransferRules, findAutomaticTransferRule, normalizeTransferText } from './transfer-triggers'

describe('automatic transfer triggers', () => {
  const rules = buildAutomaticTransferRules([
    {
      type: 'ACTION',
      data: {
        action: 'transfer_call',
        transferNumber: '05535839265',
        triggerKeywords: 'bankoya aktar, il sağlık; yetkiliye bağla',
      },
    },
  ])

  test('splits configured keywords and keeps their target', () => {
    expect(rules).toHaveLength(3)
    expect(rules.every(rule => rule.target === '05535839265')).toBe(true)
  })

  test('matches Turkish suffixes and apostrophes', () => {
    expect(normalizeTransferText("Hayır, İl Sağlık'tan arıyorum.")).toBe('hayir il saglik tan ariyorum')
    expect(findAutomaticTransferRule("Hayır, İl Sağlık'tan arıyorum.", rules)?.keyword).toBe('il sağlık')
  })

  test('does not match unrelated health phrases', () => {
    expect(findAutomaticTransferRule('Diş sağlığım için randevu istiyorum.', rules)).toBeNull()
  })
})
