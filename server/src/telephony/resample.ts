/**
 * PCM 16-bit signed LE mono yeniden örnekleme yardımcıları.
 *
 * - Asterisk AudioSocket çıktısı: SLIN 16-bit LE 8 kHz mono
 * - Gemini Live giriş: 16 kHz mono PCM
 * - Gemini Live çıkış: 24 kHz mono PCM
 *
 * Doğrusal interpolasyon yeterli — telefonda 8 kHz Nyquist'i zaten 4 kHz, bu
 * yüzden 24→8 yolunda basit bir tek-pole IIR low-pass ile alias bastırıyoruz.
 */

/** 8 kHz → 16 kHz doğrusal interpolasyon (2x upsample). */
export function upsample8to16(buf: Buffer): Buffer {
  const inSamples = buf.length >> 1
  if (inSamples === 0) return Buffer.alloc(0)
  const outSamples = inSamples * 2
  const out = Buffer.alloc(outSamples * 2)
  let prev = buf.readInt16LE(0)
  for (let i = 0; i < inSamples; i++) {
    const cur = buf.readInt16LE(i * 2)
    out.writeInt16LE(prev, i * 4)
    out.writeInt16LE(((prev + cur) >> 1), i * 4 + 2)
    prev = cur
  }
  return out
}

/**
 * 24 kHz → 8 kHz (3x downsample). 4 kHz üstü için 2-pole cascade IIR low-pass + decimation.
 * State çağrılar arasında korunur; ardışık chunk'larda pop gürültüsü olmaması için
 * arayan, döndürülen state'i bir sonraki çağrıya iletmelidir.
 */
export function downsample24to8(
  buf: Buffer,
  state: { last1: number; last2: number; phase: number } = { last1: 0, last2: 0, phase: 0 },
): { pcm: Buffer; state: { last1: number; last2: number; phase: number } } {
  const inSamples = buf.length >> 1
  if (inSamples === 0) return { pcm: Buffer.alloc(0), state }
  // Two cascaded first-order IIR poles — ~2nd-order Butterworth rolloff
  // α=0.35 gives ~-16dB at 4kHz and ~-24dB at 8kHz (vs old: -3dB and -7dB)
  const ALPHA = 0.35
  const outSamples = Math.ceil((inSamples + state.phase) / 3)
  const out = Buffer.alloc(outSamples * 2)
  let last1 = state.last1
  let last2 = state.last2
  let phase = state.phase
  let outIdx = 0
  for (let i = 0; i < inSamples; i++) {
    const sample = buf.readInt16LE(i * 2)
    last1 = last1 + ALPHA * (sample - last1)
    last2 = last2 + ALPHA * (last1 - last2)
    if (phase === 0) {
      const v = Math.max(-32768, Math.min(32767, Math.round(last2)))
      out.writeInt16LE(v, outIdx * 2)
      outIdx++
      phase = 2
    } else {
      phase--
    }
  }
  const trimmed = outIdx === outSamples ? out : out.subarray(0, outIdx * 2)
  return { pcm: Buffer.from(trimmed), state: { last1, last2, phase } }
}

/**
 * 16 kHz → 24 kHz (1.5x upsample) — yeniden kullanılabilir; şu an telephony
 * akışında ihtiyaç yok ama gelecekte (örn. mevcut web istemcisinden gelen
 * 16 kHz'i Asterisk'e aktarmak gerekirse) işe yarar.
 */
export function upsample16to24(buf: Buffer): Buffer {
  const inSamples = buf.length >> 1
  if (inSamples === 0) return Buffer.alloc(0)
  const outSamples = Math.ceil((inSamples * 24000) / 16000)
  const out = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const srcF = (i * 16000) / 24000
    const srcI = Math.floor(srcF)
    const frac = srcF - srcI
    const s0 = buf.readInt16LE(Math.min(srcI, inSamples - 1) * 2)
    const s1 = buf.readInt16LE(Math.min(srcI + 1, inSamples - 1) * 2)
    out.writeInt16LE(Math.round(s0 + (s1 - s0) * frac), i * 2)
  }
  return out
}
