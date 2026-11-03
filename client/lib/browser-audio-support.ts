/**
 * Tarayıcının sesli görüşme için gereken özelliklerini denetler.
 * Yalnızca istemci tarafında çağrılmalıdır.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

export type MicrophonePermission = 'granted' | 'denied' | 'prompt' | 'unknown'

export interface BrowserAudioSupport {
  browserName: string
  secureContext: boolean
  microphoneApi: boolean
  audioProcessing: boolean
  microphonePermission: MicrophonePermission
  /** Tüm zorunlu özellikler uygun mu */
  ready: boolean
}

/** Safari için webkit önekli sürümü de dikkate alan yapıcı. */
export function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext || (window as WebkitWindow).webkitAudioContext || null
}

/** Ses bağlamı oluşturur; desteklenmiyorsa hata fırlatır. */
export function createAudioContext(options?: AudioContextOptions): AudioContext {
  const Ctor = getAudioContextConstructor()
  if (!Ctor) throw new Error('Bu tarayıcı ses işlemeyi desteklemiyor')
  return new Ctor(options)
}

export function detectBrowserName(userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge'
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox'
  if (/CriOS\/|Chrome\//.test(userAgent)) return 'Google Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'Bilinmeyen tarayıcı'
}

async function readMicrophonePermission(): Promise<MicrophonePermission> {
  try {
    if (!navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state as MicrophonePermission
  } catch {
    // Firefox ve Safari bu sorguyu desteklemeyebilir
    return 'unknown'
  }
}

export async function checkBrowserAudioSupport(): Promise<BrowserAudioSupport> {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext
  const microphoneApi = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  const ctor = getAudioContextConstructor()
  const audioProcessing = !!ctor && typeof AudioWorkletNode !== 'undefined' && 'audioWorklet' in ctor.prototype
  const microphonePermission = await readMicrophonePermission()
  return {
    browserName: detectBrowserName(),
    secureContext,
    microphoneApi,
    audioProcessing,
    microphonePermission,
    ready: secureContext && microphoneApi && audioProcessing && microphonePermission !== 'denied',
  }
}

/** Kullanıcı jestiyle çağrılmalıdır. Süre boyunca ses seviyesini (0–1) ve darbe/öksürük süzgeci durumunu bildirir. */
export async function runMicrophoneTest(
  onLevel: (level: number, meta?: { suppressed: boolean }) => void,
  durationMs = 3500,
  options?: { noiseFilter?: boolean },
): Promise<{ peak: number; suppressedCount: number }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı mikrofon erişimini desteklemiyor')
  const useFilter = options?.noiseFilter ?? true
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: useFilter,
      autoGainControl: true,
    },
  })
  const context = createAudioContext()
  try {
    await context.resume()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let peak = 0
    let suppressedCount = 0
    let voicedStreak = 0
    let noiseFloor = 0.004
    const started = performance.now()
    await new Promise<void>(resolve => {
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        let maxAbs = 0
        let zc = 0
        let prev = (data[0] - 128) / 128
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          const abs = Math.abs(v)
          if (abs > maxAbs) maxAbs = abs
          sum += v * v
          if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zc++
          prev = v
        }
        const rms = Math.sqrt(sum / data.length)
        const crest = rms > 0.0001 ? maxAbs / rms : 0
        const zcr = zc / data.length
        if (rms < noiseFloor) noiseFloor = noiseFloor * 0.9 + rms * 0.1
        const threshold = Math.max(0.005, noiseFloor * 2.2)

        const isImpulseOrCough = useFilter && rms > threshold && voicedStreak < 4 && (crest > 4.5 || zcr > 0.4)
        let suppressed = false
        let effectiveLevel = Math.min(1, rms * 5)

        if (isImpulseOrCough) {
          suppressed = true
          suppressedCount++
          voicedStreak = 0
          effectiveLevel = 0
        } else if (rms >= threshold) {
          voicedStreak++
          peak = Math.max(peak, effectiveLevel)
        } else {
          voicedStreak = 0
          if (useFilter) effectiveLevel = 0
        }

        onLevel(effectiveLevel, { suppressed })
        if (performance.now() - started >= durationMs) resolve()
        else requestAnimationFrame(tick)
      }
      tick()
    })
    onLevel(0, { suppressed: false })
    return { peak, suppressedCount }
  } finally {
    stream.getTracks().forEach(track => track.stop())
    void context.close().catch(() => {})
  }
}
