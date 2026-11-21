/** One stdout line per event; transcript timestamps are receipt times, not word alignment. */
export class ConversationLog {
  private sequence = 0
  private readonly started: number
  private ended = false

  constructor(
    private readonly callId: string,
    private readonly write: (line: string) => void = console.log,
    private readonly wallNow: () => Date = () => new Date(),
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {
    this.started = monotonicNow()
  }

  event(event: string, details: Record<string, unknown> = {}): void {
    if (this.ended) return
    this.write(`[KONUSMA] ${JSON.stringify({
      ...details,
      callId: this.callId,
      sequence: ++this.sequence,
      timestamp: this.wallNow().toISOString(),
      elapsedMs: Math.round(this.monotonicNow() - this.started),
      event,
    })}`)
  }

  end(): void {
    if (this.ended) return
    this.event('çağrı_bitti')
    this.ended = true
  }
}
