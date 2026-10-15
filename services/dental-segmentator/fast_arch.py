"""Conservative CPU fallback for an initial dental arch proposal.

This is not a replacement for the nnU-Net DentalSegmentator model. It follows
the active dental plane rather than pooling bright voxels from the whole CBCT.
"""

from __future__ import annotations

import numpy as np

from arch import DentalArch


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _baseline(width: int, height: int, count: int, flipped: bool) -> np.ndarray:
    t = np.linspace(0.0, 1.0, count)
    curve = 0.18 + 0.32 * np.square((t - 0.5) * 2.0)
    return np.column_stack((width * (0.16 + t * 0.68), height * (1.0 - curve if flipped else curve)))


def _normal(points: np.ndarray, index: int) -> np.ndarray:
    tangent = points[min(len(points) - 1, index + 1)] - points[max(0, index - 1)]
    length = float(np.hypot(tangent[0], tangent[1])) or 1.0
    return np.asarray((-tangent[1] / length, tangent[0] / length))


def _sample(image: np.ndarray, x: float, y: float) -> float:
    height, width = image.shape
    if x < 0 or y < 0 or x > width - 1 or y > height - 1:
        return float("-inf")
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    x1, y1 = min(width - 1, x0 + 1), min(height - 1, y0 + 1)
    tx, ty = x - x0, y - y0
    top = image[y0, x0] * (1 - tx) + image[y0, x1] * tx
    bottom = image[y1, x0] * (1 - tx) + image[y1, x1] * tx
    return float(top * (1 - ty) + bottom * ty)


def _regularize_arch(points: np.ndarray) -> np.ndarray:
    """Remove tooth-to-tooth jumps while preserving the dental U shape."""
    x, y = points[:, 0], points[:, 1]
    if len(points) < 3 or float(np.ptp(x)) < 1:
        return points
    weights = np.ones(len(points), dtype=np.float64)
    # Robust reweighting stops one implant/cortical point from bending the arc.
    for _ in range(3):
        coefficients = np.polyfit(x, y, 2, w=weights)
        residuals = np.abs(y - np.polyval(coefficients, x))
        scale = float(np.median(residuals)) * 1.4826 + 1.0
        weights = 1.0 / (1.0 + np.square(residuals / (2.5 * scale)))
    output = points.copy()
    output[:, 1] = np.polyval(coefficients, x)
    return output


def _fit_arch(projection: np.ndarray, prior: np.ndarray) -> tuple[np.ndarray, float]:
    """Fit a continuous path so isolated metal/bone cannot redefine the arch."""
    height, width = projection.shape
    radius, steps = min(width, height) * 0.13, 72
    offsets = np.linspace(-radius, radius, steps)
    candidates: list[np.ndarray] = []
    values: list[np.ndarray] = []
    for index, point in enumerate(prior):
        normal = _normal(prior, index)
        positions = point + offsets[:, None] * normal
        positions[:, 0] = np.clip(positions[:, 0], 0, width - 1)
        positions[:, 1] = np.clip(positions[:, 1], 0, height - 1)
        tangent = np.asarray((normal[1], -normal[0]))
        values.append(np.asarray([
            np.mean([_sample(projection, x + tangent[0] * delta, y + tangent[1] * delta) for delta in (-1, 0, 1)])
            for x, y in positions
        ]))
        candidates.append(positions)

    observed = np.concatenate(values)
    low, high = np.percentile(observed[np.isfinite(observed)], (40, 92))
    scale = max(1.0, float(high - low))
    scores = [np.clip((column - low) / scale, 0.0, 1.0) for column in values]
    costs = -scores[0] * 3.0 + np.abs(offsets) / max(radius, 1.0)
    predecessors: list[np.ndarray] = []
    for column in range(1, len(scores)):
        next_costs, previous = np.full(steps, np.inf), np.zeros(steps, dtype=np.int32)
        for row in range(steps):
            nearby = np.arange(max(0, row - 10), min(steps, row + 11))
            local = costs[nearby] + np.abs(offsets[row] - offsets[nearby]) / max(radius, 1.0) * 5.0
            choice = int(np.argmin(local))
            previous[row] = nearby[choice]
            next_costs[row] = local[choice] - scores[column][row] * 3.0 + abs(offsets[row]) / max(radius, 1.0)
        predecessors.append(previous)
        costs = next_costs

    row, result = int(np.argmin(costs)), np.empty_like(prior)
    for column in range(len(prior) - 1, -1, -1):
        result[column] = candidates[column][row]
        if column:
            row = int(predecessors[column - 1][row])
    smoothed = result.copy()
    smoothed[1:-1] = (result[:-2] + result[1:-1] * 2.0 + result[2:]) / 4.0
    smoothed = _regularize_arch(smoothed)
    confidence = float(np.mean([_clamp(_sample(projection, x, y) - low, 0.0, scale) / scale for x, y in smoothed]))
    return smoothed, confidence


def extract_fast_arch(image, preferred_slice: int | None = None, point_count: int = 13) -> DentalArch:
    array = np.asarray(image, dtype=np.float32)
    if array.ndim != 3:
        raise ValueError("CBCT hacmi 3B olmalıdır.")
    depth, height, width = array.shape
    if min(depth, height, width) < 8:
        raise ValueError("CBCT hacmi hızlı arch hesabı için çok küçük.")

    # The previous implementation chose the brightest slices from the complete
    # volume. In this sample that admits the skull base and produces a false
    # arch. Use only a compact, contiguous slab around the active axial plane.
    centre = int(round(_clamp(preferred_slice if preferred_slice is not None else (depth - 1) / 2, 0, depth - 1)))
    half_slab = min(max(4, depth // 80), 12)
    slab = array[max(0, centre - half_slab):min(depth, centre + half_slab + 1)]
    if not np.isfinite(slab).any():
        raise ValueError("CBCT yoğunluk verisi bulunamadı.")
    projection = np.max(slab, axis=0)
    interior = projection[int(height * 0.08):int(height * 0.92), int(width * 0.06):int(width * 0.94)]
    if interior.size < 100 or float(np.nanmax(interior) - np.nanpercentile(interior, 40)) < 1e-4:
        raise ValueError("Hızlı arch hesabı için yeterli dental yoğunluk bulunamadı.")

    candidates = [_fit_arch(projection, _baseline(width, height, point_count, flipped)) for flipped in (False, True)]
    points, density_confidence = max(candidates, key=lambda candidate: candidate[1])
    span = float(np.ptp(points[:, 0])) / max(1.0, width * 0.55)
    confidence = float(np.clip(density_confidence * 0.75 + min(1.0, span) * 0.25, 0.0, 0.95))
    if confidence < 0.35:
        raise ValueError("Hızlı arch için güvenilir dental eğri bulunamadı.")
    return DentalArch(
        jaw="upper",
        points=[{"x": float(x), "y": float(y)} for x, y in points],
        axial_slice=centre,
        confidence=confidence,
    )
