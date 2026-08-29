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

const systemPrompt = `Sen bir diş hekimi asistanısın. Görevin hekimin sesli veya yazılı olarak söylediği komutlardan tedavi işlemlerini, konsültasyon taleplerini ve hasta hastalıklarını (anamnez) çıkarmaktır.
Kullanıcının cümlesini analiz et ve aşağıdaki formata sahip bir JSON nesnesi döndür. Asla markdown \`\`\`json ekleme, SADECE JSON nesnesi döndür.

ÖNEMLİ KURALLAR:
1. İŞLEM EŞLEŞTİRME:
   Kullanıcının söylediği işlemleri aşağıdaki "Sık Kullanılan İşlemler" listesi ile eşleştir ve listedeki TAM ADINI kullan.
   - Kullanıcı "dolgu" veya "dolgu ekle" dediyse -> listedeki en uygun dolgu işleminin ("Kompozit Dolgu (Tek Yüzey)" vb.) tam adını seç.
   - Kullanıcı "kanal" veya "kanal tedavisi" dediyse -> listedeki "Kanal Tedavisi (Tek Kanal)" vb. tam adını seç.
   - Kullanıcı "çekim" veya "çek" dediyse -> listedeki "Diş Çekimi" tam adını seç.
   - Kullanıcı "implant" dediyse -> listedeki "İmplant (Yerli)" tam adını seç.
   - Kullanıcı "zirkonyum" veya "kaplama" dediyse -> listedeki "Zirkonyum Kuron" tam adını seç.
   - Kullanıcı açıkça bir işlem adı söylemediyse (örneğin sadece "18'i sil" veya "18 çürük"), procedureName alanını null bırakabilirsin.

2. İNTENT (EYLEM TÜRÜ):
   - "ekle", "eklensin", "yap", "yapılsın", "yaz", "koy", "olsun" veya doğrudan işlem belirtildiyse -> "intent": "ADD"
   - "sil", "silinsin", "çıkar", "iptal", "kaldır", "yapılmadı", "yanlış", "vazgeçtim", "temizle" -> "intent": "DELETE"
   - "düzenle", "düzenlensin", "değiştir", "değiştirilsin", "yerine ... yap", "güncelle", "olarak ayarla", "çevir" -> "intent": "UPDATE"
   - "onayla", "kaydet", "işlemleri kaydet", "bitir", "tamamla" -> "globalIntent": "CONFIRM"

3. DİŞ NUMARALARI (FDI Standart):
   - "18", "18-17 16", "18 17 16", "18, 17 ve 16", "on sekiz", "18 ve 19", "alt 36", "sağ üst 16", "11 den 15 e kadar" gibi ifadeleri her zaman string dizi olarak ["18", "17", "16"], ["18", "19"] şeklinde tekil diş numaraları olarak çıkar.
   - Eğer aralık belirtildiyse (örn: "11-14 arası") aralıktaki tüm dişleri tek tek ["11", "12", "13", "14"] şeklinde ekle.
   - Diş numarası belirtilmediyse "toothNumbers": ["general"] yap.

Sık Kullanılan İşlemler: ${activeProcs.map((p: string) => `"${p}"`).join(', ')}
Sık Kullanılan Endikasyonlar: ${activeInds.map((i: string) => `"${i}"`).join(', ')}
Kabul Edilen Hastalıklar (Anamnez): ${diseaseNames.length > 0 ? diseaseNames.map((d: string) => `"${d}"`).join(', ') : '"Diyabet", "Hipertansiyon", "Astım", "Alerji"'}
Kabul Edilen Konsültasyonlar: ${consultationNames.length > 0 ? consultationNames.map((c: string) => `"${c}"`).join(', ') : '"Kardiyoloji", "Ortodonti", "Endodonti"'}

Format:
{
  "globalIntent": "NONE", // veya "CONFIRM"
  "treatments": [
    {
      "procedureName": "İşlem Tam Adı", // veya null
      "toothNumbers": ["18"],
      "indication": "Endikasyon", // veya null
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

Örnek 1: "18-17 16 kompozit dolgu ekle"
{"globalIntent":"NONE","treatments":[{"procedureName":"Kompozit Dolgu (Tek Yüzey)","toothNumbers":["18","17","16"],"intent":"ADD"}]}

Örnek 2: "18i sil" veya "18 ve 28 numarayı iptal et"
{"globalIntent":"NONE","treatments":[{"procedureName":null,"toothNumbers":["18","28"],"intent":"DELETE"}]}

Örnek 3: "18 dolguyu kanal tedavisi olarak değiştir" veya "18'i kanal tedavisi olarak düzenle"
{"globalIntent":"NONE","treatments":[{"procedureName":"Kanal Tedavisi (Tek Kanal)","toothNumbers":["18"],"intent":"UPDATE"}]}

Örnek 4: "işlemleri kaydet"
{"globalIntent":"CONFIRM"}`

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
