/**
 * PCM 16-bit signed LE mono yeniden örnekleme yardımcıları.
 *
 * - Asterisk AudioSocket çıktısı: SLIN 16-bit LE 8 kHz mono
 * - Gemini Live giriş: 16 kHz mono PCM
 * - Gemini Live çıkış: 24 kHz mono PCM
 *
 * Doğrusal interpolasyon yeterli — telefonda 8 kHz Nyquist'i zaten 4 kHz, bu
 * yüzden 24→8 yolunda 15-tap Hann-windowed FIR low-pass ile alias bastırıyoruz.
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
 * 24 kHz → 8 kHz (3x downsample). 15-tap Hann-windowed FIR low-pass + decimation.
 * fc=4kHz, fs=24kHz — >40dB stopband rejection, linear phase.
 * State çağrılar arasında korunur; ardışık chunk'larda pop gürültüsü olmaması için
 * arayan, döndürülen state'i bir sonraki çağrıya iletmelidir.
 */
const FIR_TAPS = [
  0.0, 0.0, -0.01030, -0.02661, 0.0,
  0.11111, 0.26024, 0.33115, 0.26024, 0.11111,
  0.0, -0.02661, -0.01030, 0.0, 0.0,
]
const FIR_LENGTH = 15

export function downsample24to8(
  buf: Buffer,
  state: { history: number[]; phase: number } = { history: new Array(14).fill(0), phase: 0 },
): { pcm: Buffer; state: { history: number[]; phase: number } } {
  const inSamples = buf.length >> 1
  if (inSamples === 0) return { pcm: Buffer.alloc(0), state }

  // Build combined array: [history(14 samples)] + [new samples]
  const combined: number[] = [...state.history]
  for (let i = 0; i < inSamples; i++) {
    combined.push(buf.readInt16LE(i * 2))
  }

  const outBuf = Buffer.alloc(Math.ceil(inSamples / 3) * 2 + 2)
  let outIdx = 0
  let phase = state.phase

  for (let i = 0; i < inSamples; i++) {
    if (phase === 0) {
      // FIR convolution: tap 0 = newest sample, tap 14 = oldest
      const base = 14 + i  // index of current sample in combined[]
      let sum = 0
      for (let k = 0; k < FIR_LENGTH; k++) {
        sum += FIR_TAPS[k]! * combined[base - k]!
      }
      const v = Math.max(-32768, Math.min(32767, Math.round(sum)))
      outBuf.writeInt16LE(v, outIdx * 2)
      outIdx++
      phase = 2
    } else {
      phase--
    }
  }

  // Keep last 14 samples as new history
  const newHistory = combined.slice(-14)

  return {
    pcm: Buffer.from(outBuf.subarray(0, outIdx * 2)),
    state: { history: newHistory, phase },
  }
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
