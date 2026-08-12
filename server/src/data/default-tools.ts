/**
 * data/default-tools.ts — Varsayılan tool açıklamaları
 *
 * Tool function declarations'ın description alanları admin panelden
 * düzenlenebilir. DB'de `tools.*` prefix'li key olarak saklanır.
 * DB'de yoksa buradaki varsayılanlar kullanılır.
 */

export interface ToolDescriptionDef {
  key: string
  toolName: string
  label: string
  defaultDescription: string
}

export interface ToolParamDef {
  key: string
  toolName: string
  paramName: string
  label: string
  defaultDescription: string
}

// ── Tool-level descriptions ─────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS: ToolDescriptionDef[] = []

// ── Parameter-level descriptions ────────────────────────────────────────────

export const TOOL_PARAM_DESCRIPTIONS: ToolParamDef[] = []

// ── Lookup helpers ──────────────────────────────────────────────────────────

export const TOOL_DESC_MAP = new Map(TOOL_DESCRIPTIONS.map(t => [t.key, t]))
export const TOOL_PARAM_MAP = new Map(TOOL_PARAM_DESCRIPTIONS.map(p => [p.key, p]))

export const ALL_TOOL_KEYS = [
  ...TOOL_DESCRIPTIONS.map(t => t.key),
  ...TOOL_PARAM_DESCRIPTIONS.map(p => p.key),
]

export function getDefaultToolDescription(key: string): string | null {
  if (key === 'tools.custom_fields') return '[]'
  return TOOL_DESC_MAP.get(key)?.defaultDescription
    ?? TOOL_PARAM_MAP.get(key)?.defaultDescription
    ?? null
}
