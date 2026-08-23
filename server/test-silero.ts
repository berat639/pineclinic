import * as ort from 'onnxruntime-node'
import * as fs from 'fs/promises'
import { Silero } from '@ricky0123/vad-node/dist/_common/index.js'

async function run() {
  const modelFetcher = async () => {
    const contents = await fs.readFile('node_modules/@ricky0123/vad-node/dist/silero_vad.onnx')
    return contents.buffer
  }
  const silero = await Silero.new(ort, modelFetcher)
  console.log("Silero initialized successfully!")
}
run().catch(console.error)
