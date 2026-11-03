import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'
import { getGeminiClient } from './gemini-client'
import { recordAiTokenUsage } from '../db/repositories/ai-usage'
import { currentClinicId } from '../tenancy/context'
import { getPromptTemplate, renderPromptTemplate } from '../prompts/registry'

export interface WhatsAppLiveInput {
  model: string
  textModel?: string
  useLiveAudio?: boolean
  clinicId?: string
  systemPrompt: string
  text: string
  tools: FunctionDeclaration[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
  onUsage?: (usage: { promptTokens: number; responseTokens: number; totalTokens: number; model: string }) => void
}

const DEFAULT_WHATSAPP_TEXT_MODEL = 'gemini-3.8-flash'
const DEFAULT_WHATSAPP_LIVE_RULES =
  'Kısa Türkçe yanıtlar ver. Randevu işleminden önce kullanıcıdan tarih/saat ve isim için açık onay al. Araç başarı sonucunu almadan işlem yapıldı deme. Her kullanıcı mesajında en fazla bir randevu oluştur. Başka numaralara ait kişisel bilgi sorgulama. Personel istendiğinde insanaAktar kullan.'

async function resolveWhatsAppSystemInstruction(basePrompt: string, clinicId?: string): Promise<string> {
  const effectiveClinicId = clinicId ?? (currentClinicId() || undefined)
  const rawTpl = await getPromptTemplate('prompt.whatsapp_live_rules', effectiveClinicId).catch(() => '')
  const rules = renderPromptTemplate(rawTpl.trim() || DEFAULT_WHATSAPP_LIVE_RULES, {}).trim() || DEFAULT_WHATSAPP_LIVE_RULES
  if (basePrompt.includes(DEFAULT_WHATSAPP_LIVE_RULES)) {
    return basePrompt.replace(DEFAULT_WHATSAPP_LIVE_RULES, rules)
  }
  if (basePrompt.includes(rules)) {
    return basePrompt
  }
  return basePrompt ? `${basePrompt}\n\n${rules}` : rules
}

/**
 * Generates a WhatsApp text reply using the fast text/chat model (generateContent + function calling)
 * by default, with an optional fallback to Gemini Live audio transcription if `useLiveAudio` is enabled.
 */
export async function generateWhatsAppReply(
  input: WhatsAppLiveInput,
  ai?: GoogleGenAI,
): Promise<string> {
  const client = ai ?? await getGeminiClient()
  const canUseTextModel = !input.useLiveAudio && typeof client?.models?.generateContent === 'function'
  if (canUseTextModel) {
    return generateWhatsAppReplyText(input, client)
  }
  return generateWhatsAppReplyLive(input, client)
}

async function generateWhatsAppReplyText(
  input: WhatsAppLiveInput,
  ai: GoogleGenAI,
): Promise<string> {
  const textModel = (input.textModel || process.env.GEMINI_TEXT_MODEL || DEFAULT_WHATSAPP_TEXT_MODEL).trim()
  const systemInstruction = await resolveWhatsAppSystemInstruction(input.systemPrompt, input.clinicId)
  const contents: Array<Record<string, unknown>> = [
    { role: 'user', parts: [{ text: input.text }] },
  ]
  let toolCount = 0

  for (let round = 0; round < 8; round++) {
    const response = await ai.models.generateContent({
      model: textModel,
      contents: contents as any,
      config: {
        systemInstruction,
        tools: input.tools.length > 0 ? [{ functionDeclarations: input.tools }] : undefined,
      },
    })

    const meta = (response as any).usageMetadata
    if (meta) {
      const promptTokens = Number(meta.promptTokenCount ?? 0)
      const responseTokens = Number(meta.candidatesTokenCount ?? 0)
      const totalTokens = Number(meta.totalTokenCount ?? promptTokens + responseTokens)
      if (totalTokens > 0) {
        void recordAiTokenUsage({ source: 'whatsapp', promptTokens, responseTokens, totalTokens, callCount: round === 0 ? 1 : 0 })
        input.onUsage?.({ promptTokens, responseTokens, totalTokens, model: textModel })
      }
    }

    const functionCalls = response.functionCalls ?? []
    if (functionCalls.length === 0) {
      const answer = response.text?.trim()
      if (!answer) throw new Error('AI metin yanıtı üretmedi.')
      return answer
    }

    contents.push({
      role: 'model',
      parts: functionCalls.map(call => ({
        functionCall: { name: call.name, args: call.args ?? {} },
      })),
    })

    const functionResponses: Array<Record<string, unknown>> = []
    for (const call of functionCalls) {
      if (++toolCount > 8) throw new Error('AI işlem sınırı aşıldı.')
      const result = await input.executeTool(call.name || '', (call.args as Record<string, unknown>) || {})
      functionResponses.push({
        functionResponse: {
          name: call.name || '',
          response: result,
        },
      })
    }

    contents.push({
      role: 'user',
      parts: functionResponses,
    })
  }

  throw new Error('AI işlem sınırı aşıldı.')
}

/** One bounded Live session per message. Durable conversation state belongs to PostgreSQL. */
export async function generateWhatsAppReplyLive(
  input: WhatsAppLiveInput,
  ai?: GoogleGenAI,
): Promise<string> {
  const client = ai ?? await getGeminiClient()
  let session: Awaited<ReturnType<typeof client.live.connect>> | undefined
  let settled = false
  let transcript = ''
  let toolCount = 0
  let chain = Promise.resolve()
  let readyResolve!: () => void
  let rejectReply!: (e: Error) => void
  let resolveReply!: (text: string) => void
  const ready = new Promise<void>(resolve => { readyResolve = resolve })
  const reply = new Promise<string>((resolve, reject) => { resolveReply = resolve; rejectReply = reject })
  void reply.catch(() => {})
  const fail = (error: Error) => {
    if (settled) return
    settled = true; rejectReply(error); readyResolve()
    try { session?.close() } catch {}
  }
  const timeout = setTimeout(() => fail(new Error('AI yanıt süresi aşıldı.')), 60_000)
  try {
    const systemInstruction = await resolveWhatsAppSystemInstruction(input.systemPrompt, input.clinicId)
    const connecting = client.live.connect({
      model: input.model,
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        systemInstruction,
        tools: [{ functionDeclarations: input.tools }],
      },
      callbacks: {
        onmessage: message => {
          if (message.setupComplete) readyResolve()
          const meta = (message as any).usageMetadata
          if (meta) {
            const promptTokens = Number(meta.promptTokenCount ?? 0)
            const responseTokens = Number(meta.responseTokenCount ?? meta.candidatesTokenCount ?? 0)
            const totalTokens = Number(meta.totalTokenCount ?? promptTokens + responseTokens)
            if (totalTokens > 0) {
              void recordAiTokenUsage({ source: 'whatsapp', promptTokens, responseTokens, totalTokens })
              input.onUsage?.({ promptTokens, responseTokens, totalTokens, model: input.model })
            }
          }
          chain = chain.then(async () => {
            if (settled) return
            for (const call of message.toolCall?.functionCalls || []) {
              if (++toolCount > 8) { fail(new Error('AI işlem sınırı aşıldı.')); return }
              const response = await input.executeTool(call.name || '', call.args as Record<string, unknown> || {})
              if (!settled) session?.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response }] })
            }
            const content = message.serverContent
            if (content?.outputTranscription?.text) transcript += content.outputTranscription.text
            if (content?.interrupted) { fail(new Error('AI yanıtı kesildi.')); return }
            if (content?.turnComplete) {
              if (!transcript.trim()) { fail(new Error('AI metin yanıtı üretmedi.')); return }
              settled = true; resolveReply(transcript.trim())
            }
          }).catch(() => fail(new Error('AI işlem hatası.')))
        },
        onerror: () => fail(new Error('Canlı AI bağlantısı kurulamadı.')),
        onclose: () => { if (!settled) fail(new Error('Canlı AI bağlantısı kapandı.')) },
      },
    })
    void connecting.then(s => { if (settled) s.close() }).catch(() => {})
    session = await Promise.race([connecting, reply.then(() => { throw new Error('Bağlantı süresi aşıldı.') })])
    await Promise.race([ready, reply])
    if (!settled) session.sendRealtimeInput({ text: input.text })
    return await reply
  } finally {
    settled = true; clearTimeout(timeout)
    try { session?.close() } catch {}
  }
}

export const handoffDeclaration: FunctionDeclaration = {
  name: 'insanaAktar',
  description: 'Kullanıcı personel istediğinde sohbeti personele devreder ve otomatik yanıtları durdurur.',
  parameters: { type: Type.OBJECT, properties: {} },
}
