import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction'
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction'

export type DentalVolumeMode = 'teeth' | 'bone' | 'soft'

function sampledPercentiles(values: ArrayLike<number>, percentiles: number[]) {
  const stride = Math.max(1, Math.floor(values.length / 16_384))
  const sample: number[] = []
  for (let index = 0; index < values.length; index += stride) {
    const value = Number(values[index])
    if (Number.isFinite(value)) sample.push(value)
  }
  sample.sort((a, b) => a - b)
  if (!sample.length) return percentiles.map(() => 0)
  return percentiles.map((percentile) => sample[Math.min(sample.length - 1, Math.max(0, Math.round(percentile * (sample.length - 1))))])
}

/** Applies an opaque, warm dental volume style without assuming calibrated CT HU. */
export function applyDentalVolumeRendering(viewport: any, scalarData: ArrayLike<number>, mode: DentalVolumeMode) {
  const actor = viewport?.getDefaultActor?.()?.actor
  const property = actor?.getProperty?.()
  if (!actor || !property || !scalarData.length) return

  const [q10, q35, q55, q72, q86, q96, q995] = sampledPercentiles(scalarData, [0.10, 0.35, 0.55, 0.72, 0.86, 0.96, 0.995])
  const color = vtkColorTransferFunction.newInstance()
  const opacity = vtkPiecewiseFunction.newInstance()

  if (mode === 'soft') {
    color.addRGBPoint(q10, 0.08, 0.03, 0.02)
    color.addRGBPoint(q35, 0.48, 0.20, 0.13)
    color.addRGBPoint(q72, 0.92, 0.62, 0.45)
    color.addRGBPoint(q995, 1.0, 0.88, 0.72)
    opacity.addPoint(q10, 0)
    opacity.addPoint(q35, 0.025)
    opacity.addPoint(q72, 0.10)
    opacity.addPoint(q995, 0.35)
  } else if (mode === 'bone') {
    color.addRGBPoint(q35, 0.10, 0.025, 0.005)
    color.addRGBPoint(q55, 0.52, 0.16, 0.025)
    color.addRGBPoint(q72, 0.88, 0.42, 0.08)
    color.addRGBPoint(q96, 1.0, 0.82, 0.46)
    color.addRGBPoint(q995, 1.0, 0.98, 0.90)
    opacity.addPoint(q35, 0)
    opacity.addPoint(q55, 0.02)
    opacity.addPoint(q72, 0.12)
    opacity.addPoint(q86, 0.38)
    opacity.addPoint(q995, 0.88)
  } else {
    color.addRGBPoint(q55, 0.12, 0.03, 0.005)
    color.addRGBPoint(q72, 0.68, 0.24, 0.025)
    color.addRGBPoint(q86, 0.96, 0.58, 0.18)
    color.addRGBPoint(q96, 1.0, 0.88, 0.58)
    color.addRGBPoint(q995, 1.0, 1.0, 0.96)
    opacity.addPoint(q55, 0)
    opacity.addPoint(q72, 0.035)
    opacity.addPoint(q86, 0.24)
    opacity.addPoint(q96, 0.72)
    opacity.addPoint(q995, 0.96)
  }

  property.setRGBTransferFunction?.(0, color)
  property.setScalarOpacity?.(0, opacity)
  property.setInterpolationTypeToLinear?.()
  property.setShade?.(true)
  property.setAmbient?.(0.18)
  property.setDiffuse?.(0.82)
  property.setSpecular?.(0.24)
  property.setSpecularPower?.(18)
  property.setUseGradientOpacity?.(0, true)
  property.setGradientOpacityMinimumValue?.(0, q55)
  property.setGradientOpacityMinimumOpacity?.(0, 0)
  property.setGradientOpacityMaximumValue?.(0, q96)
  property.setGradientOpacityMaximumOpacity?.(0, 1)
  actor.getMapper?.()?.setAutoAdjustSampleDistances?.(false)
  actor.getMapper?.()?.setSampleDistance?.(0.55)
  viewport.render?.()
}
