export interface DecodedLocalDicomVolume {
  scalarData: Float32Array
  dimensions: readonly [number, number, number]
  spacing: readonly [number, number, number]
  origin: readonly [number, number, number]
  direction: number[]
  metadata: Record<string, unknown>
}

type DaikonTag = { value?: unknown }
type DaikonImage = {
  getRows?: () => unknown
  getCols?: () => unknown
  getPixelSpacing?: () => unknown
  getImagePosition?: () => unknown
  getImageDirections?: () => unknown
  getSliceThickness?: () => unknown
  getInterpretedData?: () => unknown
  getModality?: () => unknown
  getPhotometricInterpretation?: () => unknown
  getNumberOfSamplesPerPixel?: () => unknown
  getTag?: (group: number, element: number) => DaikonTag | undefined
}

type DecodedSlice = {
  pixels: ArrayLike<number>
  position: number[]
  projection: number
}

function finiteVector(value: unknown, length: number): number[] | null {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? Array.from(value as ArrayLike<unknown>) : []
  if (source.length !== length) return null
  const output = source.map(Number)
  return output.every(Number.isFinite) ? output : null
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function tagText(image: DaikonImage, group: number, element: number): string {
  const value = image.getTag?.(group, element)?.value
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '')
}

/**
 * Decodes an ordered local CBCT series without a network round-trip or a
 * browser worker. Daikon handles Part-10 parsing and applies rescale values in
 * getInterpretedData; Cornerstone receives one calibrated physical volume.
 */
export async function decodeLocalDicomVolume(
  files: File[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<DecodedLocalDicomVolume> {
  if (files.length < 2) throw new Error('CBCT hacmi için en az iki DICOM dilimi gerekir.')

  // @ts-ignore -- daikon does not publish complete TypeScript declarations.
  const daikon = await import('daikon')
  const slices: DecodedSlice[] = []
  let rows = 0
  let columns = 0
  let rowSpacing = 1
  let columnSpacing = 1
  let sliceThickness = 1
  let direction: number[] | null = null
  let normal: number[] | null = null
  let firstImage: DaikonImage | null = null

  for (let index = 0; index < files.length; index += 1) {
    const buffer = await files[index].arrayBuffer()
    const image = daikon.Series.parseImage(new DataView(buffer)) as DaikonImage | null
    if (!image) throw new Error(`${files[index].name} geçerli bir DICOM dilimi değil.`)

    const nextRows = Number(image.getRows?.())
    const nextColumns = Number(image.getCols?.())
    const position = finiteVector(image.getImagePosition?.(), 3)
    const orientation = finiteVector(image.getImageDirections?.(), 6)
    const pixels = image.getInterpretedData?.() as ArrayLike<number> | null | undefined
    if (!nextRows || !nextColumns || !position || !orientation || !pixels) {
      throw new Error(`${files[index].name} hacim geometrisi veya piksel verisi eksik.`)
    }
    if (pixels.length < nextRows * nextColumns) {
      throw new Error(`${files[index].name} piksel tamponu beklenenden kısa.`)
    }

    if (!firstImage) {
      firstImage = image
      rows = nextRows
      columns = nextColumns
      const pixelSpacing = finiteVector(image.getPixelSpacing?.(), 2)
      rowSpacing = positiveNumber(pixelSpacing?.[0], 1)
      columnSpacing = positiveNumber(pixelSpacing?.[1], rowSpacing)
      sliceThickness = positiveNumber(image.getSliceThickness?.(), 1)
      const rowAxis = orientation.slice(0, 3)
      const columnAxis = orientation.slice(3, 6)
      normal = [
        rowAxis[1] * columnAxis[2] - rowAxis[2] * columnAxis[1],
        rowAxis[2] * columnAxis[0] - rowAxis[0] * columnAxis[2],
        rowAxis[0] * columnAxis[1] - rowAxis[1] * columnAxis[0],
      ]
      const normalLength = Math.hypot(...normal) || 1
      normal = normal.map((value) => value / normalLength)
      direction = [...rowAxis, ...columnAxis, ...normal]
    } else if (nextRows !== rows || nextColumns !== columns) {
      throw new Error('CBCT serisindeki DICOM dilim boyutları birbiriyle uyuşmuyor.')
    }

    const projection = position.reduce((sum, value, axis) => sum + value * normal![axis], 0)
    slices.push({ pixels, position, projection })
    onProgress?.(index + 1, files.length)
  }

  slices.sort((left, right) => left.projection - right.projection)
  const sliceSpacing = median(slices.slice(1).map((slice, index) => Math.abs(slice.projection - slices[index].projection))) || sliceThickness
  const sliceLength = rows * columns
  const scalarData = new Float32Array(sliceLength * slices.length)
  slices.forEach((slice, sliceIndex) => {
    const offset = sliceIndex * sliceLength
    for (let pixelIndex = 0; pixelIndex < sliceLength; pixelIndex += 1) {
      scalarData[offset + pixelIndex] = Number(slice.pixels[pixelIndex]) || 0
    }
  })

  const frameOfReferenceUID = tagText(firstImage!, 0x0020, 0x0052) || `local-cbct-${Date.now()}`
  const modality = String(firstImage!.getModality?.() ?? 'CT')
  const photometricInterpretation = String(firstImage!.getPhotometricInterpretation?.() ?? 'MONOCHROME2')
  const samplesPerPixel = positiveNumber(firstImage!.getNumberOfSamplesPerPixel?.(), 1)

  return {
    scalarData,
    dimensions: [columns, rows, slices.length],
    spacing: [columnSpacing, rowSpacing, sliceSpacing],
    origin: slices[0].position as [number, number, number],
    direction: direction!,
    metadata: {
      FrameOfReferenceUID: frameOfReferenceUID,
      Modality: modality,
      Rows: rows,
      Columns: columns,
      PixelSpacing: [rowSpacing, columnSpacing],
      ImageOrientationPatient: direction!.slice(0, 6),
      PhotometricInterpretation: photometricInterpretation,
      SamplesPerPixel: samplesPerPixel,
      BitsAllocated: 32,
      BitsStored: 32,
      HighBit: 31,
      PixelRepresentation: 1,
    },
  }
}
