export interface DicomMetadata {
  summary: Array<{ label: string; value: string }>
  pixelSpacing: string | null
  pixelSpacingValues: [number, number] | null
  numberOfFrames: number
  instanceNumber: number | null
  sliceLocation: number | null
}

type DaikonTag = { value?: unknown; vr?: string; group?: number; element?: number; isPixelData?: () => boolean }
type DaikonImage = {
  tags?: Record<string, DaikonTag>
  getPatientName?: () => unknown; getPatientID?: () => unknown; getStudyDate?: () => unknown; getStudyTime?: () => unknown
  getSeriesDescription?: () => unknown; getModality?: () => unknown; getRows?: () => unknown; getCols?: () => unknown
  getTransferSyntax?: () => unknown; getNumberOfFrames?: () => unknown; getPixelSpacing?: () => unknown
  getImageNumber?: () => unknown; getSliceLocation?: () => unknown
  getTag?: (group: number, element: number) => DaikonTag | undefined
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

const MODALITY_LABELS: Record<string, string> = {
  CT: '3B Dental Tomografi (CBCT)',
  CBCT: '3B Dental Tomografi (CBCT)',
  PX: 'Panoramik Röntgen (PX)',
  PAN: 'Panoramik Röntgen (PAN)',
  OPG: 'Panoramik Röntgen (OPG)',
  IO: 'Ağız İçi Röntgen (IO)',
  DX: 'Dijital Radyografi (DX)',
  CR: 'Bilgisayarlı Radyografi (CR)',
  RG: 'Radyografik Görüntüleme (RG)',
  CEPH: 'Sefalometrik Röntgen',
  MR: 'Manyetik Rezonans (MR)',
  US: 'Ultrasonografi (US)',
  SC: 'İkincil Yakalama Görüntüsü (SC)',
  XC: 'Fotoğraf / Kamera Görüntüsü (XC)',
  OT: 'Diğer Görüntüleme (OT)',
}

function unwrapSingle(value: unknown): unknown {
  let current = value
  while (Array.isArray(current) && current.length > 0) {
    if (current.length > 1 && !(current[0] instanceof Date)) break
    current = current[0]
  }
  return current
}

function asText(value: unknown): string {
  const unwrapped = unwrapSingle(value)
  if (unwrapped === undefined || unwrapped === null || unwrapped === '') return '—'
  if (unwrapped instanceof Date && !Number.isNaN(unwrapped.getTime())) {
    return `${String(unwrapped.getDate()).padStart(2, '0')}.${String(unwrapped.getMonth() + 1).padStart(2, '0')}.${unwrapped.getFullYear()}`
  }
  if (Array.isArray(unwrapped)) return unwrapped.map(asText).join(' \\ ')
  if (unwrapped instanceof Uint8Array) return `[${unwrapped.byteLength} bayt]`
  return String(unwrapped).replace(/\^/g, ' ').replace(/\s+/g, ' ').trim() || '—'
}

export function formatDicomDate(value: unknown): string {
  const unwrapped = unwrapSingle(value)
  if (unwrapped instanceof Date && !Number.isNaN(unwrapped.getTime())) {
    return `${String(unwrapped.getDate()).padStart(2, '0')}.${String(unwrapped.getMonth() + 1).padStart(2, '0')}.${unwrapped.getFullYear()}`
  }
  const raw = asText(unwrapped)
  if (!raw || raw === '—') return '—'

  // Handle JS Date.prototype.toString() e.g. "Mon Dec 01 2003 00:00:00 GMT+0200 (Türkiye Standart Saati)"
  const jsDateMatch = raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s+(\d{4})\b/i)
  if (jsDateMatch) {
    const mm = MONTH_MAP[jsDateMatch[1].slice(0, 3).toLowerCase()] || '01'
    const dd = jsDateMatch[2].padStart(2, '0')
    const yyyy = jsDateMatch[3]
    return `${dd}.${mm}.${yyyy}`
  }

  const dmyTextMatch = raw.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i)
  if (dmyTextMatch) {
    const dd = dmyTextMatch[1].padStart(2, '0')
    const mm = MONTH_MAP[dmyTextMatch[2].slice(0, 3).toLowerCase()] || '01'
    const yyyy = dmyTextMatch[3]
    return `${dd}.${mm}.${yyyy}`
  }

  // Handle DICOM DA "YYYYMMDD"
  const daMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (daMatch) {
    return `${daMatch[3]}.${daMatch[2]}.${daMatch[1]}`
  }

  // Handle ISO "YYYY-MM-DD", "YYYY.MM.DD", "YYYY/MM/DD"
  const isoMatch = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s].*)?$/)
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}.${isoMatch[2].padStart(2, '0')}.${isoMatch[1]}`
  }

  // Handle "DD.MM.YYYY" or "DD/MM/YYYY"
  const trMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (trMatch) {
    return `${trMatch[1].padStart(2, '0')}.${trMatch[2].padStart(2, '0')}.${trMatch[3]}`
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(6, 8)}.${digits.slice(4, 6)}.${digits.slice(0, 4)}`
  }

  return raw
}

export function formatDicomTime(value: unknown): string {
  const raw = asText(value)
  if (!raw || raw === '—') return '—'
  const colonMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (colonMatch) {
    const hh = colonMatch[1].padStart(2, '0')
    const mm = colonMatch[2]
    const ss = colonMatch[3]
    return ss ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`
  }
  const digits = raw.split('.')[0].replace(/\D/g, '')
  if (digits.length >= 6) {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`
  }
  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
  }
  return raw
}

export function formatDicomModality(value: unknown): string {
  const raw = asText(value)
  if (!raw || raw === '—') return '—'
  const upper = raw.toUpperCase().trim()
  if (MODALITY_LABELS[upper]) return MODALITY_LABELS[upper]
  return raw
}

export function formatDicomSex(value: unknown): string {
  const raw = asText(value)
  if (!raw || raw === '—') return '—'
  const upper = raw.toUpperCase().trim()
  if (upper === 'M' || upper === 'MALE' || upper === 'E' || upper === 'ERKEK') return 'Erkek'
  if (upper === 'F' || upper === 'FEMALE' || upper === 'K' || upper === 'KADIN') return 'Kadın'
  if (upper === 'O' || upper === 'OTHER' || upper === 'U' || upper === 'UNKNOWN') return 'Belirtilmedi'
  return raw
}

export function formatDicomPatientName(value: unknown): string {
  const unwrapped = unwrapSingle(value)
  if (unwrapped === undefined || unwrapped === null || unwrapped === '') return '—'
  const raw = String(unwrapped).trim()
  if (!raw || raw === '—') return '—'
  if (raw.includes('^')) {
    const parts = raw
      .split('^')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      // DICOM PN format is LAST^FIRST^MIDDLE
      const [last, ...rest] = parts
      return `${rest.join(' ')} ${last}`.replace(/\s+/g, ' ').trim()
    }
    return parts.join(' ') || '—'
  }
  return raw.replace(/\s+/g, ' ').trim() || '—'
}

export function normalizeMetadataSummary(
  summary: Array<{ label: string; value: string }>
): Array<{ label: string; value: string }> {
  return summary.map(({ label, value }) => {
    const normalizedLabel =
      label === 'Modality'
        ? 'Modalite'
        : label === 'Hasta ID'
          ? 'Hasta No'
          : label === 'Çalışma tarihi'
            ? 'Çekim tarihi'
            : label === 'Çalışma saati'
              ? 'Çekim saati'
              : label
    if (normalizedLabel === 'Doğum tarihi' || normalizedLabel === 'Çekim tarihi') {
      return { label: normalizedLabel, value: formatDicomDate(value) }
    }
    if (normalizedLabel === 'Modalite') {
      return { label: normalizedLabel, value: formatDicomModality(value) }
    }
    if (normalizedLabel === 'Cinsiyet') {
      return { label: normalizedLabel, value: formatDicomSex(value) }
    }
    if (normalizedLabel === 'Çekim saati') {
      return { label: normalizedLabel, value: formatDicomTime(value) }
    }
    return { label: normalizedLabel, value }
  })
}

function parsePixelSpacing(value: unknown): [number, number] | null {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[\\,\s]+/)
  const row = Number(values[0])
  const column = Number(values[1] ?? values[0])
  return Number.isFinite(row) && row > 0 && Number.isFinite(column) && column > 0 ? [row, column] : null
}

function parseOptionalNumber(value: unknown): number | null {
  const unwrapped = unwrapSingle(value)
  if (unwrapped === undefined || unwrapped === null || unwrapped === '') return null
  const num = Number(unwrapped)
  return Number.isFinite(num) ? num : null
}

export async function readDicomMetadata(buffer: ArrayBuffer): Promise<DicomMetadata> {
  // Cornerstone renders pixels; daikon remains the tag reader because it is already a project dependency.
  // @ts-ignore -- daikon does not publish complete TypeScript declarations.
  const daikon = await import('daikon')
  const image = daikon.Series.parseImage(new DataView(buffer)) as DaikonImage | null
  if (!image) throw new Error('Dosya geçerli bir DICOM görüntüsü olarak okunamadı.')

  const rawFrames = parseOptionalNumber(image.getNumberOfFrames?.() ?? image.getTag?.(0x0028, 0x0008)?.value)
  const numberOfFrames = rawFrames && rawFrames > 1 ? Math.floor(rawFrames) : 1
  const instanceNumber = parseOptionalNumber(image.getImageNumber?.() ?? image.getTag?.(0x0020, 0x0013)?.value)
  const sliceLocation = parseOptionalNumber(image.getSliceLocation?.() ?? image.getTag?.(0x0020, 0x1041)?.value)

  const summary = normalizeMetadataSummary(
    [
      ['Hasta adı', formatDicomPatientName(image.getPatientName?.() ?? image.getTag?.(0x0010, 0x0010)?.value)],
      ['Hasta No', asText(image.getPatientID?.() ?? image.getTag?.(0x0010, 0x0020)?.value)],
      ['Doğum tarihi', formatDicomDate(image.getTag?.(0x0010, 0x0030)?.value)],
      ['Cinsiyet', formatDicomSex(image.getTag?.(0x0010, 0x0040)?.value)],
      ['Modalite', formatDicomModality(image.getModality?.() ?? image.getTag?.(0x0008, 0x0060)?.value)],
      ['Seri açıklaması', asText(image.getSeriesDescription?.() ?? image.getTag?.(0x0008, 0x103e)?.value)],
      ['Çekim tarihi', formatDicomDate(image.getStudyDate?.() ?? image.getTag?.(0x0008, 0x0020)?.value)],
      ['Çekim saati', formatDicomTime(image.getStudyTime?.() ?? image.getTag?.(0x0008, 0x0030)?.value)],
      ['Görüntü boyutu', `${asText(image.getCols?.())} × ${asText(image.getRows?.())}`],
      ['Kare sayısı', String(numberOfFrames)],
    ]
      .map(([label, value]) => ({ label: String(label), value: String(value) }))
      .filter(({ value, label }) => value !== '—' && !(label === 'Görüntü boyutu' && value.includes('—')))
  )
  // Pixel Spacing is preferred. Some dental systems store only Imager Pixel
  // Spacing, which is the best available geometric calibration for that image.
  const rawPixelSpacing = image.getPixelSpacing?.() ?? image.getTag?.(0x0018, 0x1164)?.value
  const pixelSpacing = asText(rawPixelSpacing)
  return {
    summary,
    pixelSpacing: pixelSpacing === '—' ? null : pixelSpacing,
    pixelSpacingValues: parsePixelSpacing(rawPixelSpacing),
    numberOfFrames,
    instanceNumber,
    sliceLocation,
  }
}
