import { GoogleGenerativeAI } from '@google/generative-ai';
import * as db from './appointments.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = 'gemini-1.5-flash-8b';

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

const TOOL_DECLARATIONS = [
  {
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
];

async function handleFunctionCall(name, args) {
  if (name === 'randevuAl') {
    console.log('[FUNCTION] randevuAl:', args);
    const result = await db.create(args);
    return result;
  }
  return { error: 'Bilinmeyen fonksiyon' };
}

export class GeminiChat {
  constructor() {
    this.model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    });
    this.chat = this.model.startChat({ history: [] });
  }

  async sendMessage(userText) {
    const result = await this.chat.sendMessage(userText);
    const response = result.response;
    
    // Function call kontrolü
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const fnResult = await handleFunctionCall(call.name, call.args);
      
      const followUp = await this.chat.sendMessage([{
        functionResponse: {
          name: call.name,
          response: fnResult
        }
      }]);
      
      return { text: followUp.response.text() };
    }

    // Normal metin cevabı
    return { text: response.text() };
  }
}
