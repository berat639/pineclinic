import * as ort from 'onnxruntime-node'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
// @ts-ignore
import { Silero, FrameProcessor } from '@ricky0123/vad-node/dist/_common/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let globalSileroModel: any = null

export async function initNeuralVAD() {
  if (globalSileroModel) return
  const modelPath = require.resolve('@ricky0123/vad-node/dist/silero_vad.onnx')
  const modelFetcher = async () => {
    const contents = await fs.readFile(modelPath)
    return contents.buffer
  }
  globalSileroModel = await Silero.new(ort, modelFetcher)
}

export class NeuralVAD {
  private processor: any
  public isOpen = false
  public threshold = 0.5
  public readonly shortId: string
  
  private sampleBuffer = new Float32Array(1536)
  private sampleIndex = 0

  private totalFrames = 0
  private lastLogAtFrame = 0
  private highFrames = 0
  private isProcessing = false

  constructor(threshold = 0.5, shortId: string) {
    this.threshold = threshold
    this.shortId = shortId
    
    const options = {
      positiveSpeechThreshold: threshold,
      negativeSpeechThreshold: threshold - 0.15,
      preSpeechPadFrames: 1,
      redemptionFrames: 4, // ~400ms trailing grace period
      frameSamples: 1536,
      minSpeechFrames: 1,
      submitUserSpeechOnPause: false,
    }

    this.processor = new FrameProcessor(
      async (frame: Float32Array) => {
        return await globalSileroModel.process(frame)
      },
      () => globalSileroModel.reset_state(),
      options
    )
  }

  /**
   * Processes a chunk of audio (8kHz Int16 Buffer, usually 320 bytes = 160 samples)
   * We must upsample to 16kHz before processing, or assume it's already 16kHz.
   * Wait, Asterisk provides 8kHz (160 samples per 20ms).
   * Gemini needs 16kHz. We upsample to 16kHz in the main loop anyway!
   * So this method expects a 16kHz Int16 Buffer (usually 640 bytes = 320 samples).
   */
  public async process(pcm16: Buffer): Promise<Buffer[]> {
    if (this.threshold <= 0) {
      this.isOpen = true
      return [pcm16] // gate disabled
    }

    // Convert Int16 Buffer to Float32Array
    const numSamples = pcm16.length / 2
    const float32 = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      float32[i] = pcm16.readInt16LE(i * 2) / 32768.0
    }

    // Buffer management
    let remaining = float32.length
    let offset = 0
    let lastProb = 0

    while (remaining > 0) {
      const needed = 1536 - this.sampleIndex
      const toCopy = Math.min(needed, remaining)
      this.sampleBuffer.set(float32.subarray(offset, offset + toCopy), this.sampleIndex)
      this.sampleIndex += toCopy
      offset += toCopy
      remaining -= toCopy

      if (this.sampleIndex === 1536) {
        // Run VAD on full 96ms frame
        const result = await this.processor.process(this.sampleBuffer)
        this.sampleIndex = 0 // reset buffer
        this.totalFrames++
        
        if (result.probs) {
          lastProb = result.probs.isSpeech
          if (lastProb > this.threshold) {
            this.highFrames++
            this.isOpen = true
          } else {
            this.isOpen = false
          }
        }
        
        if (result.msg === 'SPEECH_START') this.isOpen = true
        else if (result.msg === 'SPEECH_END' || result.msg === 'VAD_MISFIRE') this.isOpen = false
      }
    }

    this.maybeLog(lastProb)

    // Return the original buffer if open, else silence
    if (this.isOpen) {
      return [pcm16]
    } else {
      return [Buffer.alloc(pcm16.length, 0)]
    }
  }

  private maybeLog(lastProb: number): void {
    const elapsed = this.totalFrames - this.lastLogAtFrame
    if (elapsed < 50) return // Log roughly every 5 seconds (50 * 96ms = 4.8s)
    
    const pct = Math.round((this.highFrames / elapsed) * 100)
    console.log(`[${this.shortId}] NeuralVAD: ${elapsed}fr | prob=${Math.round(lastProb*100)}% high=${pct}% | thresh=${this.threshold}`)
    
    this.lastLogAtFrame = this.totalFrames
    this.highFrames = 0
  }
}
