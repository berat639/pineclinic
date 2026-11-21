import { analyzePcmFrameCharacteristics, type NoiseFilterMode } from '../services/turn-detector'

export class NoiseGate {
  private preRoll: Buffer[] = []
  private trailingFrames = 0
  private wasOpen = false
  private highStreak = 0
  private totalFrames = 0
  private highFrames = 0
  private rmsSum = 0
  private rmsMax = 0
  private lastLogAtFrame = 0
  private filterMode: NoiseFilterMode = 'rnnoise'
  private suppressedImpulses = 0
  private noiseFloor = 140

  constructor(
    readonly threshold: number,
    private readonly trailingFramesMax: number,
    private readonly preRollMax: number,
    private readonly shortId: string,
    private readonly logIntervalFrames = 500,
  ) { }

  setFilterMode(mode: NoiseFilterMode): void {
    this.filterMode = mode
  }

  /** Son process() çağrısında gate açık mıydı (konuşma algılandı mı). */
  get isOpen(): boolean { return this.wasOpen }

  /** 8 kHz Int16 LE frame'i (320 byte / 20 ms) işle; konuşma varsa frame'leri ve kapanış bilgisini döndür. */
  process(frame: Buffer): { frames: Buffer[]; justClosed: boolean; speechStarted: boolean } {
    this.totalFrames++
    const chars = analyzePcmFrameCharacteristics(frame)
    const rms = chars.rms
    this.rmsSum += rms
    if (rms > this.rmsMax) this.rmsMax = rms

    // threshold === 0 (varsayılan): GEÇİRGEN mod. Arayanın sesi her karede Gemini'ye
    // aktarılır ve konuşma algılamayı Gemini'nin kendi VAD'ı yapar. Kısık 8 kHz hatlarda
    // adaptif RMS kapısı hiç açılmadığı için arayanın sesi hiç iletilmiyordu.
    // Yerel adaptif algılama yalnızca `isOpen` bilgisi (AI konuşurken yankı koruması ve
    // ölçümü) için kullanılır; audioStreamEnd üretmez.
    if (this.threshold === 0) {
      return this.processPassThrough(frame, chars)
    }

    // Gürültü ve öksürük süzgeci açıkken anlık darbe/öksürük/tıklama patlamalarını süz
    if (this.filterMode === 'rnnoise' && chars.isImpulseLike && this.highStreak < 5) {
      this.suppressedImpulses++
      const silence = Buffer.alloc(frame.length, 0)
      this.pushPreRoll(silence)
      return { frames: [], justClosed: false, speechStarted: false }
    }

    const openThreshold = this.threshold
    const sustainThreshold = Math.max(185, Math.round(openThreshold * 0.65))
    const activeThreshold = this.wasOpen ? sustainThreshold : openThreshold

    const isHigh = rms >= activeThreshold
    if (isHigh) this.highFrames++

    this.maybeLog()

    if (isHigh) {
      this.highStreak++
      // 3 ardışık 20 ms karesi (60 ms) gerçek ses başlangıcı için yeterlidir;
      // preRoll (120 ms) sayesinde ilk hece hiç kaybolmaz.
      const requiredStreak = 3
      if (!this.wasOpen && this.highStreak < requiredStreak) {
        this.pushPreRoll(frame)
        return { frames: [], justClosed: false, speechStarted: false }
      }
      this.trailingFrames = Math.max(8, this.trailingFramesMax)
      if (!this.wasOpen) {
        const flushed = this.preRoll
        this.preRoll = []
        this.wasOpen = true
        return { frames: [...flushed, frame], justClosed: false, speechStarted: true }
      }
      this.wasOpen = true
      return { frames: [frame], justClosed: false, speechStarted: false }
    }

    this.highStreak = 0
    if (rms < 340) {
      this.noiseFloor = 0.97 * this.noiseFloor + 0.03 * rms
    }

    if (this.trailingFrames > 0) {
      this.trailingFrames--
      if (this.trailingFrames === 0) {
        this.pushPreRoll(frame)
        this.wasOpen = false
        // Konuşma bitti (trailing sonu) -> Hybrid VAD audioStreamEnd tetikler
        return { frames: [frame], justClosed: true, speechStarted: false }
      }
      this.wasOpen = true
      return { frames: [frame], justClosed: false, speechStarted: false }
    }

    this.pushPreRoll(frame)
    this.wasOpen = false
    return { frames: [], justClosed: false, speechStarted: false }
  }

  /** Geçirgen mod: her kare iletilir; yalnızca konuşma dışındaki tekil darbeler sessizleştirilir. */
  private processPassThrough(
    frame: Buffer,
    chars: ReturnType<typeof analyzePcmFrameCharacteristics>,
  ): { frames: Buffer[]; justClosed: boolean; speechStarted: boolean } {
    const rms = chars.rms
    const openThreshold = Math.max(200, Math.min(420, Math.round(this.noiseFloor * 2.2)))
    const sustainThreshold = Math.max(150, Math.round(openThreshold * 0.65))
    const isHigh = rms >= (this.wasOpen ? sustainThreshold : openThreshold)
    if (isHigh) this.highFrames++
    this.maybeLog()

    // Konuşma sürmüyorken gelen tekil tık/öksürük darbesini sessizlik karesiyle değiştir
    // (zaman çizelgesi korunur, Gemini'nin VAD zamanlaması bozulmaz).
    if (
      this.filterMode === 'rnnoise' &&
      chars.isImpulseLike &&
      !this.wasOpen &&
      this.highStreak === 0 &&
      chars.crestFactor > 6
    ) {
      this.suppressedImpulses++
      return { frames: [Buffer.alloc(frame.length, 0)], justClosed: false, speechStarted: false }
    }

    let speechStarted = false
    let justClosed = false
    if (isHigh) {
      this.highStreak++
      if (!this.wasOpen && this.highStreak >= 3) {
        this.wasOpen = true
        speechStarted = true
      }
      if (this.wasOpen) this.trailingFrames = Math.max(8, this.trailingFramesMax)
    } else {
      this.highStreak = 0
      if (rms < 340) this.noiseFloor = 0.97 * this.noiseFloor + 0.03 * rms
      if (this.trailingFrames > 0) {
        this.trailingFrames--
        if (this.trailingFrames === 0) {
          justClosed = this.wasOpen
          this.wasOpen = false
        }
      } else {
        this.wasOpen = false
      }
    }
    return { frames: [frame], justClosed, speechStarted }
  }

  private pushPreRoll(frame: Buffer): void {
    const maxFrames = Math.max(6, this.preRollMax)
    this.preRoll.push(frame)
    if (this.preRoll.length > maxFrames) this.preRoll.shift()
  }

  private maybeLog(): void {
    const elapsed = this.totalFrames - this.lastLogAtFrame
    if (elapsed < this.logIntervalFrames) return
    const avg = Math.round(this.rmsSum / elapsed)
    const pct = Math.round((this.highFrames / elapsed) * 100)
    console.log(
      `[${this.shortId}] NoiseGate: ${elapsed}fr | avg=${avg} max=${Math.round(this.rmsMax)} high=${pct}% | thresh=${this.threshold}`,
    )
    this.lastLogAtFrame = this.totalFrames
    this.rmsSum = 0
    this.highFrames = 0
    this.rmsMax = 0
  }
}

