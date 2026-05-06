import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// tr-TR-AhmetNeural (Erkek) veya tr-TR-EmelNeural (Kadın)
const VOICE = 'tr-TR-AhmetNeural';

export class EdgeTTS {
  constructor() {
    this.tts = new MsEdgeTTS();
  }

  async synthesize(text) {
    try {
      await this.tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      
      const { audioStream } = this.tts.toStream(text);
      
      return new Promise((resolve, reject) => {
        const chunks = [];
        audioStream.on('data', chunk => chunks.push(chunk));
        audioStream.on('end', () => resolve(Buffer.concat(chunks)));
        audioStream.on('error', err => reject(err));
      });
    } catch (error) {
      console.error('[Edge TTS Error]', error);
      return null;
    }
  }
}
