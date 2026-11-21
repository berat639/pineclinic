import { afterEach, describe, expect, test } from 'vitest'
import { BrowserConversationLog } from './conversation-log'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('Browser conversation diagnostics', () => {
  test('serializes batches, timestamps and closure with the existing session credential', async () => {
    const bodies: any[] = []
    globalThis.fetch = (async (_url, options) => {
      expect((options?.headers as Record<string, string>)['x-flow-session-key']).toBe('session-token')
      bodies.push(JSON.parse(options?.body as string))
      return new Response('{}')
    }) as typeof fetch
    const log = new BrowserConversationLog('session-token')
    log.event('konuşma_metni', { speaker: 'arayan', text: 'Merhaba' })
    log.event('konuşma_metni', { speaker: 'asistan', text: 'İyi günler' })
    log.end()
    await log.flush()
    const events = bodies.flatMap(body => body.events)
    expect(events.map(event => event.clientSequence)).toEqual([1, 2, 3, 4])
    expect(events.at(-1).event).toBe('çağrı_bitti')
    expect(bodies[0].callId).toMatch(/^web_/)
    expect(events[1].text).toBe('Merhaba')
    expect(JSON.stringify(bodies)).not.toContain('session-token')
  })

  test('retries a failed batch unchanged and keeps following events ordered', async () => {
    const sent: any[] = []
    globalThis.fetch = (async (_url, options) => {
      sent.push(JSON.parse(options?.body as string))
      return new Response('{}', { status: sent.length === 1 ? 503 : 200 })
    }) as typeof fetch
    const log = new BrowserConversationLog('token')
    for (let i = 0; i < 12; i++) log.event('asistan_sesi_alındı')
    log.end()
    await log.flush()
    expect(sent[0]).toEqual(sent[1])
    const uniqueEvents = sent.slice(1).flatMap(body => body.events)
    expect(uniqueEvents.map(event => event.clientSequence)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
  })
})
