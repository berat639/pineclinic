// AudioWorklet processor for capturing microphone audio as PCM L16 (16 kHz).
// Runs in a separate audio thread — no access to window/btoa.
// The AudioContext runs at the device's native sample rate (Firefox rejects a
// forced 16 kHz context); downsampling to 16 kHz happens here.
// Includes a toggleable RNNoise-inspired speech band filter + impulse/cough suppressor.

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 320; // 20 ms at 16 kHz

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.floatChunk = new Float32Array(CHUNK_SAMPLES);
    this.outLen = 0;

    // Gürültü ve öksürük süzgeci durumu (varsayılan: açık)
    this.noiseFilterEnabled = true;
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;
    this.noiseFloor = 0.0035;
    this.voicedStreak = 0;
    this.hangoverFrames = 0;

    this.port.onmessage = (event) => {
      const data = event && event.data;
      if (data && data.type === "config" && typeof data.noiseFilter === "boolean") {
        this.noiseFilterEnabled = data.noiseFilter;
      }
    };
  }

  processFrame(samples) {
    let sumSq = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let prev = samples[0] || 0;

    for (let i = 0; i < CHUNK_SAMPLES; i++) {
      let s = samples[i];
      if (this.noiseFilterEnabled) {
        // ~85 Hz 1. derece yüksek geçiren filtre (nefes patlaması ve masa uğultusunu keser)
        const filtered = 0.967 * (this.hpPrevOut + s - this.hpPrevIn);
        this.hpPrevIn = s;
        this.hpPrevOut = filtered;
        s = Math.max(-1, Math.min(1, filtered));
        samples[i] = s;
      }
      const abs = Math.abs(s);
      if (abs > peak) peak = abs;
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
        zeroCrossings++;
      }
      prev = s;
    }

    const rms = Math.sqrt(sumSq / CHUNK_SAMPLES);
    const rawLevel = Math.min(rms * 5, 1);

    if (!this.noiseFilterEnabled) {
      const pcm = new Int16Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        const s = samples[i];
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return { pcm, level: rawLevel, rawLevel, suppressed: false };
    }

    const crestFactor = rms > 0.0001 ? peak / rms : 0;
    const zcr = zeroCrossings / CHUNK_SAMPLES;

    // Arka plan gürültü tabanını (noise floor) sessiz anlarda dinamik güncelle
    if (rms < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.92 + rms * 0.08;
    } else if (rms < this.noiseFloor * 1.8 && this.voicedStreak === 0) {
      this.noiseFloor = this.noiseFloor * 0.985 + rms * 0.015;
    }
    this.noiseFloor = Math.max(0.0015, Math.min(0.025, this.noiseFloor));

    const gateThreshold = Math.max(0.0045, this.noiseFloor * 2.2);
    // Öksürük, hapşırık ve masa tıklaması: ani tepe/RMS oranı veya yüksek sıfır geçişi
    const isImpulseOrCough =
      rms > gateThreshold &&
      this.voicedStreak < 4 &&
      (crestFactor > 4.6 || zcr > 0.41);

    let passSpeech = false;
    let suppressed = false;

    if (isImpulseOrCough) {
      this.voicedStreak = 0;
      suppressed = true;
    } else if (rms >= gateThreshold) {
      this.voicedStreak++;
      this.hangoverFrames = 12; // 240 ms konuşma sonu koruma kuyruğu
      passSpeech = true;
    } else if (this.hangoverFrames > 0) {
      this.hangoverFrames--;
      passSpeech = true;
    } else {
      this.voicedStreak = 0;
      suppressed = rms > 0.001;
    }

    // Konuşma başlangıcındaki ilk hecelerin yutulmaması için yalnızca ani öksürük/darbe
    // seslerini güçlü bastır (0.08), sessiz arka planı ise yumuşak zayıflat (0.65).
    const gain = isImpulseOrCough ? 0.08 : passSpeech ? 1.0 : 0.65;
    const pcm = new Int16Array(CHUNK_SAMPLES);
    for (let i = 0; i < CHUNK_SAMPLES; i++) {
      const s = samples[i] * gain;
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return {
      pcm,
      level: passSpeech ? rawLevel : 0,
      rawLevel,
      suppressed: isImpulseOrCough || (suppressed && !passSpeech),
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const data = input[0];
    const n = data.length;

    while (this.pos < n) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = data[i];
      const b = i + 1 < n ? data[i + 1] : data[i];
      let s = a + (b - a) * frac;
      if (this.ratio > 1) {
        const end = Math.min(n, Math.floor(this.pos + this.ratio));
        let acc = 0;
        let count = 0;
        for (let k = i; k < Math.max(end, i + 1); k++) {
          acc += data[k];
          count++;
        }
        s = acc / count;
      }
      s = Math.max(-1, Math.min(1, s));
      this.floatChunk[this.outLen++] = s;
      this.pos += this.ratio;

      if (this.outLen === CHUNK_SAMPLES) {
        const { pcm, level, rawLevel, suppressed } = this.processFrame(this.floatChunk);
        const buffer = pcm.buffer;
        this.port.postMessage(
          { pcmBuffer: buffer, level, rawLevel, suppressed },
          [buffer]
        );
        this.outLen = 0;
      }
    }
    this.pos -= n;
    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
