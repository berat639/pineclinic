import { describe, expect, test, vi } from 'vitest'
import { AiLiveSession, type LiveChatCallbacks } from './ai-live'
import { isEnglishResponseDetected } from './turn-detector'

function harness(result = { success: true }) {
  const callbacks: LiveChatCallbacks = {
    onAudioChunk: vi.fn(), onText: vi.fn(), onTurnComplete: vi.fn(), onConnectionChange: vi.fn(),
    onError: vi.fn(), onInterrupted: vi.fn(), onHangup: vi.fn(),
  }
  const live = new AiLiveSession(callbacks)
  const state = live as any
  state._isConnected = true
  state.session = { sendToolResponse: vi.fn(), sendClientContent: vi.fn() }
  state.toolHandler = vi.fn(async () => result)
  const receive = (content: any) => state.handleMessage({ serverContent: content })
  const hangup = async () => {
    state.handleMessage({ toolCall: { functionCalls: [{ name: 'cagriySonlandir', id: 'hangup', args: {} }] } })
    await Promise.resolve()
    await Promise.resolve()
  }
  return { callbacks, state, receive, hangup }
}

const farewell = 'Görüşmemizi sonlandırıyorum, sağlıklı günler dilerim.'
const audio = { parts: [{ inlineData: { data: 'AAAA' } }] }

describe('Web farewell lifecycle', () => {
  test('does not re-prompt after spoken farewell and successful hangup; queued farewell can drain', async () => {
    const h = harness()
    h.receive({ outputTranscription: { text: farewell }, modelTurn: audio })
    await h.hangup()
    expect(h.state.session.sendToolResponse).not.toHaveBeenCalled()
    expect(h.callbacks.onHangup).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onInterrupted).not.toHaveBeenCalled()
    h.receive({ outputTranscription: { text: 'This process is now complete.' }, modelTurn: audio })
    expect(h.callbacks.onAudioChunk).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onText).toHaveBeenCalledTimes(1)
    h.receive({ turnComplete: true })
    expect(h.callbacks.onHangup).toHaveBeenCalledTimes(1)
  })
  test('allows one Turkish farewell when tool returns before any farewell', async () => {
    const h = harness()
    await h.hangup()
    expect(h.state.session.sendToolResponse).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onHangup).not.toHaveBeenCalled()
    h.receive({ outputTranscription: { text: farewell }, modelTurn: audio })
    h.receive({ turnComplete: true, interactionStatus: 'IN_PROGRESS' })
    expect(h.callbacks.onAudioChunk).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onHangup).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onTurnComplete).not.toHaveBeenCalled()
  })
  test('does not close the connection on failed hangup', async () => {
    const h = harness({ success: false })
    await h.hangup()
    h.receive({ outputTranscription: { text: 'Tekrar deneyelim.' }, modelTurn: audio, turnComplete: true })
    expect(h.callbacks.onHangup).not.toHaveBeenCalled()
    expect(h.callbacks.onTurnComplete).toHaveBeenCalledTimes(1)
  })
  test('blocks an English closing suffix without asking the model to speak again', () => {
    const h = harness()
    h.receive({ outputTranscription: { text: farewell }, modelTurn: audio })
    h.receive({ outputTranscription: { text: 'This process is ' }, modelTurn: audio })
    expect(h.callbacks.onAudioChunk).toHaveBeenCalledTimes(1)
    expect(h.callbacks.onHangup).toHaveBeenCalledTimes(1)
    expect(h.state.session.sendClientContent).not.toHaveBeenCalled()
  })
})

describe('Mixed language output guard', () => {
  test.each([
    farewell + 'This process is now complete.', farewell + ' This process is ',
    'Merhaba. Hello, how can I help you?',
    'Size yardımcı olabilirim This process is now complete.',
    'İşlem tamamlandı. Your appointment is confirmed.',
  ])('detects English after Turkish: %s', text => { expect(isEnglishResponseDetected(text)).toBe(true) })
  test.each([
    farewell, 'Tamam, test sonuçlarınızı kontrol ediyorum.', 'Merhaba, size nasıl yardımcı olabilirim?',
    'Size implant ve kanal tedavisi hakkında bilgi verebilirim.', 'Welcome isimli salona aktaracağım.',
  ])('preserves Turkish responses and quoted names: %s', text => { expect(isEnglishResponseDetected(text)).toBe(false) })
})
