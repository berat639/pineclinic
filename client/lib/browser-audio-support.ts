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

/** Kullanıcı jestiyle çağrılmalıdır. Süre boyunca ses seviyesini (0–1) bildirir. */
export async function runMicrophoneTest(
  onLevel: (level: number) => void,
  durationMs = 3000,
): Promise<{ peak: number }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı mikrofon erişimini desteklemiyor')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const context = createAudioContext()
  try {
    await context.resume()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let peak = 0
    const started = performance.now()
    await new Promise<void>(resolve => {
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 5)
        peak = Math.max(peak, level)
        onLevel(level)
        if (performance.now() - started >= durationMs) resolve()
        else requestAnimationFrame(tick)
      }
      tick()
    })
    onLevel(0)
    return { peak }
  } finally {
    stream.getTracks().forEach(track => track.stop())
    void context.close().catch(() => {})
  }
}
