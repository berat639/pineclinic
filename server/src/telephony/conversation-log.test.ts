import { describe, expect, test } from 'bun:test'
import { ConversationLog } from './conversation-log'

describe('ConversationLog', () => {
  test('keeps concurrent calls isolated and escapes multiline transcript text', () => {
    const lines: string[] = []
    let elapsed = 100
    const clock = () => elapsed
    const wall = () => new Date('2026-11-22T09:00:00.123Z')
    const first = new ConversationLog('call-1', line => lines.push(line), wall, clock)
    const second = new ConversationLog('call-2', line => lines.push(line), wall, clock)
    first.event('başladı')
    elapsed += 42
    second.event('konuşma_metni', { text: 'Merhaba\nDünya' })
    first.event('konuşma_metni', { text: 'İyi günler' })
    const events = lines.map(line => JSON.parse(line.slice('[KONUSMA] '.length)))
    expect(events.map(e => [e.callId, e.sequence, e.elapsedMs])).toEqual([
      ['call-1', 1, 0], ['call-2', 1, 42], ['call-1', 2, 42],
    ])
    expect(events[1].text).toBe('Merhaba\nDünya')
    expect(events[0].timestamp).toBe('2026-11-22T09:00:00.123Z')
    expect(lines.every(line => !line.includes('\n'))).toBe(true)
  })

  test('ends once and ignores late callbacks', () => {
    const lines: string[] = []
    const log = new ConversationLog('call-1', line => lines.push(line))
    log.end()
    log.end()
    log.event('geç_gelen_metin')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0].slice('[KONUSMA] '.length)).event).toBe('çağrı_bitti')
  })
})
