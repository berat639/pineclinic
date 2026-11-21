import { describe, expect, test } from 'bun:test'
import { WebConversationLogStore } from './web-conversation-log'

const callId = 'web_01234567-1234-1234-1234-123456789abc'
const event = (sequence: number, name = 'konuşma_metni', extra = {}) => ({
  event: name, clientSequence: sequence, clientTimestamp: '2026-11-22T12:00:00.123Z', clientElapsedMs: sequence * 100,
  ...(name === 'konuşma_metni' ? { text: 'Merhaba\nNasılsınız?', speaker: 'arayan' } : {}), ...extra,
})
const parse = (line: string) => JSON.parse(line.slice('[KONUSMA] '.length))

describe('Web conversation log ingestion', () => {
  test('preserves browser timing, speaker, text and retry order without credentials', () => {
    const lines: string[] = []
    const logs = new WebConversationLogStore(line => lines.push(line))
    const body = { callId, events: [event(1, 'çağrı_başladı'), event(2)] }
    expect(logs.ingest('clinic-a', 'private-token', body).accepted).toBe(2)
    expect(logs.ingest('clinic-a', 'private-token', body).accepted).toBe(0)
    logs.ingest('clinic-a', 'private-token', { callId, events: [event(3, 'çağrı_bitti')] })
    expect(lines.map(parse).map(e => [e.sequence, e.clientSequence])).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(parse(lines[1]).clientElapsedMs).toBe(200)
    expect(parse(lines[1]).text).toBe('Merhaba\nNasılsınız?')
    expect(parse(lines[1]).channel).toBe('web')
    expect(lines.join('')).not.toContain('private-token')
    expect(lines.every(line => !line.includes('\n'))).toBe(true)
    expect(logs.ingest('clinic-a', 'private-token', { callId, events: [event(4)] }).accepted).toBe(0)
  })

  test('rejects invalid sequence/timing/payload before writing partial batches', () => {
    const lines: string[] = []
    const logs = new WebConversationLogStore(line => lines.push(line))
    for (const body of [
      { callId: 'tel_other', events: [event(1)] },
      { callId, events: [event(2), event(1)] },
      { callId, events: [event(1, 'secret_dump')] },
      { callId, events: [event(1, 'konuşma_metni', { text: 'x'.repeat(4001) })] },
      { callId, events: [event(1), event(2, 'konuşma_metni', { clientElapsedMs: 1 })] },
    ]) expect(() => logs.ingest('clinic-a', 'token', body)).toThrow()
    expect(lines).toHaveLength(0)
  })

  test('isolates session ownership and expires counters without retaining text', () => {
    let time = 0
    const lines: string[] = []
    const logs = new WebConversationLogStore(line => lines.push(line), () => time)
    for (const clinic of ['a', 'b']) logs.ingest(clinic, 'token', { callId, events: [event(1)] })
    expect(lines.map(parse).map(e => e.clinicId)).toEqual(['a', 'b'])
    time = 36 * 60_000
    expect(logs.ingest('a', 'token', { callId, events: [event(2)] }).accepted).toBe(1)
  })
})
