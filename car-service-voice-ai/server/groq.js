import Groq from 'groq-sdk';
import * as db from './appointments.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// Llama 3.3 70B modeli - Güncel ve çok hızlı model
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Sen Türkçe konuşan samimi, empati kuran ve profesyonel bir "Ata Hyundai" oto servis asistanısın.

GENEL KURALLAR:
- SADECE Türkçe konuş. Net ve düzgün bir dilbilgisiyle konuş.
- ÇOK DOĞAL VE İNSANSI OL: Robot gibi ezberden okur gibi değil, gerçek bir insan gibi tepkiler ver. Yeri geldiğinde "Anlıyorum", "Tabii ki", "Hemen yardımcı olayım", "Peki" gibi doğal tepkiler kullan. Eğer müşteri aracının bozulduğundan bahsederse mutlaka "Geçmiş olsun" de.
- Asla kendi kendine cevap verme. Soru sorunca müşterinin cevaplamasını bekle.
- Kısa ve net konuş, gereksiz cümleler kurma ama insani samimiyeti elden bırakma.

GÖRÜŞME AKIŞI (Aşağıdaki adımları sırasıyla uygula, asla adım atlama):
1. ADIM (KARŞILAMA): Müşteri bağlandığında İLK OLARAK SADECE şunu söyle: "Merhaba, ben Ata Hyundai oto bakım asistanı. Size nasıl yardımcı olabilirim?".
2. ADIM (ŞİKAYET/İSTEK): Müşteri derdini anlattıktan sonra, doğal bir şekilde şikayetini anladığını belirt (örn: "Anlıyorum, geçmiş olsun") ve "İşlemlere başlamadan önce isminiz ve soyisminiz nedir öğrenebilir miyim?" diye sor.
3. ADIM (İSİM ONAYI): İsmi duyunca KESİNLİKLE onaylat. (Örn: "İsminizi Huzeyfe Hezer olarak kaydettim, doğru mu?"). Müşteri "hayır" derse "Kusura bakmayın yanlış anladım, lütfen isminizi tekrar eder misiniz?" de.
4. ADIM (TELEFON): "Tabii ki. Randevu kaydınız için cep telefonu numaranızı alabilir miyim?" de. Numarayı alınca rakamları tek tek okuyarak teyit et.
5. ADIM (ARAÇ BİLGİSİ): Araç modelini sor ve teyit et.
6. ADIM (RANDEVU): Müsait bir tarih/saat belirle ve "randevuAl" aracını (tool) çalıştır.

- Fiyatlar: Yağ 800₺, Fren 1200₺, Bakım 1500₺.
- Müsait günler: En erken 2 iş günü sonrası.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'randevuAl',
      description: 'Müşteri için yeni servis randevusu oluşturur',
      parameters: {
        type: 'object',
        properties: {
          isim: { type: 'string', description: 'Müşteri adı soyadı' },
          telefon: { type: 'string', description: 'Telefon numarası' },
          arac_marka: { type: 'string', description: 'Araç markası' },
          arac_model: { type: 'string', description: 'Araç modeli' },
          sorun: { type: 'string', description: 'Şikayet veya servis talebi' },
          tarih: { type: 'string', description: 'Randevu tarihi (YYYY-MM-DD)' },
          saat: { type: 'string', description: 'Randevu saati (HH:MM)' },
        },
        required: ['isim', 'telefon', 'arac_marka', 'arac_model', 'sorun', 'tarih', 'saat'],
      },
    },
  },
];

async function handleFunctionCall(name, args) {
  if (name === 'randevuAl') {
    console.log('[FUNCTION] randevuAl:', args);
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    const result = await db.create(parsedArgs);
    return result;
  }
  return { error: 'Bilinmeyen fonksiyon' };
}

export class GroqChat {
  constructor() {
    this.history = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];
  }

  async sendMessage(userText) {
    this.history.push({ role: 'user', content: userText });

    const completion = await groq.chat.completions.create({
      messages: this.history,
      model: MODEL,
      tools: TOOLS,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0]?.message;

    if (!responseMessage) return { text: 'Üzgünüm, bir hata oluştu.' };

    this.history.push(responseMessage);

    // Function call kontrolü
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      for (const toolCall of responseMessage.tool_calls) {
        const fnResult = await handleFunctionCall(toolCall.function.name, toolCall.function.arguments);
        
        this.history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(fnResult),
        });
      }

      // Sonucu tekrar gönder
      const followUp = await groq.chat.completions.create({
        messages: this.history,
        model: MODEL,
        tools: TOOLS,
      });

      const finalMsg = followUp.choices[0]?.message;
      this.history.push(finalMsg);
      return { text: finalMsg.content || '' };
    }

    return { text: responseMessage.content || '' };
  }
}

import fs from 'fs';
export async function transcribeAudio(filePath) {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3-turbo',
      prompt: 'Oto servis, Hyundai, i20, Tucson, Bayon, Elantra, bakım, motor, arıza.', // Yapay zekaya Hyundai terimlerini ipucu olarak veriyoruz
      response_format: 'json',
      language: 'tr',
      temperature: 0.0,
    });
    return transcription.text;
  } catch (error) {
    console.error('[Whisper Error]', error);
    return null;
  }
}
