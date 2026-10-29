import { describe, expect, it } from 'vitest';
import { computeAngularArch, splineArch } from './arch';
import { assessArchEvidence } from '../cpr';

describe('splineArch', () => {
  const ctrl: [number, number][] = [[0, 0], [10, 8], [20, 10], [30, 8], [40, 0]];
  const arch = splineArch(ctrl, 100);

  it('passes through its control points', () => {
    for (const c of ctrl) {
      expect(Math.min(...arch.points.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])))).toBeLessThan(0.5);
    }
  });

  it('returns unit normals perpendicular to tangents', () => {
    for (let i = 0; i < 100; i++) {
      expect(Math.hypot(...arch.normals[i])).toBeCloseTo(1);
      const d = arch.tangents[i][0] * arch.normals[i][0] + arch.tangents[i][1] * arch.normals[i][1];
      expect(d).toBeCloseTo(0);
    }
  });

  it('spaces points equally by arc length', () => {
    const d = (i: number) => Math.hypot(arch.points[i + 1][0] - arch.points[i][0], arch.points[i + 1][1] - arch.points[i][1]);
    expect(d(0)).toBeCloseTo(d(50), 1);
  });
});

describe('assessArchEvidence', () => {
  it('accepts a curve continuously supported by evidence', () => {
    const arch = splineArch([[0, 0], [10, 0], [20, 0]], 41);
    const evidence = Array.from({ length: 21 }, (_, x) => [x, 0] as [number, number]);
    const result = assessArchEvidence(arch, evidence);
    expect(result.supportFraction).toBeGreaterThan(0.99);
    expect(result.longestUnsupportedMm).toBe(0);
  });

  it('flags a long unsupported bridge between separated structures', () => {
    const arch = splineArch([[0, 0], [10, 0], [20, 0]], 41);
    const evidence: [number, number][] = [[0, 0], [1, 0], [19, 0], [20, 0]];
    const result = assessArchEvidence(arch, evidence);
    expect(result.supportFraction).toBeLessThan(0.5);
    expect(result.longestUnsupportedMm).toBeGreaterThan(10);
  });
});

describe('computeAngularArch', () => {
  const teeth: [number, number][] = [], bone: [number, number][] = [];
  for (let k = 0; k <= 300; k++) {
    const t = (k / 300) * Math.PI;
    const x = 28 * Math.cos(t), y = 30 * Math.sin(t);
    const nx = Math.cos(t) / 28, ny = Math.sin(t) / 30, nl = Math.hypot(nx, ny);
    for (let w = -1; w <= 1; w += 0.5) teeth.push([x + (nx / nl) * w, y + (ny / nl) * w]);
    for (let w = 0; w <= 12; w += 1) bone.push([x - (nx / nl) * w, y - (ny / nl) * w]);
  }
  for (let y = -20; y < 0; y += 0.5) for (let w = 0; w <= 8; w++) { bone.push([28 - w, y]); bone.push([-28 + w, y]); }

  it('follows the tooth line, not the centre of the thick bone band', () => {
    const arch = computeAngularArch(bone, teeth, 300, 0);
    const apex = arch.points.reduce((b, p) => (p[1] > b[1] ? p : b));
    expect(apex[1]).toBeGreaterThan(27);
    for (const [x, y] of arch.points.filter((p) => p[1] > 15)) {
      expect(Math.abs(Math.hypot(x / 28, y / 30) - 1)).toBeLessThan(0.1);
    }
  });
});
