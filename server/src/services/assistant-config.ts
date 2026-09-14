import { getAiModel, getAllPromptSections } from '../db/repositories/settings'
import { PROMPT_SECTION_KEYS, getDefaultPromptValue } from '../data/default-prompts'

export const ALLOWED_LIVE_MODELS = [
  'gemini-3.1-flash-live-preview',
] as const
export const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview'

export async function resolveLiveModel(): Promise<string> {
  const saved = await getAiModel()
  if (saved && (ALLOWED_LIVE_MODELS as readonly string[]).includes(saved)) return saved
  const fromEnv = process.env.GEMINI_LIVE_MODEL
  if (fromEnv && (ALLOWED_LIVE_MODELS as readonly string[]).includes(fromEnv)) return fromEnv
  return DEFAULT_LIVE_MODEL
}

export async function buildSystemPrompt(greeting: string, direction: string = 'inbound'): Promise<string> {
  let dbSections: Record<string, string> = {}
  try {
    const rows = await getAllPromptSections()
    dbSections = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.value]))
  } catch {}

  const parts: string[] = []
  for (const key of PROMPT_SECTION_KEYS) {
    let value = dbSections[key] ?? getDefaultPromptValue(key) ?? ''
    if (key === 'prompt.greeting_flow') {
      if (direction === 'whatsapp') {
        value = 'WhatsApp üzerinden yazılı destek veriyorsun. Kısa ve anlaşılır yanıtlar yaz. Kullanıcıyı her mesajda yeniden karşılama. Telefonla konuşma veya arama başlatma talimatlarını uygulama.'
      } else if (direction === 'outbound') {
        value = `GIDEN ARAMA (OUTBOUND) KARŞILAMA VE GÖREV TALİMATI:
Sen dış arama (outbound call) yapıyorsun. Karşı taraf telefonu açtığında İLK CÜMLE olarak KESİNLİKLE şu giden karşılama mesajını söyle:
"${greeting}"
Ardından konuşma akışındaki adımları sırasıyla uygula.`
      } else {
        value = value.includes('{{greeting}}')
          ? value.replace(/\{\{greeting\}\}/g, greeting)
          : `GELEN ARAMA (INBOUND) KARŞILAMA:\nMüşteri aradığında şu karşılama mesajını söyle: "${greeting}"\nSonra müşterinin ne istediğini dinle ve yardımcı ol.`
      }
    }
    if (value) parts.push(value)
  }

  // Inject conversation flow as prompt text
  try {
    const { getActiveFlow, flowToPromptText } = await import('../db/repositories/flows')
    const flow = await getActiveFlow(direction)
    if (flow) {
      const flowText = flowToPromptText(flow)
      if (flowText) parts.push(flowText)
    }
  } catch {}

  return parts.join('\n\n')
}
