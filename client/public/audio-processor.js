// AudioWorklet processor for capturing microphone audio as PCM L16.
// Runs in a separate audio thread — no access to window/btoa.
// Sends raw Int16 buffer to main thread for base64 encoding.

class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    // Convert Float32 to Int16 PCM
    const int16 = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);

    // Send raw bytes + level to main thread (base64 encoding happens there)
    this.port.postMessage(
      {
        pcmBuffer: int16.buffer,
        level: Math.min(rms * 5, 1),
      },
      [int16.buffer]
    );

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
