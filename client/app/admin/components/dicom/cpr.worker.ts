import { reconstructDentalCpr, type CprOptions, type CprPanoramaCache, type CprVolume } from './cprReconstruction'

let volume: CprVolume | undefined
const cache: CprPanoramaCache = {}

self.onmessage = (event: MessageEvent<{ id: number; volume?: CprVolume; options: CprOptions }>) => {
  const { id, options } = event.data
  if (event.data.volume) volume = event.data.volume
  try {
    if (!volume) throw new Error('CPR hacmi hazır değil.')
    const result = reconstructDentalCpr(volume, options, cache)
    let visible = false
    for (let index = 0; index < result.panorama.data.length; index += 4) {
      if (result.panorama.data[index] > 0) { visible = true; break }
    }
    if (!visible) throw new Error('Panoramik CPR için hacimde görüntülenebilir voxel bulunamadı.')
    // Keep the cached panorama buffer owned by this worker; do not detach it.
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Panoramik CPR oluşturulamadı.' })
  }
}
