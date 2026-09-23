export interface DicomMetadata {
  summary: Array<{ label: string; value: string }>
  pixelSpacing: string | null
  pixelSpacingValues: [number, number] | null
}

type DaikonTag = { value?: unknown; vr?: string; group?: number; element?: number; isPixelData?: () => boolean }
type DaikonImage = {
  tags?: Record<string, DaikonTag>
  getPatientName?: () => unknown; getPatientID?: () => unknown; getStudyDate?: () => unknown; getStudyTime?: () => unknown
  getSeriesDescription?: () => unknown; getModality?: () => unknown; getRows?: () => unknown; getCols?: () => unknown
  getTransferSyntax?: () => unknown; getNumberOfFrames?: () => unknown; getPixelSpacing?: () => unknown
  getTag?: (group: number, element: number) => DaikonTag | undefined
}

function asText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) return value.map(asText).join(' \\ ')
  if (value instanceof Uint8Array) return `[${value.byteLength} bytes]`
  return String(value).replace(/\^/g, ' ').trim() || '—'
}

function formatStudyDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value)
  }
  const raw = asText(value)
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw
}

function formatStudyTime(value: unknown): string {
  const raw = asText(value)
  const match = raw.match(/^(\d{2})(\d{2})(\d{2})/)
  return match ? `${match[1]}:${match[2]}:${match[3]}` : raw
}

function parsePixelSpacing(value: unknown): [number, number] | null {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\\,\s]+/)
  const row = Number(values[0])
  const column = Number(values[1] ?? values[0])
  return Number.isFinite(row) && row > 0 && Number.isFinite(column) && column > 0 ? [row, column] : null
}

export async function readDicomMetadata(buffer: ArrayBuffer): Promise<DicomMetadata> {
  // Cornerstone renders pixels; daikon remains the tag reader because it is already a project dependency.
  // @ts-ignore -- daikon does not publish complete TypeScript declarations.
  const daikon = await import('daikon')
  const image = daikon.Series.parseImage(new DataView(buffer)) as DaikonImage | null
  if (!image) throw new Error('Dosya geçerli bir DICOM görüntüsü olarak okunamadı.')

  const summary = [
    ['Hasta adı', asText(image.getPatientName?.())],
    ['Hasta ID', asText(image.getPatientID?.())],
    ['Doğum tarihi', formatStudyDate(image.getTag?.(0x0010, 0x0030)?.value)],
    ['Modality', asText(image.getModality?.())],
    ['Seri açıklaması', asText(image.getSeriesDescription?.())],
    ['Çalışma tarihi', formatStudyDate(image.getStudyDate?.())],
    ['Çalışma saati', formatStudyTime(image.getStudyTime?.())],
    ['Görüntü boyutu', `${asText(image.getCols?.())} × ${asText(image.getRows?.())}`],
    ['Kare sayısı', asText(image.getNumberOfFrames?.())],
  ].map(([label, value]) => ({ label: String(label), value: String(value) }))
    .filter(({ value, label }) => value !== '—' && !(label === 'Görüntü boyutu' && value.includes('—')))
  // Pixel Spacing is preferred. Some dental systems store only Imager Pixel
  // Spacing, which is the best available geometric calibration for that image.
  const rawPixelSpacing = image.getPixelSpacing?.() ?? image.getTag?.(0x0018, 0x1164)?.value
  const pixelSpacing = asText(rawPixelSpacing)
  return { summary, pixelSpacing: pixelSpacing === '—' ? null : pixelSpacing, pixelSpacingValues: parsePixelSpacing(rawPixelSpacing) }
}
