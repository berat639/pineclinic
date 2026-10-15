export interface DentalSegmentatorArchResult {
  points: Array<{ x: number; y: number }>
  jaw: 'upper' | 'lower'
  axialSlice: number
  confidence: number
  durationMs?: number
  device?: string
  model?: string
}

interface DentalSegmentatorJob {
  id: string
  status: 'queued' | 'running' | 'complete' | 'failed'
  progress?: string
  result?: DentalSegmentatorArchResult
  error?: string
}

export async function runDentalSegmentator(
  files: File[],
  preferredSlice?: number,
  options: { signal?: AbortSignal; onProgress?: (progress: string) => void } = {},
): Promise<DentalSegmentatorArchResult> {
  const body = new FormData()
  files.forEach((file) => body.append('files', file, file.name || 'slice.dcm'))
  if (Number.isFinite(preferredSlice)) body.append('preferred_slice', String(Math.round(Number(preferredSlice))))
  const response = await fetch('/api/dental-segmentator/arch', { method: 'POST', body, signal: options.signal })
  const payload = await response.json().catch(() => ({})) as DentalSegmentatorJob & { error?: string }
  if (!response.ok || !payload.id) throw new Error(payload.error || 'DentalSegmentator servisine ulaşılamadı.')

  for (;;) {
    if (options.signal?.aborted) throw new DOMException('İstek iptal edildi.', 'AbortError')
    const jobResponse = await fetch(`/api/dental-segmentator/jobs/${encodeURIComponent(payload.id)}`, { signal: options.signal, cache: 'no-store' })
    const job = await jobResponse.json().catch(() => ({})) as DentalSegmentatorJob & { error?: string }
    if (!jobResponse.ok) throw new Error(job.error || 'DentalSegmentator işi okunamadı.')
    options.onProgress?.(job.progress || job.status)
    if (job.status === 'complete' && job.result) return job.result
    if (job.status === 'failed') throw new Error(job.error || 'DentalSegmentator inference başarısız.')
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 500)
      options.signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('İstek iptal edildi.', 'AbortError')) }, { once: true })
    })
  }
}
