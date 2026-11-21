type Details = { text?: string; speaker?: 'arayan' | 'asistan'; queuedAudioMs?: number; discardedAudioMs?: number; scheduledDelayMs?: number; code?: string }
type Event = Details & { event: string; clientSequence: number; clientTimestamp: string; clientElapsedMs: number }

/** Batches metadata and transcripts; never delays audio or uploads PCM/API keys. */
export class BrowserConversationLog {
  readonly callId = `web_${crypto.randomUUID()}`
  private readonly started = performance.now()
  private sequence = 0
  private ended = false
  private queue: Event[] = []
  private timer?: ReturnType<typeof setTimeout>
  private pending: Promise<void> = Promise.resolve()
  private sending = false
  private readonly onPageHide = () => this.end()

  constructor(private readonly token: string) {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide)
    this.event('çağrı_başladı')
  }

  event(event: string, details: Details = {}): void {
    if (this.ended || this.sequence >= 20_000 || this.queue.length >= 128) return
    this.queue.push({ ...details, ...(details.text === undefined ? {} : { text: details.text.slice(0, 4_000) }), event,
      clientSequence: ++this.sequence, clientTimestamp: new Date().toISOString(),
      clientElapsedMs: Math.round(performance.now() - this.started) })
    if (this.queue.length >= 8) this.flush()
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.sending) return this.pending
    this.sending = true
    this.pending = (async () => {
      while (this.queue.length) {
        const batch = this.queue.splice(0, 8)
        while (batch.length > 1 && new TextEncoder().encode(JSON.stringify({ callId: this.callId, events: batch })).length > 48_000) {
          const overflow = batch.pop()
          if (overflow) this.queue.unshift(overflow)
        }
        // One bounded queue preserves order; server deduplicates a retried batch.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await fetch('/api/conversation-logs', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'x-flow-session-key': this.token },
              body: JSON.stringify({ callId: this.callId, events: batch }), keepalive: true,
              signal: AbortSignal.timeout(5_000),
            })
            if (response.ok || response.status < 500) break
          } catch { /* Diagnostics must never interrupt a conversation. */ }
        }
      }
    })().catch(() => {}).finally(() => {
      this.sending = false
      if (this.queue.length) void this.flush()
    })
    return this.pending
  }

  end(): void {
    if (this.ended) return
    if (this.queue.length >= 128) this.queue.pop()
    this.event('çağrı_bitti')
    this.ended = true
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide)
    this.flush()
  }
}
