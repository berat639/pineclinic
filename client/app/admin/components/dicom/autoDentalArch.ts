/** Local, deterministic initial dental-arch detection for CBCT CPR.
 *
 * It deliberately returns a conservative curve around the usual dental area
 * when the scan does not have a clear bony signal. No patient data leaves the
 * browser; the clinician can always refine the resulting control points.
 */
export type DentalArchPoint = { x: number; y: number }

type Volume = {
  scalarData: ArrayLike<number>
  dimensions: readonly [number, number, number] | number[]
  spacing?: readonly [number, number, number] | number[]
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

/**
 * Thin-slab axial arch tracing adapted from DenCT's MIT-licensed archDetect.
 * Unlike a whole-volume projection, this only sees the dental level currently
 * displayed by the clinician, so skull base and the opposite jaw cannot bend
 * the local tangent used by perpendicular sections.
 */
function detectArchOnAxialSlab(volume: Volume, axialSlice: number, prior: DentalArchPoint[]) {
  const [width, height, depth] = volume.dimensions.map(Number)
  const sz = Math.abs(Number(volume.spacing?.[2])) || 1
  const halfSlices = Math.max(1, Math.round(6 / sz))
  const lowZ = clamp(Math.round(axialSlice) - halfSlices, 0, depth - 1)
  const highZ = clamp(Math.round(axialSlice) + halfSlices, 0, depth - 1)
  const planeSize = width * height
  const mip = new Float32Array(planeSize)
  mip.fill(Number.NEGATIVE_INFINITY)
  for (let z = lowZ; z <= highZ; z++) {
    const offset = z * planeSize
    for (let pixel = 0; pixel < planeSize; pixel++) {
      const value = Number(volume.scalarData[offset + pixel])
      if (Number.isFinite(value) && value > mip[pixel]) mip[pixel] = value
    }
  }

  const sampleMip = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return Number.NEGATIVE_INFINITY
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
    const tx = x - x0, ty = y - y0
    const a = mip[x0 + y0 * width] * (1 - tx) + mip[x1 + y0 * width] * tx
    const b = mip[x0 + y1 * width] * (1 - tx) + mip[x1 + y1 * width] * tx
    return a * (1 - ty) + b * ty
  }

  // Refine the robust 3-D proposal only within a narrow band at the selected
  // axial level. This is the crucial difference from DenCT's independent ray
  // maxima: metal cannot redefine the whole arch or flip posterior points.
  const refined = fitArch(volume, prior, 0.32, sampleMip)
  return refined.confidence >= 0.08 ? refined.points : null
}

function baseline(width: number, height: number, count: number, flipped = false): DentalArchPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1)
    // Dental focal trough: incisors sit markedly anterior to the molars.
    // The former 0.36 centre placed the curve ~12 mm palatal to the incisors
    // on Meyer CBCT and made otherwise-correct perpendiculars miss the teeth.
    const curve = 0.18 + 0.32 * Math.pow((t - 0.5) * 2, 2)
    return { x: width * (0.16 + t * 0.68), y: height * (flipped ? 1 - curve : curve) }
  })
}

function densityAlongDepth(volume: Volume, x: number, y: number) {
  const [width, height, depth] = volume.dimensions
  const ix = clamp(Math.round(x), 0, width - 1)
  const iy = clamp(Math.round(y), 0, height - 1)
  const stride = width * height
  const samples: number[] = []
  // The mean of the strongest depth samples preserves enamel and cortical
  // bone while preventing a single metal voxel from pulling the whole arch.
  const depthStep = Math.max(2, Math.floor(depth / 96))
  for (let z = 0; z < depth; z += depthStep) {
    const value = Number(volume.scalarData[ix + iy * width + z * stride] ?? 0)
    if (Number.isFinite(value)) samples.push(value)
  }
  samples.sort((a, b) => b - a)
  const count = Math.max(2, Math.ceil(samples.length * 0.12))
  return samples.slice(0, count).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(count, samples.length))
}

function normalAt(points: DentalArchPoint[], index: number, sx: number, sy: number) {
  const before = points[Math.max(0, index - 1)]
  const after = points[Math.min(points.length - 1, index + 1)]
  const dxMm = (after.x - before.x) * sx
  const dyMm = (after.y - before.y) * sy
  const lengthMm = Math.hypot(dxMm, dyMm) || 1
  return { x: -dyMm / lengthMm, y: dxMm / lengthMm }
}

/**
 * Finds a U-shaped initial arch from a depth MIP, constrained near the dental
 * region. The dynamic-programming step prevents the curve from jumping to
 * unrelated high-density anatomy or metal artefacts.
 */
function fitArch(
  volume: Volume,
  prior: DentalArchPoint[],
  searchScale = 1,
  density: (x: number, y: number) => number = (x, y) => densityAlongDepth(volume, x, y),
  priorWeight = 1,
) {
  const [width, height] = volume.dimensions
  const sx = Math.abs(Number(volume.spacing?.[0])) || 1
  const sy = Math.abs(Number(volume.spacing?.[1])) || 1
  const normalSteps = 72
  const searchRadiusMm = Math.min(width * sx, height * sy) * 0.13 * searchScale
  const paths: DentalArchPoint[][] = []
  const offsets: number[][] = []
  const values: number[][] = []
  const sampled: number[] = []

  prior.forEach((point, pointIndex) => {
    const normal = normalAt(prior, pointIndex, sx, sy)
    const column: number[] = []
    const columnPoints: DentalArchPoint[] = []
    const columnOffsets: number[] = []
    for (let step = 0; step < normalSteps; step++) {
      const offsetMm = -searchRadiusMm + 2 * searchRadiusMm * step / Math.max(1, normalSteps - 1)
      const candidate = {
        x: clamp(point.x + normal.x * offsetMm / sx, 0, width - 1),
        y: clamp(point.y + normal.y * offsetMm / sy, 0, height - 1),
      }
      const tangent = { x: normal.y, y: -normal.x }
      const valuesNearPoint = [-1, 0, 1].map((tangentOffsetMm) => density(
        candidate.x + tangent.x * tangentOffsetMm / sx,
        candidate.y + tangent.y * tangentOffsetMm / sy,
      ))
      const value = valuesNearPoint.reduce((sum, item) => sum + item, 0) / valuesNearPoint.length
      column.push(value); columnPoints.push(candidate); columnOffsets.push(offsetMm); sampled.push(value)
    }
    values.push(column); paths.push(columnPoints); offsets.push(columnOffsets)
  })
  const ordered = [...sampled].sort((a, b) => a - b)
  const low = ordered[Math.floor(ordered.length * 0.4)] ?? 0
  const high = ordered[Math.floor(ordered.length * 0.92)] ?? low + 1
  const score = (value: number) => clamp((value - low) / Math.max(1, high - low), 0, 1)

  let costs = values[0].map((value, index) => -score(value) * 3 + priorWeight * Math.abs(offsets[0][index]) / Math.max(searchRadiusMm, 1))
  const predecessors: number[][] = []
  for (let column = 1; column < values.length; column++) {
    const next = values[column].map((value, row) => {
      let bestCost = Infinity
      let bestIndex = row
      for (let previous = Math.max(0, row - 10); previous <= Math.min(normalSteps - 1, row + 10); previous++) {
        const continuity = Math.abs(offsets[column][row] - offsets[column - 1][previous]) / Math.max(searchRadiusMm, 1) * 5
        const candidate = costs[previous] + continuity
        if (candidate < bestCost) { bestCost = candidate; bestIndex = previous }
      }
      predecessors[column] ??= []
      predecessors[column][row] = bestIndex
      return bestCost - score(value) * 3 + priorWeight * Math.abs(offsets[column][row]) / Math.max(searchRadiusMm, 1)
    })
    costs = next
  }
  let index = costs.reduce((best, value, current) => value < costs[best] ? current : best, 0)
  const result: DentalArchPoint[] = Array.from({ length: prior.length }, () => ({ x: 0, y: 0 }))
  for (let column = prior.length - 1; column >= 0; column--) {
    result[column] = paths[column][index]
    index = predecessors[column]?.[index] ?? index
  }
  // Smooth both coordinates because the points moved along changing normals.
  const points = result.map((point, index) => {
    if (index === 0 || index === result.length - 1) return point
    return {
      x: (result[index - 1].x + point.x * 2 + result[index + 1].x) / 4,
      y: (result[index - 1].y + point.y * 2 + result[index + 1].y) / 4,
    }
  })
  const confidence = points.reduce((sum, point) => sum + score(density(point.x, point.y)), 0) / points.length
  return { points, confidence }
}

export function estimateDentalArch(volume: Volume, controlPointCount = 13, axialSlice?: number): DentalArchPoint[] {
  const [width, height] = volume.dimensions
  if (width < 32 || height < 32) return baseline(width, height, controlPointCount)

  // Patient position and scanner export direction are not consistent across
  // vendors. Evaluate both anterior/posterior orientations and retain the
  // curve with the stronger continuous dental-density signal.
  const initialCandidates = [
    fitArch(volume, baseline(width, height, controlPointCount)),
    fitArch(volume, baseline(width, height, controlPointCount, true)),
  ]
  const selected = initialCandidates[1].confidence > initialCandidates[0].confidence ? initialCandidates[1] : initialCandidates[0]
  // A second, narrower normal search follows local tooth/jaw anatomy without
  // allowing the curve to jump to the opposite cortical boundary.
  const robustProposal = fitArch(volume, selected.points, 0.45).points
  if (Number.isFinite(axialSlice)) {
    const detected = detectArchOnAxialSlab(volume, Number(axialSlice), robustProposal)
    if (detected) return detected
  }
  return robustProposal
}

function thickRobustMip(volume: Volume, axialSlice: number, thicknessMm = 28) {
  const [width, height, depth] = volume.dimensions.map(Number)
  const sz = Math.abs(Number(volume.spacing?.[2])) || 1
  const halfSlices = Math.max(2, Math.round(thicknessMm / sz / 2))
  const lowZ = clamp(Math.round(axialSlice) - halfSlices, 0, depth - 1)
  const highZ = clamp(Math.round(axialSlice) + halfSlices, 0, depth - 1)
  const size = width * height
  const first = new Float32Array(size); first.fill(Number.NEGATIVE_INFINITY)
  const second = new Float32Array(size); second.fill(Number.NEGATIVE_INFINITY)
  const third = new Float32Array(size); third.fill(Number.NEGATIVE_INFINITY)
  for (let z = lowZ; z <= highZ; z++) {
    const offset = z * size
    for (let index = 0; index < size; index++) {
      const value = Number(volume.scalarData[offset + index])
      if (!Number.isFinite(value)) continue
      if (value >= first[index]) { third[index] = second[index]; second[index] = first[index]; first[index] = value }
      else if (value >= second[index]) { third[index] = second[index]; second[index] = value }
      else if (value > third[index]) third[index] = value
    }
  }
  const projection = new Float32Array(size)
  for (let index = 0; index < size; index++) {
    const values = [first[index], second[index], third[index]].filter(Number.isFinite)
    projection[index] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  }
  return projection
}

function binaryMorphology(input: Uint8Array, width: number, height: number, radius: number, dilate: boolean) {
  const output = new Uint8Array(input.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let result = dilate ? 0 : 1
      for (let dy = -radius; dy <= radius && (dilate ? result === 0 : result === 1); dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) { if (!dilate) result = 0; continue }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          const value = xx >= 0 && xx < width ? input[xx + yy * width] : 0
          if (dilate && value) { result = 1; break }
          if (!dilate && !value) { result = 0; break }
        }
      }
      output[x + y * width] = result
    }
  }
  return output
}

function distanceRidge(mask: Uint8Array, width: number, height: number) {
  const distance = new Float32Array(mask.length)
  const large = width + height
  for (let index = 0; index < mask.length; index++) distance[index] = mask[index] ? large : 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = x + y * width
    if (!mask[index]) continue
    if (x) distance[index] = Math.min(distance[index], distance[index - 1] + 1)
    if (y) distance[index] = Math.min(distance[index], distance[index - width] + 1)
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const index = x + y * width
    if (!mask[index]) continue
    if (x + 1 < width) distance[index] = Math.min(distance[index], distance[index + 1] + 1)
    if (y + 1 < height) distance[index] = Math.min(distance[index], distance[index + width] + 1)
  }
  return distance
}

/** Zhang-Suen thinning keeps one-pixel centre lines instead of rewarding the
 * middle of every thick cortical structure. A capped iteration count makes
 * runtime predictable on large cone-beam volumes. */
function skeletonize(input: Uint8Array, width: number, height: number, maximumIterations = 64) {
  const pixels = new Uint8Array(input)
  const removals = new Uint32Array(input.length)
  const neighbour = (x: number, y: number) => pixels[x + y * width]
  for (let iteration = 0; iteration < maximumIterations; iteration++) {
    let changed = false
    for (let phase = 0; phase < 2; phase++) {
      let removalCount = 0
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const index = x + y * width
        if (!pixels[index]) continue
        const p2 = neighbour(x, y - 1), p3 = neighbour(x + 1, y - 1)
        const p4 = neighbour(x + 1, y), p5 = neighbour(x + 1, y + 1)
        const p6 = neighbour(x, y + 1), p7 = neighbour(x - 1, y + 1)
        const p8 = neighbour(x - 1, y), p9 = neighbour(x - 1, y - 1)
        const count = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (count < 2 || count > 6) continue
        const sequence = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let transitions = 0
        for (let item = 0; item < 8; item++) if (!sequence[item] && sequence[item + 1]) transitions++
        if (transitions !== 1) continue
        const firstCondition = phase === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0
        if (firstCondition) removals[removalCount++] = index
      }
      if (removalCount) changed = true
      for (let item = 0; item < removalCount; item++) pixels[removals[item]] = 0
    }
    if (!changed) break
  }
  return pixels
}

function distanceToSkeleton(skeleton: Uint8Array, width: number, height: number) {
  const distance = new Float32Array(skeleton.length)
  const large = width + height
  for (let index = 0; index < skeleton.length; index++) distance[index] = skeleton[index] ? 0 : large
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = x + y * width
    if (x) distance[index] = Math.min(distance[index], distance[index - 1] + 1)
    if (y) distance[index] = Math.min(distance[index], distance[index - width] + 1)
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const index = x + y * width
    if (x + 1 < width) distance[index] = Math.min(distance[index], distance[index + 1] + 1)
    if (y + 1 < height) distance[index] = Math.min(distance[index], distance[index + width] + 1)
  }
  return distance
}

type BrightComponent = { x: number; y: number; size: number }

function brightComponents(projection: Float32Array, width: number, height: number, threshold: number) {
  const visited = new Uint8Array(projection.length)
  const stack = new Uint32Array(projection.length)
  const result: BrightComponent[] = []
  for (let seed = 0; seed < projection.length; seed++) {
    if (visited[seed] || projection[seed] < threshold) continue
    let stackSize = 1, count = 0, sumX = 0, sumY = 0
    let minX = width, maxX = 0, minY = height, maxY = 0
    stack[0] = seed; visited[seed] = 1
    while (stackSize) {
      const index = stack[--stackSize]
      const x = index % width, y = Math.floor(index / width)
      count++; sumX += x; sumY += y
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue
        const neighbour = xx + yy * width
        if (!visited[neighbour] && projection[neighbour] >= threshold) {
          visited[neighbour] = 1; stack[stackSize++] = neighbour
        }
      }
    }
    const componentWidth = maxX - minX + 1, componentHeight = maxY - minY + 1
    if (count >= 6 && count <= width * height * 0.025 && componentWidth <= width * 0.2 && componentHeight <= height * 0.2) {
      result.push({ x: sumX / count, y: sumY / count, size: count })
    }
  }
  return result
}

function solve3(matrix: number[][], vector: number[]) {
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let column = 0; column < 3; column++) {
    let pivot = column
    for (let row = column + 1; row < 3; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    if (Math.abs(divisor) < 1e-9) return null
    for (let item = column; item < 4; item++) augmented[column][item] /= divisor
    for (let row = 0; row < 3; row++) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let item = column; item < 4; item++) augmented[row][item] -= factor * augmented[column][item]
    }
  }
  return augmented.map((row) => row[3])
}

function fitComponentParabola(components: BrightComponent[], width: number, height: number, count: number, flipped: boolean) {
  let selected = components.filter((component) => component.x > width * 0.08 && component.x < width * 0.92 && (flipped ? component.y > height * 0.38 : component.y < height * 0.62))
  const fit = (items: BrightComponent[]) => {
    const matrix = Array.from({ length: 3 }, () => [0, 0, 0])
    const vector = [0, 0, 0]
    for (const component of items) {
      const u = (component.x - width / 2) / width
      const basis = [u * u, u, 1]
      const weight = Math.min(24, Math.sqrt(component.size))
      for (let row = 0; row < 3; row++) {
        vector[row] += weight * basis[row] * (component.y / height)
        for (let column = 0; column < 3; column++) matrix[row][column] += weight * basis[row] * basis[column]
      }
    }
    return solve3(matrix, vector)
  }
  if (selected.length < 5) return null
  let coefficients = fit(selected)
  if (!coefficients) return null
  const residuals = selected.map((component) => Math.abs((coefficients![0] * Math.pow((component.x - width / 2) / width, 2) + coefficients![1] * ((component.x - width / 2) / width) + coefficients![2]) * height - component.y))
  const orderedResiduals = [...residuals].sort((a, b) => a - b)
  const residualLimit = Math.max(7, (orderedResiduals[Math.floor(orderedResiduals.length / 2)] ?? 0) * 2.5)
  selected = selected.filter((_, index) => residuals[index] <= residualLimit)
  if (selected.length < 5) return null
  coefficients = fit(selected)
  if (!coefficients || (flipped ? coefficients[0] >= -0.2 : coefficients[0] <= 0.2)) return null
  const xs = selected.map((component) => component.x)
  const minimumX = Math.min(...xs), maximumX = Math.max(...xs)
  const span = maximumX - minimumX
  if (span < width * 0.2) return null
  const startX = clamp(minimumX - span * 0.06, width * 0.05, width * 0.95)
  const endX = clamp(maximumX + span * 0.06, width * 0.05, width * 0.95)
  const points = Array.from({ length: count }, (_, index) => {
    const x = startX + (endX - startX) * index / Math.max(1, count - 1)
    const u = (x - width / 2) / width
    return { x, y: clamp((coefficients![0] * u * u + coefficients![1] * u + coefficients![2]) * height, height * 0.03, height * 0.97) }
  })
  const rms = Math.sqrt(selected.reduce((sum, component) => {
    const u = (component.x - width / 2) / width
    const expected = (coefficients![0] * u * u + coefficients![1] * u + coefficients![2]) * height
    return sum + Math.pow(expected - component.y, 2)
  }, 0) / selected.length)
  return { points, quality: clamp(selected.length / 14, 0, 1) * 0.45 + clamp(span / (width * 0.45), 0, 1) * 0.35 + clamp(1 - rms / 24, 0, 1) * 0.2 }
}

function componentArchProposals(projection: Float32Array, orderedValues: number[], width: number, height: number, count: number) {
  const threshold = orderedValues[Math.floor(orderedValues.length * 0.99)] ?? Number.POSITIVE_INFINITY
  const components = brightComponents(projection, width, height, threshold)
  return [fitComponentParabola(components, width, height, count, false), fitComponentParabola(components, width, height, count, true)].filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal))
}

function smoothBSpline(points: DentalArchPoint[], passes = 3) {
  let result = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < passes; pass++) {
    result = result.map((point, index) => {
      if (index < 2 || index > result.length - 3) return point
      const neighbours = [result[index - 2], result[index - 1], point, result[index + 1], result[index + 2]]
      const weights = [1, 4, 6, 4, 1]
      return {
        x: neighbours.reduce((sum, item, position) => sum + item.x * weights[position], 0) / 16,
        y: neighbours.reduce((sum, item, position) => sum + item.y * weights[position], 0) / 16,
      }
    })
  }
  // Pull terminal samples into the supported molar region instead of letting
  // cortical skull ridges extend the curve behind the last teeth.
  if (result.length >= 4) {
    result[0] = { x: result[0].x * 0.65 + result[1].x * 0.35, y: result[0].y * 0.65 + result[1].y * 0.35 }
    const last = result.length - 1
    result[last] = { x: result[last].x * 0.65 + result[last - 1].x * 0.35, y: result[last].y * 0.65 + result[last - 1].y * 0.35 }
  }
  return result
}

export type DentalArchEstimate = {
  points: DentalArchPoint[]
  confidence: number
  axialSlice: number
}

function analyseMipAtSlice(volume: Volume, controlPointCount: number, axialSlice: number): DentalArchEstimate {
  const [width, height, depth] = volume.dimensions.map(Number)
  const centreZ = clamp(axialSlice, 0, depth - 1)
  const projection = thickRobustMip(volume, centreZ)
  const sampled: number[] = []
  for (let y = Math.floor(height * 0.08); y < Math.ceil(height * 0.88); y += 3) {
    for (let x = Math.floor(width * 0.06); x < Math.ceil(width * 0.94); x += 3) sampled.push(projection[x + y * width])
  }
  sampled.sort((a, b) => a - b)
  const low = sampled[Math.floor(sampled.length * 0.55)] ?? 0
  // Enamel is among the brightest structures in a dental slab. A high
  // percentile keeps the broad mandibular cortex out of the skeleton mask.
  const threshold = sampled[Math.floor(sampled.length * 0.88)] ?? low
  const high = sampled[Math.floor(sampled.length * 0.985)] ?? threshold + 1
  const mask = new Uint8Array(width * height)
  for (let y = Math.floor(height * 0.06); y < Math.ceil(height * 0.9); y++) {
    for (let x = Math.floor(width * 0.04); x < Math.ceil(width * 0.96); x++) {
      mask[x + y * width] = projection[x + y * width] >= threshold ? 1 : 0
    }
  }
  const closed = binaryMorphology(binaryMorphology(mask, width, height, 3, true), width, height, 3, false)
  const ridge = distanceRidge(closed, width, height)
  const skeletonDistance = distanceToSkeleton(skeletonize(closed, width, height), width, height)
  const density = (x: number, y: number) => {
    const ix = clamp(Math.round(x), 0, width - 1), iy = clamp(Math.round(y), 0, height - 1)
    const index = ix + iy * width
    const intensity = clamp((projection[index] - low) / Math.max(1, high - low), 0, 1)
    // A dental crown forms a narrow ridge. Thick solid bone has a much larger
    // distance-to-edge value and must not win merely because it is massive.
    const ridgeWidth = ridge[index]
    const centreline = ridgeWidth > 0 ? clamp(1 - Math.abs(ridgeWidth - 4) / 7, 0, 1) : 0
    const skeleton = clamp(1 - skeletonDistance[index] / 6, 0, 1)
    return intensity * 0.55 + skeleton * 0.4 + centreline * 0.05
  }
  const componentProposals = componentArchProposals(projection, sampled, width, height, controlPointCount)
  const seeds = componentProposals.length
    ? componentProposals.map((proposal) => ({ ...proposal, searchScale: 0.14, priorWeight: 3 }))
    : [
        { points: baseline(width, height, controlPointCount), quality: 0, searchScale: 0.36, priorWeight: 2.5 },
        { points: baseline(width, height, controlPointCount, true), quality: 0, searchScale: 0.36, priorWeight: 2.5 },
      ]
  const proposals = seeds.map((seed) => {
    const fitted = fitArch(volume, seed.points, seed.searchScale, density, seed.priorWeight)
    return { ...fitted, componentQuality: seed.quality }
  })
  const selected = proposals.reduce((best, proposal) => proposal.confidence + proposal.componentQuality * 0.45 > best.confidence + best.componentQuality * 0.45 ? proposal : best)
  const refined = fitArch(volume, selected.points, componentProposals.length ? 0.08 : 0.18, density, componentProposals.length ? 4 : 3)
  const points = smoothBSpline(refined.points)
  const skeletonSupport = points.reduce((sum, point) => {
    const index = clamp(Math.round(point.x), 0, width - 1) + clamp(Math.round(point.y), 0, height - 1) * width
    return sum + clamp(1 - skeletonDistance[index] / 8, 0, 1)
  }, 0) / points.length
  return { points, confidence: clamp(refined.confidence * 0.58 + skeletonSupport * 0.22 + selected.componentQuality * 0.2, 0, 1), axialSlice: centreZ }
}

/** Fast CPU path: multi-level robust MIP -> true skeleton -> B-spline.
 * Adjacent dental levels are evaluated because the viewport may initially be
 * a few millimetres above or below the crowns on vendor-specific exports. */
export function estimateDentalArchMipSplineDetailed(volume: Volume, controlPointCount = 13, axialSlice?: number): DentalArchEstimate {
  const [width, height, depth] = volume.dimensions.map(Number)
  const requestedZ = Number.isFinite(axialSlice) ? clamp(Number(axialSlice), 0, depth - 1) : (depth - 1) / 2
  if (width < 32 || height < 32 || depth < 3) {
    return { points: estimateDentalArch(volume, controlPointCount, requestedZ), confidence: 0, axialSlice: requestedZ }
  }
  const sz = Math.abs(Number(volume.spacing?.[2])) || 1
  const offset = Math.max(2, Math.round(10 / sz))
  const slices = [...new Set([-2, -1, 0, 1, 2].map((step) => Math.round(clamp(requestedZ + step * offset, 0, depth - 1))))]
  const estimates = slices.map((slice) => analyseMipAtSlice(volume, controlPointCount, slice))
  return estimates.reduce((best, estimate) => estimate.confidence > best.confidence ? estimate : best)
}

export function estimateDentalArchMipSpline(volume: Volume, controlPointCount = 13, axialSlice?: number): DentalArchPoint[] {
  return estimateDentalArchMipSplineDetailed(volume, controlPointCount, axialSlice).points
}
