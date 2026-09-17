import { describe, expect, test } from 'bun:test'
import {
  buildAutomaticTransferRules,
  classifyTransferConfirmation,
  findAutomaticTransferRule,
  findTransferConfirmationCandidate,
  findTransferRuleForRequest,
  getTransferConfirmationQuestion,
  normalizeTransferText,
} from './transfer-triggers'

describe('automatic transfer triggers', () => {
  const rules = buildAutomaticTransferRules([
    {
      id: 'health-transfer',
      type: 'ACTION',
      data: {
        action: 'transfer_call',
        transferNumber: '05535839265',
        triggerKeywords: 'bankoya aktar, il sağlık; iyi sağlık',
        requireConfirmation: true,
        confirmationQuestion: 'İl Sağlık birimine mi bağlanmak istediniz?',
      },
    },
    {
      id: 'reception-transfer',
      type: 'ACTION',
      data: {
        action: 'transfer_call',
        transferNumber: 'resepsiyon',
        triggerKeywords: 'yetkiliye bağla',
        requireConfirmation: false,
      },
    },
  ])

  test('splits configured keywords and keeps their target', () => {
    expect(rules).toHaveLength(4)
    expect(rules.filter(rule => rule.id === 'health-transfer')).toHaveLength(3)
    expect(rules.find(rule => rule.keyword === 'yetkiliye bağla')?.requiresConfirmation).toBe(false)
  })

  test('matches Turkish suffixes and apostrophes', () => {
    expect(normalizeTransferText("Hayır, İl Sağlık'tan arıyorum.")).toBe('hayir il saglik tan ariyorum')
    expect(findAutomaticTransferRule("Hayır, İl Sağlık'tan arıyorum.", rules)?.keyword).toBe('il sağlık')
  })

  test('does not match unrelated health phrases', () => {
    expect(findAutomaticTransferRule('Diş sağlığım için randevu istiyorum.', rules)).toBeNull()
  })

  test('treats a distinctive standalone word as a generic confirmation candidate', () => {
    expect(findTransferConfirmationCandidate('sağlık', rules)?.id).toBe('health-transfer')
    expect(findTransferConfirmationCandidate('diş sağlığım ağrıyor', rules)).toBeNull()
    expect(findTransferConfirmationCandidate('yetkiliye', rules)).toBeNull()
  })

  test('uses custom confirmation question and generates one when omitted', () => {
    const healthRule = rules.find(rule => rule.keyword === 'il sağlık')!
    expect(getTransferConfirmationQuestion(healthRule)).toBe('İl Sağlık birimine mi bağlanmak istediniz?')
    expect(getTransferConfirmationQuestion({ keyword: 'muhasebe', target: '123' })).toBe('Muhasebe mi dediniz?')
    expect(getTransferConfirmationQuestion({ keyword: 'doktor', target: '123' })).toBe('Doktor mu dediniz?')
  })

  test('resolves model tool calls to the matching configured transfer node', () => {
    expect(findTransferRuleForRequest('05535839265', 'Otomatik anahtar kelime: il sağlık', rules)?.id).toBe('health-transfer')
    expect(findTransferRuleForRequest('resepsiyon', 'Kullanıcı aktarım istedi', rules)?.requiresConfirmation).toBe(false)
  })

  test('keeps legacy nodes confirmation-first and supports nodes without keywords', () => {
    const legacyRules = buildAutomaticTransferRules([{ id: 'legacy', type: 'ACTION', data: { action: 'transfer_call', transferNumber: '123' } }])
    expect(legacyRules).toHaveLength(1)
    expect(legacyRules[0].requiresConfirmation).toBe(true)
    expect(legacyRules[0].normalizedKeyword).toBe('')
  })

  test('classifies explicit confirmation without accepting negative answers', () => {
    expect(classifyTransferConfirmation('Evet, doğru.')).toBe('affirmative')
    expect(classifyTransferConfirmation('Hayır, doğru değil.')).toBe('negative')
    expect(classifyTransferConfirmation('Bir daha söyler misiniz?')).toBe('unknown')
  })
})
