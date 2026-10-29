/**
 * Dental Ark Eğrisi Geometri Çekirdeği (`src/arch/arch.ts`).
 *
 * Mimari Rolü:
 * - 17 kontrol noktasından geçen Catmull-Rom B-spline eğrisini (`splineArch`) üretir,
 *   yay uzunluğuna (arc-length) göre eşit aralıklı noktalara böler (`resampleCurve`) ve
 *   her noktadaki birim teğet (`tangents`) ile birim dik normal (`normals`) açı vektörlerini hesaplar.
 * - Kesit bazlı (HU/kemik) tespit için kutupsal (polar) ark uydurma (`computeAngularArch`) sağlar.
 */
export type Pt = [number, number];

export interface ArchResult {
  /** Yay uzunluğuna (arc-length) göre eşit aralıklı eğri noktaları (mm). */
  points: Pt[];
  /** Teğete dik birim normal vektörleri (mm uzayında, bukkal-lingual kesit doğrultusu). */
  normals: Pt[];
  /** Eğri boyunca birim teğet vektörleri. */
  tangents: Pt[];
  /** Eğrinin toplam fiziksel yay uzunluğu (mm). */
  length: number;
  /** Danışma amaçlı uyarı mesajları. */
  warnings?: string[];
  /** Eğriyi oluşturan 17 adet kontrol noktası (mm). */
  controls?: Pt[];
  /** Vakaya özel panoramik dikey (Z) mandibula takip ofsetleri. */
  panorama?: { offsets: Float32Array; nz: number; anchorZ: number; maxOffsetMm: number };
}

/**
 * Yoğun bir kırık çizgiyi (polyline) `count` adet eşit yay uzunluklu noktaya yeniden örnekler
 * ve her noktadaki birim teğet (`tangents`) ile birim normal (`normals`) vektörlerini hesaplar.
 */
export function resampleCurve(dense: Pt[], count: number): ArchResult {
  const N = dense.length - 1;
  const cum: number[] = [0];
  for (let i = 1; i <= N; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const length = cum[N];
  const out: ArchResult = { points: [], normals: [], tangents: [], length };
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (length * i) / (count - 1);
    while (j < N - 1 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (target - cum[j]) / seg;
    const p: Pt = [
      dense[j][0] + t * (dense[j + 1][0] - dense[j][0]),
      dense[j][1] + t * (dense[j + 1][1] - dense[j][1]),
    ];
    let tx = dense[j + 1][0] - dense[j][0];
    let ty = dense[j + 1][1] - dense[j][1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    out.points.push(p);
    out.tangents.push([tx, ty]);
    out.normals.push([-ty, tx]);
  }
  return out;
}

/**
 * Kontrol noktalarından (`ctrl`, örn. 17 nokta, mm) geçen Catmull-Rom spline eğrisi üretir
 * ve yay uzunluğuna göre `count` eşit parçaya bölerek kesit açılarını (`normals`) hesaplar.
 */
export function splineArch(ctrl: Pt[], count = 400): ArchResult {
  if (ctrl.length < 2) throw new Error('Need at least 2 control points');
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const dense: Pt[] = [];
  const per = 60;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      dense.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(ctrl[ctrl.length - 1]);
  return resampleCurve(dense, count);
}

const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
};

/**
 * Kutupsal (polar) açılı ark uydurma: Aksiyel kesitteki kemik (`points`) ve diş kuronu (`preferred`)
 * nokta bulutlarını içbükey merkez etrafında 4 derecelik açı dilimleriyle tarar, medyan yarıçapı alır
 * ve yumuşatarak (`splineArch`) çene eğrisini oluşturur.
 */
export function computeAngularArch(points: Pt[], preferred: Pt[] = [], count = 400, extendMm = 0): ArchResult {
  if (points.length < 12) throw new Error('Not enough dental evidence to estimate an arch');
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  let xx = 0, xy = 0, yy = 0;
  for (const [x, y] of points) { const dx = x - mx, dy = y - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
  const toUV = (p: Pt) => ({ u: (p[0] - mx) * ux + (p[1] - my) * uy, v: (p[0] - mx) * vx + (p[1] - my) * vy });
  const pu = points.map(toUV);
  let uMin = Infinity, uMax = -Infinity;
  for (const p of pu) { uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); }
  const span = uMax - uMin;
  if (span < 8) throw new Error('Dental evidence is too narrow to estimate an arch');
  const uc = (uMin + uMax) / 2;
  const mid = pu.filter((p) => Math.abs(p.u - uc) < span * 0.15).map((p) => p.v);
  const ends = pu.filter((p) => Math.abs(p.u - uc) > span * 0.35).map((p) => p.v);
  if (mid.length < 3 || ends.length < 3) throw new Error('Dental evidence is too fragmented to estimate an arch');
  const vMid = median(mid), vEnd = median(ends);
  const sign = vMid >= vEnd ? 1 : -1;
  const uO = uc, vO = (vMid + vEnd) / 2;
  const polar = (p: Pt) => {
    const q = toUV(p);
    const du = q.u - uO, dv = (q.v - vO) * sign;
    return { phi: Math.atan2(du, dv), r: Math.hypot(du, dv) };
  };
  const binRad = (4 * Math.PI) / 180;
  const bone = points.map(polar), teeth = preferred.map(polar);
  let phiMin = Infinity, phiMax = -Infinity;
  for (const p of bone) { phiMin = Math.min(phiMin, p.phi); phiMax = Math.max(phiMax, p.phi); }
  const nb = Math.max(4, Math.ceil((phiMax - phiMin) / binRad));
  const boneBins = Array.from({ length: nb }, () => [] as number[]);
  const toothBins = Array.from({ length: nb }, () => [] as number[]);
  const slot = (phi: number) => Math.min(nb - 1, Math.max(0, Math.floor(((phi - phiMin) / (phiMax - phiMin || 1)) * nb)));
  for (const p of bone) boneBins[slot(p.phi)].push(p.r);
  for (const p of teeth) toothBins[slot(p.phi)].push(p.r);
  let rows: { phi: number; r: number }[] = [];
  for (let i = 0; i < nb; i++) {
    const src = toothBins[i].length >= 3 ? toothBins[i] : boneBins[i].length >= 3 ? boneBins[i] : null;
    if (!src) continue;
    rows.push({ phi: phiMin + ((i + 0.5) / nb) * (phiMax - phiMin), r: median(src) });
  }
  if (rows.length < 5) throw new Error('Dental evidence is too fragmented to estimate an arch');
  const med3 = rows.map((row, i) => ({ phi: row.phi, r: median(rows.slice(Math.max(0, i - 1), i + 2).map((q) => q.r)) }));
  rows = med3;
  for (let pass = 0; pass < 3; pass++) {
    const prevRows = rows;
    rows = prevRows.map((row, i) => {
      const a = prevRows[Math.max(0, i - 1)].r, b = prevRows[Math.min(prevRows.length - 1, i + 1)].r;
      return { phi: row.phi, r: (a + 2 * row.r + b) / 4 };
    });
  }
  const world = (phi: number, r: number): Pt => {
    const u = uO + r * Math.sin(phi), v = vO + sign * r * Math.cos(phi);
    return [mx + u * ux + v * vx, my + u * uy + v * vy];
  };
  const ctrl = rows.map((row) => world(row.phi, row.r));
  if (extendMm > 0) {
    const extend = (a: Pt, b: Pt): Pt => {
      const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1;
      return [a[0] + (extendMm * dx) / l, a[1] + (extendMm * dy) / l];
    };
    ctrl.unshift(extend(ctrl[0], ctrl[1]));
    ctrl.push(extend(ctrl[ctrl.length - 1], ctrl[ctrl.length - 2]));
  }
  return splineArch(ctrl, count);
}
