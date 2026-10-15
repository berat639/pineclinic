from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np


@dataclass(frozen=True)
class DentalArch:
    jaw: str
    points: list[dict[str, float]]
    axial_slice: int
    confidence: float


def _smooth(values: np.ndarray, passes: int = 4) -> np.ndarray:
    output = values.astype(np.float64, copy=True)
    kernel = np.asarray([1, 4, 6, 4, 1], dtype=np.float64) / 16.0
    for _ in range(passes):
        padded = np.pad(output, (2, 2), mode="edge")
        output = np.convolve(padded, kernel, mode="valid")
    return output


def _robust_quadratic(xs: np.ndarray, ys: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """A dental arch is smooth; never connect individual tooth islands directly."""
    current = np.maximum(weights.astype(np.float64), 1e-3)
    for _ in range(4):
        coefficients = np.polyfit(xs, ys, 2, w=current)
        residuals = np.abs(ys - np.polyval(coefficients, xs))
        scale = float(np.median(residuals)) * 1.4826 + 1.0
        current = np.maximum(weights, 1e-3) / (1.0 + np.square(residuals / (2.5 * scale)))
    return coefficients


def _arch_for_label(
    segmentation: np.ndarray,
    label: int,
    jaw: str,
    point_count: int,
    preferred_slice: int | None = None,
) -> DentalArch | None:
    mask = segmentation == label
    if mask.ndim != 3 or int(mask.sum()) < 200:
        return None

    # SimpleITK arrays are z, y, x. Project the complete predicted tooth
    # volume onto the acquisition axial plane, preserving the viewer's I/J
    # coordinates in the returned points.
    # A complete-volume projection can place one tooth at several unrelated
    # axial positions. Restricting to the active slab gives the actual dental
    # plane requested by the viewer.
    per_slice = mask.sum(axis=(1, 2))
    peak_slice = int(np.argmax(per_slice))
    if preferred_slice is None:
        axial_slice = peak_slice
    else:
        requested = int(np.clip(preferred_slice, 0, len(per_slice) - 1))
        credible = np.flatnonzero(per_slice >= max(1, int(per_slice[peak_slice] * 0.18)))
        axial_slice = int(credible[np.argmin(np.abs(credible - requested))]) if credible.size else peak_slice
    half_slab = min(5, max(1, mask.shape[0] // 40))
    projection = mask[max(0, axial_slice - half_slab) : min(mask.shape[0], axial_slice + half_slab + 1)].sum(axis=0).astype(np.float64)
    height, width = projection.shape
    support = projection.sum(axis=0)
    populated = np.flatnonzero(support > 0)
    if populated.size < max(12, width * 0.08):
        return None

    support_floor = max(1.0, float(np.percentile(support[populated], 20)))
    reliable = np.flatnonzero(support >= support_floor)
    left = int(np.percentile(reliable, 2))
    right = int(np.percentile(reliable, 98))
    if right - left < width * 0.18:
        return None

    xs = np.arange(left, right + 1, dtype=np.float64)
    row_indices = np.arange(height, dtype=np.float64)[:, None]
    columns = projection[:, left : right + 1]
    weights = columns.sum(axis=0)
    valid = weights > 0
    centre_y = np.zeros_like(xs)
    centre_y[valid] = (columns[:, valid] * row_indices).sum(axis=0) / weights[valid]
    centre_y[~valid] = np.interp(xs[~valid], xs[valid], centre_y[valid])
    # The segmentation has one island per tooth. A simple moving average still
    # leaves clinically dangerous zigzags across gaps; use a robust U curve.
    coefficients = _robust_quadratic(xs[valid], centre_y[valid], weights[valid])
    centre_y = np.polyval(coefficients, xs)

    output_x = np.linspace(left, right, point_count)
    output_y = np.interp(output_x, xs, centre_y)
    points = [{"x": float(x), "y": float(y)} for x, y in zip(output_x, output_y)]

    span_score = min(1.0, (right - left) / max(1.0, width * 0.55))
    continuity_score = float(np.mean(valid))
    volume_score = min(1.0, float(mask.sum()) / max(1.0, width * height * 0.04))
    confidence = max(0.0, min(1.0, span_score * 0.45 + continuity_score * 0.35 + volume_score * 0.20))
    return DentalArch(jaw=jaw, points=points, axial_slice=axial_slice, confidence=confidence)


def extract_dental_arch(
    segmentation: np.ndarray,
    preferred_slice: int | None = None,
    point_count: int = 13,
    labels: Iterable[tuple[int, str]] = ((3, "upper"), (4, "lower")),
) -> DentalArch:
    candidates = [
        candidate
        for label, jaw in labels
        if (candidate := _arch_for_label(segmentation, label, jaw, point_count, preferred_slice))
    ]
    if not candidates:
        raise ValueError("DentalSegmentator çıktısında üst veya alt diş maskesi bulunamadı.")

    selected = max(candidates, key=lambda candidate: candidate.confidence)
    if preferred_slice is not None:
        # Prefer the jaw whose tooth volume lies closest to the level already
        # displayed by the clinician, provided its segmentation is credible.
        credible = [candidate for candidate in candidates if candidate.confidence >= selected.confidence * 0.82]
        selected = min(credible, key=lambda candidate: abs(candidate.axial_slice - preferred_slice))
    return selected
