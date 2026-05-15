/**
 * In-process async mutex — serializes concurrent async operations
 * within a single process. Use alongside Redlock for multi-instance safety.
 */
export class AsyncMutex {
  private queue: Array<() => void> = []
  private locked = false

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve()
      } else {
        this.queue.push(resolve)
      }
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.locked = false
    }
  }
}
