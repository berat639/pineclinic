import { GoogleGenAI, Modality, Type, type FunctionDeclaration } from '@google/genai'

export interface WhatsAppLiveInput {
  model: string; systemPrompt: string; text: string; tools: FunctionDeclaration[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** One bounded Live session per message. Durable conversation state belongs to PostgreSQL. */
export async function generateWhatsAppReply(input: WhatsAppLiveInput, ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })) {
  let session: Awaited<ReturnType<typeof ai.live.connect>> | undefined
  let settled = false
  let transcript = ''
  let toolCount = 0
  let chain = Promise.resolve()
  let readyResolve!: () => void
  let rejectReply!: (e: Error) => void
  let resolveReply!: (text: string) => void
  const ready = new Promise<void>(resolve => { readyResolve = resolve })
  const reply = new Promise<string>((resolve, reject) => { resolveReply = resolve; rejectReply = reject })
  // The connection may fail before awaiting reply; attach a rejection handler immediately.
  void reply.catch(() => {})
  const fail = (error: Error) => {
    if (settled) return
    settled = true; rejectReply(error); readyResolve()
    try { session?.close() } catch {}
  }
  const timeout = setTimeout(() => fail(new Error('AI yanıt süresi aşıldı.')), 60_000)
  try {
    const connecting = ai.live.connect({
      model: input.model,
      config: { responseModalities: [Modality.AUDIO], outputAudioTranscription: {},
        systemInstruction: input.systemPrompt, tools: [{ functionDeclarations: input.tools }] },
      callbacks: {
        onmessage: message => {
          if (message.setupComplete) readyResolve()
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
        onerror: () => fail(new Error('Gemini Live bağlantısı kurulamadı.')),
        onclose: () => { if (!settled) fail(new Error('Gemini Live bağlantısı kapandı.')) },
      },
    })
    // Close late connections too, including when the setup deadline expires.
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
  name: 'insanaAktar', description: 'Kullanıcı personel istediğinde sohbeti personele devreder ve otomatik yanıtları durdurur.',
  parameters: { type: Type.OBJECT, properties: {} },
}
