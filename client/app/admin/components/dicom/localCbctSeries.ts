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
  // A directory picker can include unrelated files when the user selects the
  // MyDentViewer export root. More importantly, reading a full CBCT directory
  // with Promise.all holds hundreds of ArrayBuffers in memory at once. Parse
  // only DICOM files one by one so a valid, large local study is not mistaken
  // for an invalid series under browser memory pressure.
  const dicomFiles = files.filter((file) => /\.dcm$/i.test(file.name) || /dicom/i.test(file.type))
  const candidates: Array<{ file: File; seriesUid: string; position: number[]; directions: number[] }> = []
  for (const file of dicomFiles) {
    try {
      const image = daikon.Series.parseImage(new DataView(await file.arrayBuffer())) as DaikonImage | null
      const seriesUid = String(image?.getSeriesInstanceUID?.() ?? '')
      const position = numericVector(image?.getImagePosition?.(), 3)
      const directions = numericVector(image?.getImageDirections?.(), 6)
      if (seriesUid && position && directions) candidates.push({ file, seriesUid, position, directions })
    } catch {
      // A directory may contain a non-DICOM file with a .dcm extension. It
      // must not prevent the remaining slices from being inspected.
    }
  }

  const groups = new Map<string, (typeof candidates)[number][]>()
  candidates.forEach((item) => {
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
