class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 50ms chunk (Kalite ve hız için en optimum değer)
    this.chunkSize = Math.round(sampleRate * 0.05);
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferIdx = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.bufferIdx++] = input[i];

      if (this.bufferIdx >= this.chunkSize) {
        let sumSquares = 0;
        const out = new Int16Array(this.chunkSize);
        for (let j = 0; j < this.chunkSize; j++) {
          sumSquares += this.buffer[j] * this.buffer[j];
          out[j] = Math.max(-32768, Math.min(32767, Math.round(this.buffer[j] * 32767)));
        }
        
        // Ses seviyesini (RMS) ölç
        const rms = Math.sqrt(sumSquares / this.chunkSize);
        
        // NOISE GATE (Gürültü Geçidi): 
        // Kullanıcının sesi biraz kısık gelse de algılayabilmesi için eşiği 0.015'e indirdik.
        if (rms < 0.015) {
          out.fill(0); // Tamamen sessizlik yolla
        }
        
        // Ana thread'e RMS verisiyle birlikte yolla
        this.port.postMessage({ buffer: out.buffer, rms }, [out.buffer]);
        this.bufferIdx = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
