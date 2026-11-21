import { afterEach, expect, test } from 'vitest'
import { AudioStreamPlayer } from './audio'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

class Context {
  currentTime = 0
  sampleRate = 24000
  state = 'running'
  destination = {}
  sources: Array<{ buffer: any; onended: (() => void) | null; connect: () => void; start: () => void; stop: () => void }> = []
  constructor() { lastContext = this }
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  createGain() { return { connect() {} } }
  createBuffer(_channels: number, length: number) { return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) } }
  createBufferSource() {
    const source = { buffer: null, onended: null, connect() {}, start() {}, stop() {} }
    this.sources.push(source)
    return source
  }
}
let lastContext: Context
const chunk = Buffer.alloc(4800).toString('base64') // 100 ms PCM

test('playback diagnostics distinguish scheduling, draining and cancellation without stale completion', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } })
  const events: Array<[string, any]> = []
  const player = new AudioStreamPlayer()
  player.setDiagnostics((event, details) => events.push([event, details]))
  player.addChunk(chunk)
  expect(events[0][0]).toBe('asistan_sesi_oynatmaya_planlandı')
  expect(events[0][1].queuedAudioMs).toBeGreaterThanOrEqual(100)
  const old = lastContext.sources[0]
  player.clear()
  expect(events[1][0]).toBe('asistan_sesi_oynatımı_temizlendi')
  expect(events[1][1].discardedAudioMs).toBeGreaterThanOrEqual(100)
  old.onended?.()
  expect(events).toHaveLength(2)
  player.addChunk(chunk)
  lastContext.currentTime = 1
  lastContext.sources[1].onended?.()
  expect(events.at(-1)?.[0]).toBe('asistan_sesi_oynatımı_bitti')
  player.stop()
})
