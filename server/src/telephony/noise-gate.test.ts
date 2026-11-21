import { describe, expect, test } from 'bun:test'
import { NoiseGate } from './noise-gate'

function voice(amplitude: number): Buffer {
  const frame = Buffer.alloc(320)
  for (let i = 0; i < 160; i++) frame.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 250 * i / 8000) * amplitude), i * 2)
  return frame
}

describe('Phone input continuity', () => {
  test('preserves quiet first syllables, full speech, and pauses byte for byte', () => {
    const gate = new NoiseGate(0, 11, 6, 'test')
    const input = [voice(100), voice(140), voice(300), ...Array.from({ length: 20 }, () => voice(1800)), ...Array.from({ length: 40 }, () => Buffer.alloc(320))]
    const output = input.flatMap(frame => gate.process(frame).frames)
    expect(Buffer.concat(output)).toEqual(Buffer.concat(input))
    expect(output).toHaveLength(input.length)
  })

  test('replaces isolated lighter clicks with silence without removing time', () => {
    const gate = new NoiseGate(0, 11, 6, 'test')
    const click = Buffer.alloc(320)
    click.writeInt16LE(22000, 20)
    click.writeInt16LE(-21000, 22)
    const result = gate.process(click)
    expect(result.frames).toHaveLength(1)
    expect(result.frames[0]).toEqual(Buffer.alloc(320))
    expect(result.speechStarted).toBe(false)
    expect(gate.isOpen).toBe(false)
    expect(gate.process(voice(150)).frames[0]).toEqual(voice(150))
  })

  test('reports local speech end once while continuing to stream silence', () => {
    const gate = new NoiseGate(0, 11, 6, 'test')
    for (let i = 0; i < 10; i++) gate.process(voice(1800))
    const results = Array.from({ length: 35 }, () => gate.process(Buffer.alloc(320)))
    expect(results.filter(result => result.justClosed)).toHaveLength(1)
    expect(results.every(result => result.frames.length === 1)).toBe(true)
    expect(gate.isOpen).toBe(false)
  })

  test('explicit RMS gate still preserves pre-roll when activated', () => {
    const gate = new NoiseGate(400, 11, 6, 'test')
    const onset = voice(140)
    gate.process(onset)
    gate.process(voice(1800))
    gate.process(voice(1800))
    const result = gate.process(voice(1800))
    expect(result.speechStarted).toBe(true)
    expect(result.frames[0]).toEqual(onset)
  })
})
