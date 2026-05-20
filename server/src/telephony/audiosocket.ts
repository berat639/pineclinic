/**
 * Asterisk AudioSocket protokol köprüsü.
 *
 * Çerçeve formatı (https://github.com/CyCoreSystems/audiosocket):
 *   byte 0       : type
 *   bytes 1-2    : payload length (uint16 big-endian)
 *   bytes 3..n+2 : payload
 *
 * Type değerleri:
 *   0x00  Hangup     (payload boş)
 *   0x01  UUID       (16-byte raw UUID — Asterisk UNIQUEID'in raw hali)
 *   0x10  Audio      (SLIN 16-bit LE 8 kHz mono PCM, ~20 ms = 320 bayt)
 *   0xff  Error      (1-byte hata kodu)
 *
 * Yön: Asterisk → bridge yalnızca yukarıdaki frame'leri yollar.
 *      Bridge → Asterisk için 0x10 audio frame'leri ile geri yazarız.
 */

export const AS_TYPE_HANGUP = 0x00
export const AS_TYPE_UUID = 0x01
export const AS_TYPE_AUDIO = 0x10
export const AS_TYPE_ERROR = 0xff

/** 20 ms @ 8 kHz mono SLIN = 160 sample * 2 bayt */
export const AS_FRAME_BYTES = 320

export type AudioSocketEvent =
  | { type: 'uuid'; uuid: string }
  | { type: 'audio'; pcm: Buffer }
  | { type: 'hangup' }
  | { type: 'error'; code: number }

/**
 * Stream-friendly frame parser. Asterisk frame'leri TCP üzerinde tam paket
 * gelmek zorunda değildir; parser internal buffer'a ekleyip tam frame'ler
 * çıkararak çağırana iletir.
 */
export class AudioSocketParser {
  private buffer: Buffer = Buffer.alloc(0)

  /** Yeni gelen baytları işle; tam frame'ler için event listesi döndür. */
  push(chunk: Buffer | Uint8Array): AudioSocketEvent[] {
    const out: AudioSocketEvent[] = []
    const incoming: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.buffer =
      this.buffer.length === 0
        ? incoming
        : (Buffer.concat([this.buffer, incoming]) as unknown as Buffer)

    while (this.buffer.length >= 3) {
      const type = this.buffer[0]!
      const len = this.buffer.readUInt16BE(1)
      const total = 3 + len
      if (this.buffer.length < total) break

      const payload = this.buffer.subarray(3, total)
      this.buffer = this.buffer.subarray(total)

      switch (type) {
        case AS_TYPE_HANGUP:
          out.push({ type: 'hangup' })
          break
        case AS_TYPE_UUID:
          out.push({ type: 'uuid', uuid: formatUuid(payload) })
          break
        case AS_TYPE_AUDIO:
          if (len > 0) out.push({ type: 'audio', pcm: Buffer.from(payload) })
          break
        case AS_TYPE_ERROR:
          out.push({ type: 'error', code: len > 0 ? payload[0]! : 0 })
          break
        default:
          // unknown — sessiz at
          break
      }
    }

    return out
  }
}

/**
 * 16 bayt raw UUID → kanonik (8-4-4-4-12) hex string.
 * Asterisk UNIQUEID epoch.seq formatındadır (örn. "1684492800.42") — AudioSocket
 * bu string'i UTF-8 olarak göndermek yerine genelde 16 bayt raw atar. Eğer
 * uzunluk 16 değilse string olarak yorumlanır.
 */
function formatUuid(buf: Buffer): string {
  if (buf.length !== 16) return buf.toString('utf-8').trim()
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** SLIN 16-bit LE 8 kHz PCM payload'unu 0x10 frame'i olarak encode et. */
export function encodeAudioFrame(pcm: Buffer): Buffer {
  const header = Buffer.alloc(3)
  header[0] = AS_TYPE_AUDIO
  header.writeUInt16BE(pcm.length, 1)
  return Buffer.concat([header, pcm])
}

/** Hangup frame'i — bridge taraflı normalde gönderilmez ama API uyumluluğu için. */
export function encodeHangupFrame(): Buffer {
  return Buffer.from([AS_TYPE_HANGUP, 0x00, 0x00])
}

/**
 * 24 kHz Gemini çıktısı: değişken uzunlukta gelir. Asterisk SLIN 8 kHz akışı
 * için sabit ~20 ms = 320 bayt frame'lere bölmek istiyoruz. Bu yardımcı, bir
 * akümülatör tutar; her çağrıda tam frame'leri encode edip döndürür, artakalanı
 * bir sonraki çağrı için saklar.
 */
export class FrameChunker {
  private acc: Buffer = Buffer.alloc(0)
  /** İçerideki SLIN 8 kHz payload'larını AS_FRAME_BYTES büyüklüğünde frame'lere böl. */
  chunk(pcm8: Buffer): Buffer[] {
    const frames: Buffer[] = []
    this.acc =
      this.acc.length === 0
        ? pcm8
        : (Buffer.concat([this.acc, pcm8]) as unknown as Buffer)
    while (this.acc.length >= AS_FRAME_BYTES) {
      const slice = this.acc.subarray(0, AS_FRAME_BYTES)
      frames.push(encodeAudioFrame(slice))
      this.acc = this.acc.subarray(AS_FRAME_BYTES)
    }
    return frames
  }
  /** Akışın sonunda artakalan kısa bir frame'i (eğer varsa) zero-pad ederek tahliye et. */
  flush(): Buffer | null {
    if (this.acc.length === 0) return null
    const pad = Buffer.alloc(AS_FRAME_BYTES - this.acc.length)
    const padded = Buffer.concat([this.acc, pad])
    this.acc = Buffer.alloc(0)
    return encodeAudioFrame(padded)
  }
}
