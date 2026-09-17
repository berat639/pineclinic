export interface AutomaticTransferRule {
  keyword: string
  normalizedKeyword: string
  target: string
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

/** Build deterministic transfer rules from the active tenant's Flow Builder nodes. */
export function buildAutomaticTransferRules(nodes: unknown): AutomaticTransferRule[] {
  if (!Array.isArray(nodes)) return []
  const rules: AutomaticTransferRule[] = []
  const seen = new Set<string>()

  for (const rawNode of nodes) {
    const node = asRecord(rawNode)
    const data = asRecord(node?.data)
    if (node?.type !== 'ACTION' || data?.action !== 'transfer_call') continue

    const target = typeof data.transferNumber === 'string' ? data.transferNumber.trim() : ''
    const rawKeywords = typeof data.triggerKeywords === 'string' ? data.triggerKeywords : ''
    if (!target || !rawKeywords.trim()) continue

    for (const rawKeyword of rawKeywords.split(/[,;|\n]+/)) {
      const keyword = rawKeyword.trim()
      const normalizedKeyword = normalizeTransferText(keyword)
      if (!normalizedKeyword) continue
      const identity = `${target}\u0000${normalizedKeyword}`
      if (seen.has(identity)) continue
      seen.add(identity)
      rules.push({ keyword, normalizedKeyword, target })
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
  return rules.find(rule => haystack.includes(` ${rule.normalizedKeyword} `)) ?? null
}

/** "sağlık" gibi eksik ASR çıktısını İl Sağlık kuralına yönlendirir; aktarımı başlatmaz. */
export function findHealthTransferConfirmationRule(
  transcript: string,
  rules: readonly AutomaticTransferRule[],
): AutomaticTransferRule | null {
  const normalizedTranscript = normalizeTransferText(transcript)
  const exact = findAutomaticTransferRule(transcript, rules)
  if (exact?.normalizedKeyword.includes('saglik')) return exact
  if (normalizedTranscript !== 'saglik') return null
  return rules.find(rule => /^(?:il|iyi) saglik$/.test(rule.normalizedKeyword)) ?? null
}

export type TransferConfirmation = 'affirmative' | 'negative' | 'unknown'

/** Bekleyen aktarım için kısa Türkçe onay/red cevaplarını sınıflandırır. */
export function classifyTransferConfirmation(text: string): TransferConfirmation {
  const normalized = normalizeTransferText(text)
  if (/\b(?:hayir|degil|yanlis|vazgectim|istemiyorum)\b/.test(normalized)) return 'negative'
  if (/\b(?:evet|dogru|aynen|olur|tamam|onayliyorum)\b/.test(normalized)) return 'affirmative'
  return 'unknown'
}
