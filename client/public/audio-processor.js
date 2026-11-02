// AudioWorklet processor for capturing microphone audio as PCM L16 (16 kHz).
// Runs in a separate audio thread — no access to window/btoa.
// The AudioContext runs at the device's native sample rate (Firefox rejects a
// forced 16 kHz context); downsampling to 16 kHz happens here.
// Sends raw Int16 buffer to main thread for base64 encoding.

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 320; // 20 ms at 16 kHz

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0; // fractional read position relative to the current block
    this.prev = 0; // last sample of previous block, for interpolation
    this.out = new Int16Array(CHUNK_SAMPLES);
    this.outLen = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const data = input[0];
    const n = data.length;

    // Linear-interpolation resampling with a simple box average to limit aliasing.
    while (this.pos < n) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = data[i];
      const b = i + 1 < n ? data[i + 1] : data[i];
      let s = a + (b - a) * frac;
      if (this.ratio > 1) {
        // average the samples covered by this output step
        const end = Math.min(n, Math.floor(this.pos + this.ratio));
        let acc = 0, count = 0;
        for (let k = i; k < Math.max(end, i + 1); k++) { acc += data[k]; count++; }
        s = acc / count;
      }
      s = Math.max(-1, Math.min(1, s));
      this.out[this.outLen++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.sumSq += s * s;
      this.pos += this.ratio;

      if (this.outLen === CHUNK_SAMPLES) {
        const rms = Math.sqrt(this.sumSq / CHUNK_SAMPLES);
        const buffer = this.out.buffer;
        this.port.postMessage({ pcmBuffer: buffer, level: Math.min(rms * 5, 1) }, [buffer]);
        this.out = new Int16Array(CHUNK_SAMPLES);
        this.outLen = 0;
        this.sumSq = 0;
      }
    }
    this.pos -= n;
    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
