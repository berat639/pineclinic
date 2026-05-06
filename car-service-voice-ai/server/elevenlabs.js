const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam (Ücretsiz planda çalışan erkek sesi)
const MODEL_ID = 'eleven_turbo_v2_5';
const API_BASE = 'https://api.elevenlabs.io/v1';

export class ElevenLabsTTS {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  // REST API ile ses üret — daha stabil, WebSocket gerekmez
  async synthesize(text) {
    const res = await fetch(`${API_BASE}/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
        },
      }),
    });

    if (!res.ok) {
      console.error('[ElevenLabs] Hata:', res.status, await res.text());
      return null;
    }

    return Buffer.from(await res.arrayBuffer());
  }
}
