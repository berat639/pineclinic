/**
 * AudioStreamPlayer — Real-time audio playback for streaming PCM chunks.
 * Schedules audio buffers seamlessly one after another for gapless playback.
 */
export class AudioStreamPlayer {
  private audioContext: AudioContext;
  private nextStartTime = 0;
  private isActive = true;
  private gainNode: GainNode;

  constructor(sampleRate = 24000) {
    this.audioContext = new AudioContext({ sampleRate });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  /**
   * Add a base64-encoded PCM L16 chunk to the playback queue.
   */
  addChunk(base64Data: string) {
    if (!this.isActive) return;

    const float32 = this.base64ToFloat32(base64Data);
    if (float32.length === 0) return;

    const buffer = this.audioContext.createBuffer(
      1,
      float32.length,
      this.audioContext.sampleRate
    );
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = this.audioContext.currentTime;
    const startTime = Math.max(now, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  get isPlaying(): boolean {
    return this.audioContext.currentTime < this.nextStartTime;
  }

  stop() {
    this.isActive = false;
    try {
      this.audioContext.close();
    } catch {
      // Already closed
    }
  }

  private base64ToFloat32(base64: string): Float32Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  }
}

/**
 * MicrophoneCapture — Captures microphone audio as PCM L16 base64 chunks.
 * Uses AudioWorkletNode (modern API) with ScriptProcessorNode fallback.
 */
export class MicrophoneCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isActive = false;

  async start(
    onChunk: (base64: string) => void,
    onLevel?: (level: number) => void
  ) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);

      // Load AudioWorklet processor
      await this.audioContext.audioWorklet.addModule("/audio-processor.js");

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "mic-processor"
      );

      this.workletNode.port.onmessage = (event) => {
        if (!this.isActive) return;
        const { pcmBuffer, level } = event.data;

        // Convert raw Int16 buffer to base64 in main thread (btoa is available here)
        const bytes = new Uint8Array(pcmBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const pcmBase64 = btoa(binary);

        onChunk(pcmBase64);
        if (onLevel) onLevel(level);
      };

      source.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.isActive = true;
    } catch (err) {
      console.error("Microphone access denied:", err);
      throw err;
    }
  }

  stop() {
    this.isActive = false;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
