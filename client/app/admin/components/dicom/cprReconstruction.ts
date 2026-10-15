/** Client-side dental curved planar reformation (CPR). */
export interface CprVolume {
  scalarData: ArrayLike<number>
  dimensions: readonly [number, number, number] | number[]
  /** Voxel pitch in millimetres, ordered i/j/k. */
  spacing?: readonly [number, number, number] | number[]
  /** DICOM-LPS origin of voxel [0,0,0], in millimetres. */
  origin?: readonly [number, number, number] | number[]
  /** Row-major 3×3 index-axis direction matrix. */
  direction?: readonly number[] | number[]
}

export type CprProjection = 'AVG' | 'MIP'
export type CprPoint = { x: number; y: number }

export interface CprSection {
  image: ImageData
  widthMm: number
  heightMm: number
  /** Absolute arc-length position of the section centre. */
  positionMm: number
  /** Offset from the selected section centre. */
  offsetMm: number
  valid: boolean
}

export interface CprResult {
  panorama: ImageData
  crossSections: CprSection[]
  arcLengthMm: number
  selectedPositionMm: number
  selectedPositionNormalized: number
}

/** One panorama per volume/settings; serial-section navigation reuses it. */
export interface CprPanoramaCache {
  volume?: CprVolume
  key?: string
  image?: ImageData
}

export interface CprOptions {
  arch?: CprPoint[]
  panoramaWidth?: number
  panoramaHeight?: number
  panoramaThicknessMm?: number
  panoramaProjection?: CprProjection
  selectedPosition?: number
  crossSectionCount?: number
  crossSectionStepMm?: number
  crossSectionThicknessMm?: number
  crossSectionWidthMm?: number
}

export type CprArchFrame = CprPoint & {
  distanceMm: number
  tangent: CprPoint
  normal: CprPoint
}

type SamplePoint = CprPoint & { distanceMm: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function scalarAt(volume: CprVolume, x: number, y: number, z: number): number | null {
  const [width, height, depth] = volume.dimensions
  if (x < 0 || y < 0 || z < 0 || x > width - 1 || y > height - 1 || z > depth - 1) return null
  const x0 = Math.floor(x), x1 = Math.min(width - 1, x0 + 1), tx = x - x0
  const y0 = Math.floor(y), y1 = Math.min(height - 1, y0 + 1), ty = y - y0
  const z0 = Math.floor(z), z1 = Math.min(depth - 1, z0 + 1), tz = z - z0
  const value = (ix: number, iy: number, iz: number) => Number(volume.scalarData[ix + iy * width + iz * width * height])
  const values = [
    value(x0, y0, z0), value(x1, y0, z0), value(x0, y1, z0), value(x1, y1, z0),
    value(x0, y0, z1), value(x1, y0, z1), value(x0, y1, z1), value(x1, y1, z1),
  ]
  if (!values.every(Number.isFinite)) return null
  const x00 = values[0] * (1 - tx) + values[1] * tx
  const x10 = values[2] * (1 - tx) + values[3] * tx
  const x01 = values[4] * (1 - tx) + values[5] * tx
  const x11 = values[6] * (1 - tx) + values[7] * tx
  return (x00 * (1 - ty) + x10 * ty) * (1 - tz) + (x01 * (1 - ty) + x11 * ty) * tz
}

function percentileTone(values: number[], lowPercentile = 0.02, highPercentile = 0.995) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b)
  const low = finite[Math.floor(finite.length * lowPercentile)] ?? 0
  const high = finite[Math.floor(finite.length * highPercentile)] ?? low + 1
  return (value: number) => Math.round(clamp((value - low) / Math.max(1e-6, high - low), 0, 1) * 255)
}

function defaultDentalArch(width: number, height: number, samples: number): CprPoint[] {
  return Array.from({ length: samples }, (_, index) => {
    const t = index / Math.max(1, samples - 1)
    return {
      x: width * (0.12 + t * 0.76),
      y: height * (0.36 + 0.22 * Math.pow((t - 0.5) * 2, 2)),
    }
  })
}

/**
 * Convert editable control points into a smooth clinical arch. Uniform
 * Catmull-Rom interpolation passes through every control point and avoids the
 * abrupt angle changes produced by a piecewise-linear curve.
 */
export function interpolateDentalArch(arch: CprPoint[], samplesPerSegment = 10): CprPoint[] {
  if (arch.length < 3) return arch.map((point) => ({ ...point }))
  const result: CprPoint[] = []
  const steps = Math.max(2, Math.round(samplesPerSegment))
  for (let segment = 0; segment < arch.length - 1; segment++) {
    const p0 = arch[Math.max(0, segment - 1)]
    const p1 = arch[segment]
    const p2 = arch[segment + 1]
    const p3 = arch[Math.min(arch.length - 1, segment + 2)]
    for (let step = 0; step < steps; step++) {
      const t = step / steps
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  result.push({ ...arch[arch.length - 1] })
  return result
}

function tangent(arch: SamplePoint[], index: number, sx: number, sy: number) {
  // Derive the section angle across roughly one tooth width. Using immediately
  // adjacent sub-millimetre samples makes the normal react to tiny spline
  // variations and produces visibly unstable/tilted serial sections.
  const halfWindowMm = 2.5
  let beforeIndex = index
  let afterIndex = index
  while (beforeIndex > 0 && arch[index].distanceMm - arch[beforeIndex].distanceMm < halfWindowMm) beforeIndex--
  while (afterIndex < arch.length - 1 && arch[afterIndex].distanceMm - arch[index].distanceMm < halfWindowMm) afterIndex++
  const before = arch[beforeIndex]
  const after = arch[afterIndex]
  const dxMm = (after.x - before.x) * sx
  const dyMm = (after.y - before.y) * sy
  const lengthMm = Math.hypot(dxMm, dyMm) || 1
  return { x: dxMm / lengthMm, y: dyMm / lengthMm }
}

/** Resample a control polyline at constant physical arc-length intervals. */
export function resampleDentalArch(arch: CprPoint[], sampleCount: number, spacing: readonly [number, number]): SamplePoint[] {
  const [sx, sy] = spacing
  arch = interpolateDentalArch(arch)
  const lengths = [0]
  for (let index = 1; index < arch.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot((arch[index].x - arch[index - 1].x) * sx, (arch[index].y - arch[index - 1].y) * sy))
  }
  const totalLength = lengths[lengths.length - 1]
  if (totalLength <= 0) return Array.from({ length: sampleCount }, () => ({ ...arch[0], distanceMm: 0 }))
  return Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const target = totalLength * sampleIndex / Math.max(1, sampleCount - 1)
    let segment = 1
    while (segment < lengths.length - 1 && lengths[segment] < target) segment++
    const start = arch[segment - 1]
    const end = arch[segment]
    const segmentLength = lengths[segment] - lengths[segment - 1] || 1
    const progress = (target - lengths[segment - 1]) / segmentLength
    return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, distanceMm: target }
  })
}

/** Finds the anterior apex of a U-shaped arch as a normalized arc position.
 * The distance from the posterior endpoint chord is rotation-independent and
 * remains correct for scans exported in either anterior/posterior direction. */
export function dentalArchApexPosition(
  arch: CprPoint[],
  spacing: readonly [number, number],
  sampleCount = 600,
): number {
  if (arch.length < 3) return 0.5
  const sampled = resampleDentalArch(arch, Math.max(3, sampleCount), spacing)
  const first = sampled[0]
  const last = sampled[sampled.length - 1]
  const chordX = (last.x - first.x) * spacing[0]
  const chordY = (last.y - first.y) * spacing[1]
  const chordLength = Math.hypot(chordX, chordY)
  if (chordLength < 1e-6) return 0.5
  let apexIndex = Math.floor(sampled.length / 2)
  let greatestDistance = -1
  sampled.forEach((point, index) => {
    const pointX = (point.x - first.x) * spacing[0]
    const pointY = (point.y - first.y) * spacing[1]
    const distance = Math.abs(chordX * pointY - chordY * pointX) / chordLength
    if (distance > greatestDistance) {
      greatestDistance = distance
      apexIndex = index
    }
  })
  return apexIndex / Math.max(1, sampled.length - 1)
}

/** One physical frame shared by CPR sampling and all angle overlays. */
export function dentalArchFrameAt(
  arch: CprPoint[],
  position: number,
  spacing: readonly [number, number],
  sampleCount = 500,
): CprArchFrame {
  const sampled = resampleDentalArch(arch, Math.max(2, sampleCount), spacing)
  const index = Math.round(clamp(position, 0, 1) * (sampled.length - 1))
  const point = sampled[index]
  const direction = tangent(sampled, index, spacing[0], spacing[1])
  return {
    ...point,
    tangent: direction,
    normal: { x: -direction.y, y: direction.x },
  }
}

function combineSamples(samples: Array<number | null>, projection: CprProjection): number {
  const finite = samples.filter((sample): sample is number => sample !== null && Number.isFinite(sample))
  if (!finite.length) return Number.NaN
  if (projection === 'MIP') return Math.max(...finite)

  // Dental panoramic reconstruction uses a focal trough rather than giving
  // every parallel slab equal visibility. A Gaussian centre weighting keeps
  // the selected arch sharp and suppresses the neighbouring slice layers
  // which otherwise appear as repeated contours/bands in the panorama.
  const centre = (samples.length - 1) / 2
  const sigma = Math.max(0.75, samples.length * 0.2)
  let weightedSum = 0
  let weightSum = 0
  samples.forEach((sample, index) => {
    if (sample === null || !Number.isFinite(sample)) return
    const normalized = (index - centre) / sigma
    const weight = Math.exp(-0.5 * normalized * normalized)
    weightedSum += sample * weight
    weightSum += weight
  })
  return weightSum > 0 ? weightedSum / weightSum : Number.NaN
}

function imageDataFromSamples(samples: number[], imageWidth: number, imageHeight: number, tone: (value: number) => number) {
  const rgba = new Uint8ClampedArray(imageWidth * imageHeight * 4)
  samples.forEach((value, index) => {
    const valid = Number.isFinite(value)
    const pixel = valid ? tone(value) : 0
    const offset = index * 4
    rgba[offset] = pixel
    rgba[offset + 1] = pixel
    rgba[offset + 2] = pixel
    // Keep derived medical images fully opaque. Transparent out-of-volume
    // pixels exposed the Cornerstone coronal/sagittal viewport mounted below
    // the CPR canvas, making it look as if source slices were mixed into the
    // panoramic image.
    rgba[offset + 3] = 255
  })
  return new ImageData(rgba, imageWidth, imageHeight)
}

/** Produces one panoramic CPR and serial thin sections centred on the selected arc position. */
export function reconstructDentalCpr(volume: CprVolume, options: CprOptions = {}, cache?: CprPanoramaCache): CprResult {
  const [volumeWidth, volumeHeight, volumeDepth] = volume.dimensions.map(Number)
  if (![volumeWidth, volumeHeight, volumeDepth].every((value) => Number.isInteger(value) && value >= 2)) {
    throw new Error('CPR için geçerli hacim boyutları gerekli.')
  }
  if (volume.scalarData.length < volumeWidth * volumeHeight * volumeDepth) {
    throw new Error('CPR voxel tamponu hacim boyutlarından küçük.')
  }

  const sx = Math.abs(Number(volume.spacing?.[0])) || 1
  const sy = Math.abs(Number(volume.spacing?.[1])) || 1
  const sz = Math.abs(Number(volume.spacing?.[2])) || 1
  const panoramaWidth = Math.round(clamp(options.panoramaWidth ?? 720, 160, 1200))
  const panoramaHeight = Math.round(clamp(options.panoramaHeight ?? volumeDepth, 120, 720))
  const arch = options.arch ?? defaultDentalArch(volumeWidth, volumeHeight, panoramaWidth)
  if (arch.length < 2) throw new Error('CPR eğrisi en az iki noktadan oluşmalıdır.')
  const panoramicPath = resampleDentalArch(arch, panoramaWidth, [sx, sy])
  const pathDirections = panoramicPath.map((_, index) => tangent(panoramicPath, index, sx, sy))
  const arcLengthMm = panoramicPath[panoramicPath.length - 1]?.distanceMm ?? 0
  const selectedPositionNormalized = clamp(options.selectedPosition ?? 0.5, 0, 1)
  const selectedPositionMm = selectedPositionNormalized * arcLengthMm
  const panoramaThicknessMm = clamp(options.panoramaThicknessMm ?? 25, 0, Math.min(volumeWidth * sx, volumeHeight * sy) / 2)
  const panoramaProjection = options.panoramaProjection ?? 'MIP'
  const panoramaSampleStepMm = Math.max(0.35, Math.min(sx, sy))
  const panoramaSampleCount = Math.max(1, Math.ceil(panoramaThicknessMm / panoramaSampleStepMm) + 1)

  const panoramaKey = JSON.stringify([arch, panoramaWidth, panoramaHeight, panoramaThicknessMm, panoramaProjection, sx, sy, sz, volumeWidth, volumeHeight, volumeDepth])
  let panorama = cache?.volume === volume && cache.key === panoramaKey ? cache.image : undefined
  if (!panorama) {
    const panoramaSamples: number[] = []
    for (let py = 0; py < panoramaHeight; py++) {
      const z = (1 - py / Math.max(1, panoramaHeight - 1)) * (volumeDepth - 1)
      for (let px = 0; px < panoramaWidth; px++) {
        const point = panoramicPath[px]
        const direction = pathDirections[px]
        const normal = { x: -direction.y, y: direction.x }
        const ray: Array<number | null> = []
        for (let sample = 0; sample < panoramaSampleCount; sample++) {
          const offsetMm = panoramaSampleCount === 1 ? 0 : -panoramaThicknessMm / 2 + sample * panoramaThicknessMm / (panoramaSampleCount - 1)
          ray.push(scalarAt(volume, point.x + normal.x * offsetMm / sx, point.y + normal.y * offsetMm / sy, z))
        }
        panoramaSamples.push(combineSamples(ray, panoramaProjection))
      }
    }

    const tone = percentileTone(panoramaSamples)
    panorama = imageDataFromSamples(panoramaSamples, panoramaWidth, panoramaHeight, tone)
    if (cache) {
      cache.volume = volume
      cache.key = panoramaKey
      cache.image = panorama
    }
  }
  const requestedCount = Math.round(clamp(options.crossSectionCount ?? 5, 3, 11))
  const crossSectionCount = requestedCount % 2 === 0 ? requestedCount + 1 : requestedCount
  const crossSectionStepMm = clamp(options.crossSectionStepMm ?? 1.5, 0.2, 10)
  const crossSectionThicknessMm = clamp(options.crossSectionThicknessMm ?? 0.8, 0, 10)
  const crossSectionWidthMm = clamp(options.crossSectionWidthMm ?? 42, 10, Math.min(volumeWidth * sx, volumeHeight * sy))
  const sectionWidth = Math.round(clamp(crossSectionWidthMm / Math.min(sx, sy), 96, 320))
  const sectionHeight = panoramaHeight
  const sectionThicknessSamples = Math.max(1, Math.ceil(crossSectionThicknessMm / Math.max(0.25, Math.min(sx, sy))) + 1)
  const centre = Math.floor(crossSectionCount / 2)

  // Build every section before windowing it. Panoramic MIP values contain
  // enamel/metal peaks and need a very different VOI from thin AVG sections;
  // sharing the panoramic tone curve made roots and trabecular bone disappear.
  const sampledSections = Array.from({ length: crossSectionCount }, (_, section) => {
    const offsetMm = (section - centre) * crossSectionStepMm
    const positionMm = selectedPositionMm + offsetMm
    const valid = positionMm >= 0 && positionMm <= arcLengthMm
    const pathIndex = Math.round(clamp(positionMm / Math.max(arcLengthMm, 1e-6), 0, 1) * (panoramicPath.length - 1))
    const point = panoramicPath[pathIndex]
    const direction = pathDirections[pathIndex]
    const normal = { x: -direction.y, y: direction.x }
    const sectionSamples: number[] = []
    for (let py = 0; py < sectionHeight; py++) {
      const z = (1 - py / Math.max(1, sectionHeight - 1)) * (volumeDepth - 1)
      for (let px = 0; px < sectionWidth; px++) {
        if (!valid) {
          sectionSamples.push(Number.NaN)
          continue
        }
        const acrossMm = (px / Math.max(1, sectionWidth - 1) - 0.5) * crossSectionWidthMm
        const samples: Array<number | null> = []
        for (let slab = 0; slab < sectionThicknessSamples; slab++) {
          const alongMm = sectionThicknessSamples === 1 ? 0 : -crossSectionThicknessMm / 2 + slab * crossSectionThicknessMm / (sectionThicknessSamples - 1)
          samples.push(scalarAt(
            volume,
            point.x + normal.x * acrossMm / sx + direction.x * alongMm / sx,
            point.y + normal.y * acrossMm / sy + direction.y * alongMm / sy,
            z,
          ))
        }
        sectionSamples.push(combineSamples(samples, 'AVG'))
      }
    }
    return {
      samples: sectionSamples,
      widthMm: crossSectionWidthMm,
      heightMm: (volumeDepth - 1) * sz,
      positionMm,
      offsetMm,
      valid,
    }
  })
  const sectionTone = percentileTone(sampledSections.flatMap((section) => section.samples), 0.01, 0.99)
  const crossSections: CprSection[] = sampledSections.map(({ samples, ...section }) => ({
    ...section,
    image: imageDataFromSamples(samples, sectionWidth, sectionHeight, sectionTone),
  }))

  return {
    panorama,
    crossSections,
    arcLengthMm,
    selectedPositionMm,
    selectedPositionNormalized,
  }
}
