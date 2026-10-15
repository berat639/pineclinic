import type { CprOptions, CprResult, CprVolume } from './cprReconstruction'

type Request = { id: number; options: CprOptions; resolve: (result: CprResult) => void; reject: (error: Error) => void }

/** Keep one running request and only the newest waiting request. */
export class CprWorkerClient {
  private worker: Worker
  private sequence = 0
  private busy = false
  private initialized = false
  private current?: Request
  private pending?: Request
  private failure?: Error

  constructor(private volume: CprVolume) {
    this.worker = new Worker(new URL('./cpr.worker.ts', import.meta.url))
    this.worker.onmessage = (event: MessageEvent<{ id: number; result?: CprResult; error?: string }>) => {
      const { id, result, error } = event.data
      if (this.current?.id === id) {
        if (result) this.current.resolve(result)
        else this.current.reject(new Error(error || 'CPR sonucu alınamadı.'))
        this.current = undefined
      }
      this.busy = false
      this.pump()
    }
    this.worker.onerror = () => {
      this.failure = new Error('CPR arka plan hesaplaması başlatılamadı veya durdu. Görüntüyü yeniden açın.')
      this.current?.reject(this.failure)
      this.pending?.reject(this.failure)
      this.current = this.pending = undefined
      this.worker.terminate()
    }
  }

  reconstruct(options: CprOptions): Promise<CprResult> {
    if (this.failure) return Promise.reject(this.failure)
    this.cancel()
    return new Promise((resolve, reject) => {
      this.pending = { id: ++this.sequence, options, resolve, reject }
      this.pump()
    })
  }

  cancel() {
    const error = new DOMException('CPR isteği yenilendi.', 'AbortError')
    this.current?.reject(error)
    this.pending?.reject(error)
    this.current = this.pending = undefined
  }

  private pump() {
    if (this.busy || !this.pending || this.failure) return
    this.current = this.pending
    this.pending = undefined
    this.busy = true
    try {
      // Copy the source once, leaving Cornerstone's volume buffer intact.
      this.worker.postMessage({ id: this.current.id, options: this.current.options, ...(!this.initialized ? { volume: this.volume } : {}) })
      this.initialized = true
    } catch (error) {
      this.current.reject(error instanceof Error ? error : new Error('CPR hacmi aktarılamadı.'))
      this.current = undefined
      this.busy = false
    }
  }

  dispose() {
    this.cancel()
    this.failure = new Error('CPR işçisi kapatıldı.')
    this.worker.terminate()
  }
}
