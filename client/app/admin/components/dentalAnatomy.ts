export type DentalSurface = 'M' | 'O' | 'D' | 'B' | 'L';

export type Vector3Tuple = [number, number, number];

export interface ToothAxes {
  center: Vector3Tuple;
  /** Tooth long axis, always pointing from the root towards the crown. */
  up: Vector3Tuple;
  /** Buccal/labial direction, pointing away from the dental arch. */
  out: Vector3Tuple;
  /** Dataset-defined tangent of the dental arch. */
  side: Vector3Tuple;
}

const dot = (a: Vector3Tuple, b: Vector3Tuple): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const subtract = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

const scale = (v: Vector3Tuple, amount: number): Vector3Tuple => [
  v[0] * amount,
  v[1] * amount,
  v[2] * amount,
];

/**
 * ToothFairy's `side` axis is a right-handed frame component, not an
 * anatomically signed mesial axis. Its sign alternates with the FDI quadrant.
 */
export function getMesialAxis(fdi: number, axes: ToothAxes): Vector3Tuple {
  const quadrant = Math.floor(fdi / 10);
  return scale(axes.side, quadrant % 2 === 0 ? 1 : -1);
}

export function projectOnToothAxis(position: Vector3Tuple, axes: ToothAxes): number {
  return dot(subtract(position, axes.center), axes.up);
}

/** 0 is the crown tip/occlusal end and 1 is the root apex. */
export function getAnatomicalDepthRatio(
  position: Vector3Tuple,
  axes: ToothAxes,
  minProjection: number,
  maxProjection: number,
): number {
  const range = Math.max(maxProjection - minProjection, Number.EPSILON);
  return (maxProjection - projectOnToothAxis(position, axes)) / range;
}

export function doesNormalMatchSurface(
  surface: DentalSurface,
  fdi: number,
  normal: Vector3Tuple,
  axes: ToothAxes,
  threshold = 0.32,
): boolean {
  switch (surface) {
    case 'O':
      return dot(normal, axes.up) > threshold;
    case 'B':
      return dot(normal, axes.out) > threshold;
    case 'L':
      return dot(normal, axes.out) < -threshold;
    case 'M':
      return dot(normal, getMesialAxis(fdi, axes)) > threshold;
    case 'D':
      return dot(normal, getMesialAxis(fdi, axes)) < -threshold;
  }
}

export function detectDentalSurface(
  fdi: number,
  normal: Vector3Tuple,
  axes: ToothAxes,
): DentalSurface {
  // Keep the occlusal/incisal face dominant at transitions between surfaces.
  if (doesNormalMatchSurface('O', fdi, normal, axes, 0.38)) return 'O';
  if (doesNormalMatchSurface('B', fdi, normal, axes, 0.38)) return 'B';
  if (doesNormalMatchSurface('L', fdi, normal, axes, 0.38)) return 'L';

  return dot(normal, getMesialAxis(fdi, axes)) >= 0 ? 'M' : 'D';
}

export function doesPositionMatchRoot(
  section: string,
  fdi: number,
  position: Vector3Tuple,
  axes: ToothAxes,
): boolean {
  const relative = subtract(position, axes.center);
  const mesialPosition = dot(relative, getMesialAxis(fdi, axes));
  const buccalPosition = dot(relative, axes.out);

  if (section.startsWith('Mezyobukkal')) return mesialPosition >= 0 && buccalPosition >= 0;
  if (section.startsWith('Distobukkal')) return mesialPosition < 0 && buccalPosition >= 0;
  if (section.startsWith('Mezyal')) return mesialPosition >= 0;
  if (section.startsWith('Distal')) return mesialPosition < 0;
  if (section.startsWith('Bukkal')) return buccalPosition >= 0;
  if (section.startsWith('Palatinal') || section.startsWith('Lingual')) return buccalPosition < 0;

  // "Tek Kök" and future unsplit root labels select the complete root.
  return true;
}
