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

    const systemPrompt = `Sen bir diş hekimi asistanısın. Görevin hekimin sesli olarak söylediği komutlardan tedavi işlemlerini, konsültasyon taleplerini ve hasta hastalıklarını (anamnez) çıkarmaktır.
Kullanıcının cümlesini analiz et ve aşağıdaki formata sahip bir JSON nesnesi döndür. Asla markdown \`\`\`json ekleme, SADECE JSON nesnesi döndür.

ÖNEMLİ KURAL 1: 
Kullanıcının söylediği işlemleri SADECE aşağıdaki "Sık Kullanılan İşlemler" listesi ile eşleştir. 
Kullanıcı AÇIKÇA bir işlem söylemediyse (örneğin sadece "çürük var" veya "ağrıyor" dediyse), ASLA kendi kendine işlem uydurma. procedureName alanını kesinlikle boş (null) bırak.
Kullanıcının söylediği endikasyonu SADECE aşağıdaki "Sık Kullanılan Endikasyonlar" listesi ile eşleştir. Eğer tam uyan yoksa en yakın olanı seç veya boş bırak.

ÖNEMLİ KURAL 2:
Kullanıcı olumsuz bir şey söylerse ("yapılmadı", "demedim", "iptal", "sil", "yanlış") "intent" alanını "DELETE" olarak ayarla.

Sık Kullanılan İşlemler: ${activeProcs.map((p: string) => `"${p}"`).join(', ')}
Sık Kullanılan Endikasyonlar: ${activeInds.map((i: string) => `"${i}"`).join(', ')}
Kabul Edilen Hastalıklar (Anamnez): ${diseaseNames.length > 0 ? diseaseNames.map((d: string) => `"${d}"`).join(', ') : '"Diyabet", "Hipertansiyon", "Astım", "Alerji"'}
Kabul Edilen Konsültasyonlar: ${consultationNames.length > 0 ? consultationNames.map((c: string) => `"${c}"`).join(', ') : '"Kardiyoloji", "Ortodonti", "Endodonti"'}

ÖNEMLİ KURAL 3:
Eğer kullanıcı bir hastalıktan bahsediyorsa bunu "diseases" dizisine ekle. ANCAK sadece "Kabul Edilen Hastalıklar" listesindekilerle eşleşiyorsa ekle.
Eğer kullanıcı konsültasyon istiyorsa bunu "consultations" dizisine ekle. ANCAK sadece "Kabul Edilen Konsültasyonlar" listesindekilerle eşleşiyorsa ekle.
Eğer listede yoksa, "name" alanını SADECE listedeki en uygun olana eşle. Eşleşmiyorsa ekleme!

Format:
{
  "treatments": [
    {
      "procedureName": "İşlem adı",
      "toothNumbers": ["15", "16"],
      "indication": "Endikasyon",
      "cost": 1500,
      "intent": "ADD" // "ekle", "kaydet" varsa "CONFIRM", "sil", "çıkar", "iptal" varsa "DELETE", aksi halde "ADD"
    }
  ],
  "diseases": [
    {
      "name": "Diyabet",
      "intent": "ADD" // "ekle" ise "ADD", "sil" ise "DELETE"
    }
  ],
  "consultations": [
    {
      "name": "Kardiyoloji Konsültasyonu",
      "intent": "ADD"
    }
  ]
}

Örnek cümle 1: "15 numaralı dişe dolgu ekle, sebebi derin çürük. Hastanın diyabeti var ve kardiyoloji konsültasyonu iste."
Döndürmen gereken:
{
  "treatments": [{"procedureName": "Kompozit Dolgu", "toothNumbers": ["15"], "indication": "Derin Çürük", "intent": "CONFIRM"}],
  "diseases": [{"name": "Diyabet", "intent": "ADD"}],
  "consultations": [{"name": "Kardiyoloji Konsültasyonu", "intent": "ADD"}]
}`

    const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']
    let data: any
    let fetchError

    for (const model of models) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

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
      console.error('Gemini API Error:', data?.error || fetchError)
      return NextResponse.json({ error: 'Gemini API Hatası', details: data?.error || 'Unknown error' }, { status: 500 })
    }

    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!contentText) {
      return NextResponse.json({ result: [] })
    }

    let parsed = []
    try {
      parsed = JSON.parse(contentText)
    } catch (e) {
      console.error('Gemini JSON Parse Error:', e, contentText)
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
