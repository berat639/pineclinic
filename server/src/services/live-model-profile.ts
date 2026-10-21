/** Live model capabilities kept in one place for web and phone sessions. */
export const LIVE_MODEL_OPTIONS = [
  {
    id: 'gemini-3.8-live',
    title: 'Akıcı',
    description: 'Günlük hasta görüşmeleri için en hızlı doğal diyalog.',
  },
  {
    id: 'gemini-3.8-live-extended-thinking',
    title: 'Düşünen',
    description: 'Çok adımlı talepleri ve uzun süren araç işlemlerini değerlendirir.',
  },
] as const

export type LiveModelId = typeof LIVE_MODEL_OPTIONS[number]['id']
export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export const DEFAULT_LIVE_MODEL: LiveModelId = 'gemini-3.8-live'
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'LOW'
export const ALLOWED_LIVE_MODELS = LIVE_MODEL_OPTIONS.map(option => option.id) as readonly LiveModelId[]

export function isLiveModel(value: string | null | undefined): value is LiveModelId {
  return Boolean(value && (ALLOWED_LIVE_MODELS as readonly string[]).includes(value))
}

export function isThinkingModel(model: string): boolean {
  return model === 'gemini-3.8-live-extended-thinking'
}

export function normalizeThinkingLevel(value: string | null | undefined): ThinkingLevel {
  const normalized = value?.toUpperCase()
  return normalized === 'MEDIUM' || normalized === 'HIGH' || normalized === 'LOW'
    ? normalized
    : DEFAULT_THINKING_LEVEL
}

/** Extended Thinking only accepts asynchronous tool declarations. */
export function prepareLiveToolDeclarations<T extends object>(model: string, declarations: T[]): T[] {
  if (!isThinkingModel(model)) return declarations
  return declarations.map(declaration => ({ ...declaration, behavior: 'NON_BLOCKING' }) as T)
}
