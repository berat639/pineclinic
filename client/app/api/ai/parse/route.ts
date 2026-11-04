import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '@/lib/backend-request'
import { getTenantForwardingHeaders } from '@/lib/forwarded-request'
import {
  DEFAULT_DENTAL_INDICATIONS,
  DEFAULT_DENTAL_PROCEDURES,
  extractAllFdiTeethInOrder,
  extractDentalSurfaces,
  matchSpokenMaterials,
  mergeBufferedTeethWithCommand,
  parseStructuredOrLocalDentalCommand,
  repairTurkishDentalPhonetics,
  resolveAutoLinkedIndications,
} from '@/lib/dental-voice-parser'

const requestWindows = new Map<string, { count: number; until: number }>()

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401 })
    const authResponse = await fetchBackend('/api/auth/me', {
      headers: { cookie: `token=${token}`, ...getTenantForwardingHeaders(req) }, cache: 'no-store',
    })
    if (!authResponse.ok) return NextResponse.json({ error: 'Oturum geçersiz' }, { status: authResponse.status === 401 ? 401 : 403 })
    const user = await authResponse.json()
    if (!user?.id || !user?.clinicId || !['yonetici', 'moderator', 'hekim', 'host'].includes(user.role))
      return NextResponse.json({ error: 'Yetki yok' }, { status: 403 })
    const now = Date.now()
    const key = `${user.clinicId}:${user.id}`
    const window = requestWindows.get(key)
    if (!window || window.until <= now) requestWindows.set(key, { count: 1, until: now + 60_000 })
    else if (window.count >= 30) return NextResponse.json({ error: 'Çok fazla istek. Bir dakika sonra tekrar deneyin.' }, { status: 429 })
    else window.count++
    if (requestWindows.size > 1000) for (const [entry, value] of requestWindows) if (value.until <= now) requestWindows.delete(entry)

    const body = await req.json().catch(() => ({}))
    const {
      text: rawText = '',
      procNames = [],
      indNames = [],
      diseaseNames = [],
      consultationNames = [],
      materialNames = [],
      inventory = [],
      indicationLinks = {},
      bufferedTeeth = [],
      audioBase64,
      audioMimeType,
    } = body || {}

    const hasAudio = typeof audioBase64 === 'string' && audioBase64.trim().length > 0
    const lists = [procNames, indNames, diseaseNames, consultationNames, materialNames]
    if (
      typeof rawText !== 'string' ||
      (!rawText.trim() && !hasAudio) ||
      rawText.length > 2000 ||
      lists.some(
        (list) =>
          !Array.isArray(list) ||
          list.length > 300 ||
          list.some((value) => typeof value !== 'string' || value.length > 150)
      )
    ) {
      return NextResponse.json({ error: 'Komut veya katalog verisi geçersiz' }, { status: 400 })
    }

    const safeIndicationLinks: Record<string, string | string[]> =
      indicationLinks && typeof indicationLinks === 'object' && !Array.isArray(indicationLinks)
        ? indicationLinks
        : {}

    const safeBufferedTeeth: string[] = Array.isArray(bufferedTeeth)
      ? bufferedTeeth.filter((t): t is string => typeof t === 'string')
      : []

    const activeProcs: string[] = procNames.length > 0 ? procNames : DEFAULT_DENTAL_PROCEDURES
    const activeInds: string[] = indNames.length > 0 ? indNames : DEFAULT_DENTAL_INDICATIONS

    const effectiveInventory =
      Array.isArray(inventory) && inventory.length > 0
        ? inventory
        : Array.isArray(materialNames)
          ? materialNames
              .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
              .map((name, idx) => ({ id: `mat-${idx}`, name: name.trim() }))
          : []

    const mergedInput =
      safeBufferedTeeth.length > 0
        ? mergeBufferedTeethWithCommand(safeBufferedTeeth, String(rawText))
        : String(rawText)

    const text = repairTurkishDentalPhonetics(mergedInput)

    const localParsed = parseStructuredOrLocalDentalCommand(text, {
      procNames: activeProcs,
      indNames: activeInds,
      inventory: effectiveInventory,
      materialNames,
      indicationLinks: safeIndicationLinks,
      bufferedTeeth: safeBufferedTeeth,
      diseaseNames,
      consultationNames,
    })

    // Madde 5.1 yapılandırılmış formatı ("Endikasyonu: ... Tedavi: ... Yüzeyler ...") deterministik olarak tam eşleşirse anında döndür
    if (localParsed.isStructured51 && localParsed.treatments.length > 0) {
      return NextResponse.json({ result: localParsed })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      if (localParsed.matched) {
        return NextResponse.json({ result: localParsed })
      }
      return NextResponse.json({ error: 'Yapay zeka API anahtarı yapılandırılmamış' }, { status: 500 })
    }

    const activeMaterialNames =
      materialNames.length > 0
        ? materialNames
        : effectiveInventory.map((item: any) => item?.name).filter(Boolean)

    const systemPrompt = `Sen bir diş hekimi asistanısın. Görevin hekimin sesli veya yazılı olarak söylediği komutlardan tedavi işlemlerini, diş seçim komutlarını, anatomik yüzey ve bölümleri, malzemeleri, konsültasyon taleplerini ve hasta hastalıklarını (anamnez) çıkarmaktır.
Kullanıcının cümlesini (ve varsa ekli ses kaydını) analiz et ve aşağıdaki formata sahip bir JSON nesnesi döndür. Asla markdown \`\`\`json ekleme, SADECE JSON nesnesi döndür.

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

2. YÜZEY, ANATOMİK BÖLÜM VE MALZEME ÇIKARMA:
   Kullanıcı işlem söylerken yüzey, bölüm veya malzeme belirtiyorsa treatments içine ekle:
   - Yüzeyler (surfaces):
     * "oklüzal", "okluzal", "okul", "çiğneme" -> ["O"]
     * "mezyal", "mezial", "mezar", "mesai", "ön arayüz" -> ["M"]
     * "distal", "dijital", "destan", "arka arayüz" -> ["D"]
     * "bukkal", "bukal", "bakkal", "vestibüler", "yanak", "dudak" -> ["B"]
     * "lingual", "palatinal", "dil", "damak" -> ["L"]
     * "MOD", "em o de", "m o d", "mezyo-oklüzo-distal", "Mezial, Okluzal, Distal" -> ["M", "O", "D"]
     * "MO", "em o", "m o", "mezyo-oklüzal" -> ["M", "O"]
     * "DO", "de o", "d o", "disto-oklüzal" -> ["D", "O"]
   - Anatomik Bölüm (section):
     * "kuron", "kron", "taç" -> "crown"
     * "kole", "boyun", "diş boynu", "sement" -> "cervical"
     * "kök", "kök ucu", "apeks" -> "root"
   - Malzemeler (materials: string[]):
     * Kullanıcı komutta malzeme söylediyse (veya "Malzeme: ..." belirttiyse) Kabul Edilen Malzemeler listesinden eşleşen malzeme adlarını "materials" dizisine ekle; söylenmediyse [] bırak.

3. İŞLEM EŞLEŞTİRME VE FONETİK DÜZELTME:
   Kullanıcının söylediği işlemleri aşağıdaki "Sık Kullanılan İşlemler" listesi ile eşleştir ve listedeki TAM ADINI kullan.
   - Tarayıcı STT fonetik hatalarını düzelt:
     * "koyun ekmek", "koyun ekle", "zirkon ekmek" -> "zirkonyum ekle" ("Zirkonyum Kuron")
     * "koyun", "zirkon", "sirkonyum", "zirkonya" -> "Zirkonyum Kuron"
     * "komplo", "kompozisyon", "kompozit dolgu", "dolgu" -> "Kompozit Dolgu (Tek Yüzey)"
     * "ekmek", "ekli", "ekler" (cümle sonunda) -> "ekle" ("intent": "ADD")
   - Kullanıcı "kanal" veya "kanal tedavisi" dediyse -> listedeki "Kanal Tedavisi (Tek Kanal)" vb. tam adını seç.
   - Kullanıcı "çekim" veya "çek" dediyse -> listedeki "Diş Çekimi" tam adını seç.
   - Kullanıcı "implant" dediyse -> listedeki "İmplant (Yerli)" tam adını seç.
   - Kullanıcı açıkça bir işlem adı söylemediyse (örneğin sadece "18'i sil" veya "36 sil"), procedureName alanını null bırakabilirsin.
   - Serbest sesli komutlarda kullanıcı "Endikasyonu: ..." kalıbını açıkça söylemediyse indication alanını uydurma (null bırak), çünkü bağlı endikasyonlar sistem tarafından otomatik bağlanır. Yalnızca 5.1 şablonunda ("Endikasyonu: Çürük, Tedavi: ...") açıkça söylendiyse indication alanına yaz.

4. İNTENT (EYLEM TÜRÜ):
   - "ekle", "eklensin", "yap", "yapılsın", "yaz", "koy", "olsun" veya doğrudan işlem belirtildiyse -> "intent": "ADD"
   - "sil", "silinsin", "çıkar", "iptal", "kaldır", "yapılmadı", "yanlış", "vazgeçtim", "temizle" -> "intent": "DELETE"
   - "düzenle", "düzenlensin", "değiştir", "değiştirilsin", "yerine ... yap", "güncelle", "olarak ayarla", "çevir" -> "intent": "UPDATE"
   - "onayla", "kaydet", "işlemleri kaydet", "bitir", "tamamla" -> "globalIntent": "CONFIRM"

5. DİŞ NUMARALARI (FDI Standart - HİÇBİR DİŞİ ATLAMA):
   - "15 16 17", "36, 37 38", "16 17 18", "on beş on altı on yedi" gibi ifadelerde söylenen TÜM diş numaralarını eksiksiz ve sırasıyla string dizi şeklinde (örn: ["15", "16", "17"]) çıkar. Cümlenin en başındaki ilk diş numaralarını ASLA atlama.
   - Eğer aralık belirtildiyse (örn: "11-14 arası") aralıktaki tüm dişleri tek tek ["11", "12", "13", "14"] şeklinde ekle.
   - Çene belirtildiyse (örn: "tüm üst çene dolgu"):
     * Üst çene: ["11","12","13","14","15","16","17","18","21","22","23","24","25","26","27","28"]
     * Alt çene: ["31","32","33","34","35","36","37","38","41","42","43","44","45","46","47","48"]
   - Yalnızca genel ağız içi bir işlem açıkça söylendiyse (örn: "detertraj ekle") ve diş numarası belirtilmediyse "toothNumbers": ["general"] yap.

6. ORTAM KONUŞMASI VE GÜRÜLTÜ FİLTRELEME:
   - Eğer metin yalnızca günlük sohbet içeriyorsa ve açık bir dental komut İÇERMİYORSA: "globalIntent": "NONE", "selectIntent": "NONE", "targetTeeth": [], "treatments": [], "diseases": [], "consultations": [] döndür.

Sık Kullanılan İşlemler: ${activeProcs.map((p: string) => `"${p}"`).join(', ')}
Sık Kullanılan Endikasyonlar: ${activeInds.map((i: string) => `"${i}"`).join(', ')}
Kabul Edilen Malzemeler (Stok): ${activeMaterialNames.length > 0 ? activeMaterialNames.map((m: string) => `"${m}"`).join(', ') : 'Belirtilmedi'}
Kabul Edilen Hastalıklar (Anamnez): ${diseaseNames.length > 0 ? diseaseNames.map((d: string) => `"${d}"`).join(', ') : '"Diyabet", "Hipertansiyon", "Astım", "Alerji"'}
Kabul Edilen Konsültasyonlar: ${consultationNames.length > 0 ? consultationNames.map((c: string) => `"${c}"`).join(', ') : '"Kardiyoloji", "Ortodonti", "Endodonti"'}

Format:
{
  "globalIntent": "NONE", // veya "CONFIRM"
  "selectIntent": "NONE", // "SELECT_ALL", "SELECT_MAXILLA", "SELECT_MANDIBLE", "SELECT_Q1", "SELECT_Q2", "SELECT_Q3", "SELECT_Q4", "SELECT_ANTERIOR", "SELECT_POSTERIOR", "CLEAR_SELECTION", "SELECT_TEETH" veya "NONE"
  "targetTeeth": [], // SELECT_TEETH için zorunlu diş numaraları; diğer durumlarda []
  "treatments": [
    {
      "procedureName": "İşlem Tam Adı", // veya null
      "toothNumbers": ["36"],
      "indication": "Endikasyon", // veya null
      "surfaces": ["M", "O", "D"], // veya []
      "section": "crown", // "crown", "cervical", "root" veya null
      "materials": [], // string[] (varsa malzeme adları)
      "cost": 1500,
      "intent": "ADD" // "ADD", "DELETE" veya "UPDATE"
    }
  ],
  "diseases": [],
  "consultations": []
}

Örnek 1 (Madde 5): "15 16 17 zirkonyum ekle" (veya STT "15 16 17 koyun ekmek")
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","targetTeeth":["15","16","17"],"treatments":[{"procedureName":"Zirkonyum Kuron","toothNumbers":["15","16","17"],"indication":null,"surfaces":[],"section":null,"materials":[],"intent":"ADD"}]}

Örnek 2 (Madde 5.1): "36, 37 38 Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler Mezial, Okluzal, Distal"
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","targetTeeth":["36","37","38"],"treatments":[{"procedureName":"Kompozit Dolgu (Tek Yüzey)","toothNumbers":["36","37","38"],"indication":"Çürük","surfaces":["M","O","D"],"section":"crown","materials":[],"intent":"ADD"}]}

Örnek 3 (Madde 5.1): "36, Endikasyonu: Çürük, Tedavi: Kompozit Dolgu, Yüzeyler MOD"
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","targetTeeth":["36"],"treatments":[{"procedureName":"Kompozit Dolgu (Tek Yüzey)","toothNumbers":["36"],"indication":"Çürük","surfaces":["M","O","D"],"section":"crown","materials":[],"intent":"ADD"}]}

Örnek 4 (Silme): "15 16 zirkonyum sil"
{"globalIntent":"NONE","selectIntent":"SELECT_TEETH","targetTeeth":["15","16"],"treatments":[{"procedureName":"Zirkonyum Kuron","toothNumbers":["15","16"],"indication":null,"surfaces":[],"section":null,"materials":[],"intent":"DELETE"}]}`

    const userParts: any[] = [{ text: text || 'Ekli ses kaydındaki dental komutu çözümle.' }]
    if (hasAudio) {
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1].trim() : audioBase64.trim()
      if (cleanBase64) {
        userParts.push({
          inlineData: {
            mimeType: typeof audioMimeType === 'string' && audioMimeType.trim() ? audioMimeType.trim() : 'audio/webm',
            data: cleanBase64,
          },
        })
      }
    }

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
              parts: userParts
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
      if (localParsed.matched) {
        return NextResponse.json({ result: localParsed })
      }
      console.error('AI API Error:', data?.error || fetchError)
      return NextResponse.json({ error: 'AI API Hatası', details: data?.error || 'Unknown error' }, { status: 500 })
    }

    const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!contentText) {
      if (localParsed.matched) {
        return NextResponse.json({ result: localParsed })
      }
      return NextResponse.json({ result: [] })
    }

    let parsed: any = null
    try {
      parsed = JSON.parse(contentText)
    } catch (e) {
      try {
        const cleaned = contentText.replace(/```json/g, '').replace(/```/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch (e2) {
        if (localParsed.matched) {
          return NextResponse.json({ result: localParsed })
        }
        return NextResponse.json({ error: 'Komut ayrıştırılamadı' }, { status: 422 })
      }
    }

    // Gemini çıktısını deterministik diş numarası koruma, yüzey/malzeme ve bağlı endikasyon (indicationLinks) kurallarıyla zenginleştir
    const deterministicTeeth = extractAllFdiTeethInOrder(text)
    const deterministicSurfaces = extractDentalSurfaces(text)
    const deterministicMaterials = matchSpokenMaterials(text, effectiveInventory)

    if (parsed && Array.isArray(parsed.treatments)) {
      parsed.treatments = parsed.treatments.map((t: any) => {
        const intent = t.intent || 'ADD'
        const toothNumbers =
          deterministicTeeth.length > 0 &&
          (!Array.isArray(t.toothNumbers) || t.toothNumbers.length < deterministicTeeth.length)
            ? deterministicTeeth
            : Array.isArray(t.toothNumbers) && t.toothNumbers.length > 0
              ? t.toothNumbers.map(String)
              : ['general']

        const surfaces =
          Array.isArray(t.surfaces) && t.surfaces.length > 0
            ? t.surfaces
            : deterministicSurfaces

        const explicitInd = localParsed.isStructured51 ? (t.indication || localParsed.indication) : null
        const resolvedInds =
          intent === 'ADD'
            ? resolveAutoLinkedIndications(t.procedureName, safeIndicationLinks, explicitInd)
            : explicitInd
              ? [explicitInd]
              : []

        const aiMatStrings = Array.isArray(t.materials)
          ? t.materials.filter((m: unknown): m is string => typeof m === 'string')
          : []
        const aiMatchedMats =
          aiMatStrings.length > 0
            ? matchSpokenMaterials(aiMatStrings.join(' '), effectiveInventory)
            : []
        const finalMaterials =
          deterministicMaterials.length > 0 ? deterministicMaterials : aiMatchedMats

        return {
          ...t,
          toothNumbers,
          surfaces,
          surface: surfaces.length > 0 ? surfaces.join('') : t.surface,
          indication: explicitInd || (resolvedInds.length > 0 ? resolvedInds[0] : null),
          indications: resolvedInds,
          materials: finalMaterials.length > 0 ? finalMaterials : (Array.isArray(t.materials) ? t.materials : []),
          materialNames: finalMaterials.length > 0 ? finalMaterials.map((m) => m.name) : aiMatStrings,
          intent,
        }
      })

      if (deterministicTeeth.length > 0 && (!Array.isArray(parsed.targetTeeth) || parsed.targetTeeth.length < deterministicTeeth.length)) {
        parsed.targetTeeth = deterministicTeeth
      }
    }

    return NextResponse.json({ result: parsed })

  } catch (err: any) {
    console.error('AI Parse API Error:', err)
    return NextResponse.json({ error: 'Sunucu Hatası' }, { status: 500 })
  }
}
