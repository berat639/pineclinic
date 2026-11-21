import { describe, expect, test } from 'bun:test'
import { runWithTenantContext } from './tenancy/context'
import { createLiveSession, type SessionCallbacks } from './gemini'

// Read-only prompt resolution uses the same local settings as existing voice tests.
// The Live connection and tools' transport are in memory; no phone call is made.
async function harness() {
  let receive!: (message: any) => Promise<void>
  let config: any
  const transcripts: Array<[string, string]> = []
  const audio: Buffer[] = []
  const toolResponses: any[] = []
  const clientContents: any[] = []
  let interruptions = 0
  let hangups = 0
  const transport = {
    sendClientContent(content: any) { clientContents.push(content) }, sendRealtimeInput() {}, close() {},
    sendToolResponse(response: any) { toolResponses.push(response) },
  }
  const ai = { live: { async connect(options: any) {
    receive = options.callbacks.onmessage
    config = options.config
    queueMicrotask(() => receive({ setupComplete: {} }))
    return transport
  } } }
  const callbacks: SessionCallbacks = {
    onReady() {}, onAudio: pcm => { audio.push(pcm) },
    onTranscript: (role, text) => { transcripts.push([role, text]) },
    onInterrupted() { interruptions++ }, onTurnComplete() {},
    onHangup() { hangups++ }, onClose() {}, onError(error) { throw error },
  }
  const session = await runWithTenantContext({ clinicId: '00000000-0000-0000-0000-000000000000', hostname: 'test.invalid' }, () => createLiveSession(ai as any, callbacks, {
    dbSessionId: 'conversation-test', systemPrompt: 'Türkçe klinik asistanı.',
    model: 'gemini-3.8-live', telephonyChannel: 'test-channel',
  }))
  return { receive, config, transcripts, audio, toolResponses, clientContents, session,
    get interruptions() { return interruptions }, get hangups() { return hangups } }
}

describe('Live phone conversation message handling', () => {
  test('retains caller transcript carried with interruption, discarding stale model audio', async () => {
    const h = await harness()
    try {
      await h.receive({ serverContent: {
        interrupted: true,
        inputTranscription: { text: 'Cümlemi bitirmemi bekler misin?' },
        outputTranscription: { text: 'Eski yanıt' },
        modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(10).toString('base64') } }] },
      } })
      expect(h.interruptions).toBe(1)
      expect(h.transcripts).toEqual([['user', 'Cümlemi bitirmemi bekler misin?']])
      expect(h.audio).toHaveLength(0)
      expect(h.config.inputAudioTranscription.languageCodes).toEqual(['tr-TR'])
    } finally { h.session.close() }
  })

  test('rejects mistaken hangup on feedback but accepts a new explicit hangup in same packet', async () => {
    const h = await harness()
    try {
      await h.receive({ serverContent: { inputTranscription: { text: 'Sesimi duyuyor musun?' } } })
      await h.receive({ toolCall: { functionCalls: [{ id: 'first', name: 'cagriySonlandir', args: {} }] } })
      await Bun.sleep(0)
      expect(h.hangups).toBe(0)
      expect(h.toolResponses.at(-1)?.functionResponses[0].response.success).toBe(false)
      // A model response closes the preceding input transcript turn.
      await h.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(10).toString('base64') } }] } } })
      await h.receive({
        serverContent: { inputTranscription: { text: 'Tamam görüşmeyi kapat.' } },
        toolCall: { functionCalls: [{ id: 'second', name: 'cagriySonlandir', args: {} }] },
      })
      await Bun.sleep(0)
      expect(h.hangups).toBe(1)
    } finally { h.session.close() }
  })
})


test('does not generate a language recovery turn after hangup has started', async () => {
  const h = await harness()
  try {
    await h.receive({ serverContent: { inputTranscription: { text: 'Görüşmeyi kapat.' } } })
    await h.receive({ toolCall: { functionCalls: [{ id: 'close', name: 'cagriySonlandir', args: {} }] } })
    await Bun.sleep(0)
    expect(h.hangups).toBe(1)
    await h.receive({ serverContent: { outputTranscription: { text: 'This process is now complete.' } } })
    expect(h.clientContents).toHaveLength(0)
  } finally { h.session.close() }
})
