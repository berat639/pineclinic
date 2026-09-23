type DaikonImage = {
  getSeriesInstanceUID?: () => unknown
  getImagePosition?: () => unknown
  getImageDirections?: () => unknown
}

export interface LocalCbctSeries {
  files: File[]
  sliceCount: number
}

function numericVector(value: unknown, expectedLength: number): number[] | null {
  const values = Array.isArray(value) ? value : []
  if (values.length !== expectedLength) return null
  const vector = values.map(Number)
  return vector.every(Number.isFinite) ? vector : null
}

/** Finds one geometrically usable CBCT series without uploading any patient data. */
export async function findLocalCbctSeries(files: File[]): Promise<LocalCbctSeries | null> {
  // @ts-ignore -- daikon does not publish complete TypeScript declarations.
  const daikon = await import('daikon')
  const candidates = await Promise.all(files.map(async (file) => {
    try {
      const image = daikon.Series.parseImage(new DataView(await file.arrayBuffer())) as DaikonImage | null
      const seriesUid = String(image?.getSeriesInstanceUID?.() ?? '')
      const position = numericVector(image?.getImagePosition?.(), 3)
      const directions = numericVector(image?.getImageDirections?.(), 6)
      return seriesUid && position && directions ? { file, seriesUid, position, directions } : null
    } catch { return null }
  }))

  const groups = new Map<string, NonNullable<(typeof candidates)[number]>[]>()
  candidates.filter(Boolean).forEach((candidate) => {
    const item = candidate!
    groups.set(item.seriesUid, [...(groups.get(item.seriesUid) || []), item])
  })
  const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  if (!largest || largest.length < 16) return null

  const [row, column] = [largest[0].directions.slice(0, 3), largest[0].directions.slice(3, 6)]
  const normal = [
    row[1] * column[2] - row[2] * column[1],
    row[2] * column[0] - row[0] * column[2],
    row[0] * column[1] - row[1] * column[0],
  ]
  const ordered = largest.sort((a, b) => {
    const scalar = (position: number[]) => position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2]
    return scalar(a.position) - scalar(b.position)
  })
  const uniquePositions = new Set(ordered.map(({ position }) => position.map((part) => part.toFixed(4)).join(',')))
  if (uniquePositions.size < 16) return null
  return { files: ordered.map(({ file }) => file), sliceCount: ordered.length }
}
