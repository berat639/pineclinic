import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { text, procNames = [], indNames = [], diseaseNames = [], consultationNames = [] } = await req.json()
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 })
    }

    const defaultProcs = ["Kompozit Dolgu", "Kanal Tedavisi", "Çekim", "Detertraj", "İmplant"]
    const defaultInds = ["Derin Çürük", "Kırık", "Apikal Lezyon", "Kök Kırığı", "Ağrı"]

    const activeProcs = procNames.length > 0 ? procNames : defaultProcs
    const activeInds = indNames.length > 0 ? indNames : defaultInds

const systemPrompt = `Sen bir diş hekimi asistanısın. Görevin hekimin sesli veya yazılı olarak söylediği komutlardan tedavi işlemlerini, diş seçim komutlarını, anatomik yüzey ve bölümleri, konsültasyon taleplerini ve hasta hastalıklarını (anamnez) çıkarmaktır.
Kullanıcının cümlesini analiz et ve aşağıdaki formata sahip bir JSON nesnesi döndür. Asla markdown \`\`\`json ekleme, SADECE JSON nesnesi döndür.

ÖNEMLİ KURALLAR:
1. SEÇİM NİYETLERİ (selectIntent):
   Eğer kullanıcı tedavi işleminden ziyade veya işlemle birlikte diş veya bölge seçimi söylüyorsa:
   - "tüm ağız", "tüm dişler", "bütün dişler", "tüm ağzı seç" -> "selectIntent": "SELECT_ALL"
   - "tüm üst", "tüm üst çene", "üst çeneyi seç", "üst dişler" -> "selectIntent": "SELECT_MAXILLA"
   - "tüm alt", "tüm alt çene", "alt çeneyi seç", "alt dişler" -> "selectIntent": "SELECT_MANDIBLE"
   - "1. kadran", "birinci kadran", "sağ üst kadran" -> "selectIntent": "SELECT_Q1"
   - "2. kadran", "ikinci kadran", "sol üst kadran" -> "selectIntent": "SELECT_Q2"
   - "3. kadran", "üçüncü kadran", "sol alt kadran" -> "selectIntent": "SELECT_Q3"
   - "4. kadran", "dördüncü kadran", "sağ alt kadran" -> "selectIntent": "SELECT_Q4"
   - "ön dişler", "kesici dişler", "anterior", "önleri seç" -> "selectIntent": "SELECT_ANTERIOR"
   - "arka dişler", "azı dişleri", "posterior", "arkaları seç" -> "selectIntent": "SELECT_POSTERIOR"
   - "seçimi temizle", "seçimleri kaldır", "seçimleri sıfırla", "seçimi bırak" -> "selectIntent": "CLEAR_SELECTION"
   - Sadece diş seçimi belirtildiyse (örn: "21'i seç", "16 ve 26 numarayı işaretle") -> "selectIntent": "SELECT_TEETH"
   - Eğer seçim odaklı bir cümle değilse -> "selectIntent": "NONE"

2. YÜZEY VE ANATOMİK BÖLÜM ÇIKARMA:
   Kullanıcı işlem söylerken yüzey veya bölüm belirtiyorsa treatments içine ekle:
   - Yüzeyler (surfaces):
     * "oklüzal", "çiğneme" -> ["O"]
     * "mezyal", "ön arayüz" -> ["M"]
     * "distal", "arka arayüz" -> ["D"]
     * "bukkal", "vestibüler", "yanak", "dudak" -> ["B"]
     * "lingual", "palatinal", "dil", "damak" -> ["L"]
     * "MOD", "mezyo-oklüzo-distal" -> ["M", "O", "D"]
     * "MO", "mezyo-oklüzal" -> ["M", "O"]
     * "DO", "disto-oklüzal" -> ["D", "O"]
   - Anatomik Bölüm (section):
     * "kuron", "kron", "taç" -> "crown"
     * "kole", "boyun", "diş boynu", "sement" -> "cervical"
     * "kök", "kök ucu", "apeks" -> "root"

3. İŞLEM EŞLEŞTİRME:
   Kullanıcının söylediği işlemleri aşağıdaki "Sık Kullanılan İşlemler" listesi ile eşleştir ve listedeki TAM ADINI kullan.
   - Kullanıcı "dolgu" veya "dolgu ekle" dediyse -> listedeki en uygun dolgu işleminin ("Kompozit Dolgu (Tek Yüzey)" vb.) tam adını seç.
   - Kullanıcı "kanal" veya "kanal tedavisi" dediyse -> listedeki "Kanal Tedavisi (Tek Kanal)" vb. tam adını seç.
   - Kullanıcı "çekim" veya "çek" dediyse -> listedeki "Diş Çekimi" tam adını seç.
   - Kullanıcı "implant" dediyse -> listedeki "İmplant (Yerli)" tam adını seç.
   - Kullanıcı "zirkonyum" veya "kaplama" dediyse -> listedeki "Zirkonyum Kuron" tam adını seç.
   - Kullanıcı açıkça bir işlem adı söylemediyse (örneğin sadece "18'i sil" veya "18 çürük"), procedureName alanını null bırakabilirsin.

4. İNTENT (EYLEM TÜRÜ):
   - "ekle", "eklensin", "yap", "yapılsın", "yaz", "koy", "olsun" veya doğrudan işlem belirtildiyse -> "intent": "ADD"
   - "sil", "silinsin", "çıkar", "iptal", "kaldır", "yapılmadı", "yanlış", "vazgeçtim", "temizle" -> "intent": "DELETE"
   - "düzenle", "düzenlensin", "değiştir", "değiştirilsin", "yerine ... yap", "güncelle", "olarak ayarla", "çevir" -> "intent": "UPDATE"
   - "onayla", "kaydet", "işlemleri kaydet", "bitir", "tamamla" -> "globalIntent": "CONFIRM"

5. DİŞ NUMARALARI (FDI Standart):
   - "18", "18-17 16", "18 17 16", "18, 17 ve 16", "on sekiz", "alt 36", "sağ üst 16", "11 den 15 e kadar" gibi ifadeleri her zaman string dizi olarak ["18", "17", "16"] şeklinde çıkar.
   - Eğer aralık belirtildiyse (örn: "11-14 arası") aralıktaki tüm dişleri tek tek ["11", "12", "13", "14"] şeklinde ekle.
   - Çene belirtildiyse (örn: "tüm üst çene dolgu"):
     * Üst çene: ["11","12","13","14","15","16","17","18","21","22","23","24","25","26","27","28"]
     * Alt çene: ["31","32","33","34","35","36","37","38","41","42","43","44","45","46","47","48"]
   - Diş numarası belirtilmediyse "toothNumbers": ["general"] yap.

Sık Kullanılan İşlemler: ${activeProcs.map((p: string) => `"${p}"`).join(', ')}
Sık Kullanılan Endikasyonlar: ${activeInds.map((i: string) => `"${i}"`).join(', ')}
Kabul Edilen Hastalıklar (Anamnez): ${diseaseNames.length > 0 ? diseaseNames.map((d: string) => `"${d}"`).join(', ') : '"Diyabet", "Hipertansiyon", "Astım", "Alerji"'}
Kabul Edilen Konsültasyonlar: ${consultationNames.length > 0 ? consultationNames.map((c: string) => `"${c}"`).join(', ') : '"Kardiyoloji", "Ortodonti", "Endodonti"'}

Format:
{
  "globalIntent": "NONE", // veya "CONFIRM"
  "selectIntent": "NONE", // "SELECT_ALL", "SELECT_MAXILLA", "SELECT_MANDIBLE", "SELECT_Q1", "SELECT_Q2", "SELECT_Q3", "SELECT_Q4", "SELECT_ANTERIOR", "SELECT_POSTERIOR", "CLEAR_SELECTION", "SELECT_TEETH" veya "NONE"
  "treatments": [
    {
      "procedureName": "İşlem Tam Adı", // veya null
      "toothNumbers": ["36"],
      "indication": "Endikasyon", // veya null
      "surfaces": ["M", "O", "D"], // veya []
      "section": "crown", // "crown", "cervical", "root" veya null
      "cost": 1500,
      "intent": "ADD" // "ADD", "DELETE" veya "UPDATE"
    }
  ],
  "diseases": [
    {
      "name": "Diyabet",
      "intent": "ADD"
    }
  ],
  "consultations": [
    {
      "name": "Kardiyoloji Konsültasyonu",
      "intent": "ADD"
    }
  ]
}

Örnek 1: "36 MOD kompozit dolgu ekle"
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","treatments":[{"procedureName":"Kompozit Dolgu (Tek Yüzey)","toothNumbers":["36"],"surfaces":["M","O","D"],"section":"crown","intent":"ADD"}]}

Örnek 2: "tüm üst çeneyi seç"
{"globalIntent":"NONE","selectIntent":"SELECT_MAXILLA","treatments":[]}

Örnek 3: "21 kuron zirkonyum kaplama"
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","treatments":[{"procedureName":"Zirkonyum Kuron","toothNumbers":["21"],"section":"crown","surfaces":[],"intent":"ADD"}]}

Örnek 4: "seçimleri temizle"
{"globalIntent":"NONE","selectIntent":"CLEAR_SELECTION","treatments":[]}`

    const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']
    let data: any
    let fetchError

    for (const model of models) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: text }]
            }],
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            }
          })
        })

        clearTimeout(timeoutId)

        data = await response.json()
        if (data.error && data.error.code === 503) {
          console.warn(`Model ${model} is overloaded, trying next model...`)
          continue
        }

        break
      } catch (err) {
        console.warn(`Fetch error for model ${model}:`, err)
        fetchError = err
      }
    }

    if (!data || data.error) {
      console.error('AI API Error:', data?.error || fetchError)
      return NextResponse.json({ error: 'AI API Hatası', details: data?.error || 'Unknown error' }, { status: 500 })
    }

    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!contentText) {
      return NextResponse.json({ result: [] })
    }

    let parsed = []
    try {
      parsed = JSON.parse(contentText)
    } catch (e) {
      console.error('AI JSON Parse Error:', e, contentText)
      // markdown temizlemeyi deneyelim
      try {
        const cleaned = contentText.replace(/```json/g, '').replace(/```/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch (e2) {
        return NextResponse.json({ error: 'Parse Error', raw: contentText })
      }
    }

    return NextResponse.json({ result: parsed })

  } catch (err: any) {
    console.error('AI Parse API Error:', err)
    return NextResponse.json({ error: 'Sunucu Hatası' }, { status: 500 })
  }
}
