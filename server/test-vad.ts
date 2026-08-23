import { NonRealTimeVAD } from '@ricky0123/vad-node'

async function run() {
  console.log('Loading VAD...')
  const vad = await NonRealTimeVAD.new({})
  console.log('VAD loaded successfully!')
}

run().catch(e => console.error('Error:', e))
