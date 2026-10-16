/**
 * Mic capture worklet - downsamples from native sample rate to 16kHz
 * Sends Int16Array chunks (320 samples = 20ms at 16kHz) via postMessage
 */
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetRate = 16000
    this.buffer = []
    this.phase = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true

    const ratio = sampleRate / this.targetRate

    for (let i = 0; i < channel.length; i++) {
      this.phase += 1
      if (this.phase >= ratio) {
        this.phase -= ratio
        this.buffer.push(channel[i])
      }
    }

    // Send 320 samples at a time (20ms chunks at 16kHz)
    while (this.buffer.length >= 320) {
      const chunk = this.buffer.splice(0, 320)

      // Noise gate: compute RMS energy of the chunk. If below threshold (0.02),
      // send silence instead of actual audio to prevent AI VAD from treating
      // ambient sounds (keyboard clicks, glass on table, etc.) as speech.
      let sumSq = 0
      for (let j = 0; j < chunk.length; j++) sumSq += chunk[j] * chunk[j]
      const rms = Math.sqrt(sumSq / chunk.length)

      const int16 = new Int16Array(chunk.length)
      if (rms >= 0.02) {
        for (let j = 0; j < chunk.length; j++) {
          int16[j] = Math.max(-32768, Math.min(32767, Math.round(chunk[j] * 32767)))
        }
      }
      // If rms < 0.02, int16 stays all zeros (silence)

      this.port.postMessage({ pcmBuffer: int16.buffer, level: rms }, [int16.buffer])
    }
    return true
  }
}

registerProcessor('mic-processor', MicProcessor)
