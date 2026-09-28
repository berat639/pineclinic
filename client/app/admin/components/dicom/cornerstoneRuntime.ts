'use client'

/** Cornerstone is process-wide in the browser; initialize it once. */
let runtimePromise: Promise<any> | undefined
let toolsRegistered = false

function filterKnownInvalidAgeTagWarning(dcmjs: any) {
  const log = dcmjs?.log
  if (!log || log.__voiceAiInvalidAgeFilterInstalled) return

  const originalMethodFactory = log.methodFactory
  log.methodFactory = function (methodName: string, level: number, loggerName: string) {
    const originalMethod = originalMethodFactory.call(this, methodName, level, loggerName)
    if (methodName !== 'error') return originalMethod

    return (...args: unknown[]) => {
      const message = args[0]
      // Some legacy modalities write Patient Age (VR AS) as e.g. "34" instead
      // of the required four-character value "034Y". dcmjs only logs this
      // validation warning; pixel decoding remains valid. Keep every other
      // dcmjs error visible in the browser console.
      if (typeof message === 'string' && /^Invalid length for fixed length tag, vr AS, length 4 != \d+$/.test(message)) return
      originalMethod(...args)
    }
  }
  log.setLevel(log.getLevel(), false)
  Object.defineProperty(log, '__voiceAiInvalidAgeFilterInstalled', { value: true })
}

export function getCornerstoneRuntime(): Promise<any> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
      import('@cornerstonejs/metadata'),
      import('dcmjs'),
    ]).then(([core, tools, dicomImageLoader, metadata, dcmjs]) => {
      filterKnownInvalidAgeTagWarning(dcmjs)
      if (!core.isCornerstoneInitialized()) core.init()
      core.volumeLoader.registerVolumeLoader(
        'cornerstoneStreamingImageVolume',
        core.cornerstoneStreamingImageVolumeLoader as any,
      )
      dicomImageLoader.init({ maxWebWorkers: 1 })
      tools.init()
      if (!toolsRegistered) {
        [
          tools.PanTool, tools.ZoomTool, tools.WindowLevelTool, tools.StackScrollTool,
          tools.LengthTool, tools.AngleTool, tools.ArrowAnnotateTool,
          tools.RectangleROITool, tools.EllipticalROITool, tools.PlanarFreehandROITool,
          tools.EraserTool,
          tools.CrosshairsTool,
          tools.TrackballRotateTool,
        ].forEach((tool) => tools.addTool(tool))
        toolsRegistered = true
      }
      return { core, tools, dicomImageLoader, metadata }
    })
  }
  return runtimePromise
}
