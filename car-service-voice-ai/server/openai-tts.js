import OpenAI from 'openai';

// Onyx: Kalın, ciddi ve güvenilir erkek sesi (Oto servis için çok uygun)
// Onyx: Kalın, ciddi erkek. Nova: Çok enerjik ve canlı kadın sesi. Alloy: Dost canlısı standart ses.
const VOICE = 'nova'; 

export class OpenAITTS {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[OpenAI TTS] Uyarı: OPENAI_API_KEY bulunamadı!');
    }
    this.openai = new OpenAI({ apiKey: apiKey });
  }

  async synthesize(text) {
    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: VOICE,
        input: text,
      });
      
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error('[OpenAI TTS Error]', error.message);
      return null;
    }
  }
}
