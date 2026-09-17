export interface AutomaticTransferRule {
  id: string
  keyword: string
  normalizedKeyword: string
  target: string
  requiresConfirmation: boolean
  confirmationQuestion?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

export function normalizeTransferText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function questionSuffix(value: string): 'mı' | 'mi' | 'mu' | 'mü' {
  const vowels = value.toLocaleLowerCase('tr-TR').match(/[aeıioöuü]/g)
  const lastVowel = vowels?.at(-1)
  if (lastVowel === 'e' || lastVowel === 'i') return 'mi'
  if (lastVowel === 'o' || lastVowel === 'u') return 'mu'
  if (lastVowel === 'ö' || lastVowel === 'ü') return 'mü'
  return 'mı'
}

/** Use the optional node text, otherwise create a short Turkish confirmation question. */
export function getTransferConfirmationQuestion(
  rule: Pick<AutomaticTransferRule, 'keyword' | 'target' | 'confirmationQuestion'>,
): string {
  const customQuestion = rule.confirmationQuestion?.trim()
  if (customQuestion) return customQuestion

  const subject = (rule.keyword || rule.target).trim()
  if (!subject) return 'Aramayı aktarmamı onaylıyor musunuz?'
  const label = subject.charAt(0).toLocaleUpperCase('tr-TR') + subject.slice(1)
  return `${label} ${questionSuffix(subject)} dediniz?`
}

/** Build deterministic transfer rules from the active tenant's Flow Builder nodes. */
export function buildAutomaticTransferRules(nodes: unknown): AutomaticTransferRule[] {
  if (!Array.isArray(nodes)) return []
  const rules: AutomaticTransferRule[] = []
  const seen = new Set<string>()

  for (const [nodeIndex, rawNode] of nodes.entries()) {
    const node = asRecord(rawNode)
    const data = asRecord(node?.data)
    if (node?.type !== 'ACTION' || data?.action !== 'transfer_call') continue

    const target = typeof data.transferNumber === 'string' ? data.transferNumber.trim() : ''
    const rawKeywords = typeof data.triggerKeywords === 'string' ? data.triggerKeywords : ''
    if (!target) continue

    // Undefined means enabled so transfer nodes saved before this option was
    // introduced keep the safer, confirmation-first behaviour.
    const requiresConfirmation = data.requireConfirmation !== false
    const confirmationQuestion = typeof data.confirmationQuestion === 'string'
      ? data.confirmationQuestion.trim() || undefined
      : undefined
    const nodeId = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : `transfer-${nodeIndex}`
    const rawKeywordList = rawKeywords.trim() ? rawKeywords.split(/[,;|\n]+/) : ['']

    for (const rawKeyword of rawKeywordList) {
      const keyword = rawKeyword.trim()
      const normalizedKeyword = normalizeTransferText(keyword)
      const identity = `${target}\u0000${normalizedKeyword}`
      if (seen.has(identity)) continue
      seen.add(identity)
      rules.push({
        id: nodeId,
        keyword,
        normalizedKeyword,
        target,
        requiresConfirmation,
        confirmationQuestion,
      })
    }
  }

  return rules
}

export function findAutomaticTransferRule(
  transcript: string,
  rules: readonly AutomaticTransferRule[],
): AutomaticTransferRule | null {
  const normalizedTranscript = normalizeTransferText(transcript)
  if (!normalizedTranscript) return null
  const haystack = ` ${normalizedTranscript} `
  return rules.find(rule => rule.normalizedKeyword && haystack.includes(` ${rule.normalizedKeyword} `)) ?? null
}

/**
 * If ASR returns only one distinctive word from a multi-word keyword, allow
 * it to start the configured confirmation flow. Direct-transfer rules never
 * use this fuzzy path, so an incomplete transcription cannot redirect a call.
 */
export function findTransferConfirmationCandidate(
  transcript: string,
  rules: readonly AutomaticTransferRule[],
): AutomaticTransferRule | null {
  const normalizedTranscript = normalizeTransferText(transcript)
  if (!normalizedTranscript || normalizedTranscript.includes(' ') || normalizedTranscript.length < 4) return null

  const candidates = rules.filter(rule =>
    rule.requiresConfirmation
    && rule.normalizedKeyword.split(' ').includes(normalizedTranscript),
  )
  const uniqueRuleIds = new Set(candidates.map(rule => rule.id))
  return uniqueRuleIds.size === 1 ? candidates[0] : null
}

/** Resolve which configured node governs a model-initiated transfer tool call. */
export function findTransferRuleForRequest(
  target: string,
  reason: string,
  rules: readonly AutomaticTransferRule[],
): AutomaticTransferRule | null {
  const reasonMatch = findAutomaticTransferRule(reason, rules)
  if (reasonMatch) return reasonMatch

  const normalizedTarget = normalizeTransferText(target)
  const targetRules = rules.filter(rule => normalizeTransferText(rule.target) === normalizedTarget)
  return targetRules.find(rule => rule.requiresConfirmation) ?? targetRules[0] ?? null
}

export type TransferConfirmation = 'affirmative' | 'negative' | 'unknown'

/** Bekleyen aktarım için kısa Türkçe onay/red cevaplarını sınıflandırır. */
export function classifyTransferConfirmation(text: string): TransferConfirmation {
  const normalized = normalizeTransferText(text)
  if (/\b(?:hayir|degil|yanlis|vazgectim|istemiyorum)\b/.test(normalized)) return 'negative'
  if (/\b(?:evet|dogru|aynen|olur|tamam|onayliyorum)\b/.test(normalized)) return 'affirmative'
  return 'unknown'
}
