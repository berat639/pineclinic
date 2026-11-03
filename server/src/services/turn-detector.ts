import { EndSensitivity, StartSensitivity, type RealtimeInputConfig } from '@google/genai'

export type TurnDetectionMode = 'semantic' | 'standard'
export type NoiseFilterMode = 'rnnoise' | 'off'

export type TurnCompleteness = 'complete' | 'incomplete' | 'non_speech'

export interface TurnAnalysisResult {
  status: TurnCompleteness
  recommendedSilenceMs: number
  reason: string
}

/**
 * Türkçe bağlaçlar, edatlar (ilgeçler), söylem belirteçleri, düşünme dolguları
 * ve tek başına cümle sonu olamayan tamlayan/zaman zarfları.
 */
const INCOMPLETE_TRAILING_WORDS = new Set([
  // Bağlaçlar
  've', 'veya', 'ama', 'fakat', 'ancak', 'lakin', 'yalnız', 'çünkü', 'zira', 'oysa', 'oysaki',
  'halbuki', 'üstelik', 'hatta', 'ayrıca', 'hem', 'ya', 'yahut', 'veyahut', 'ki', 'de', 'da',
  'ise', 'madem', 'mademki', 'şayet', 'eğer', 'gerçi', 'yoksa', 'demek', 'nasılki',
  // Edatlar (İlgeçler) — kendisinden sonra tümleç veya yüklem bekler
  'için', 'ile', 'gibi', 'kadar', 'göre', 'doğru', 'karşı', 'rağmen', 'üzere', 'dolayı',
  'ötürü', 'beri', 'dek', 'değin', 'ait', 'dair', 'ilişkin', 'konusunda', 'hakkında',
  'tarafından', 'sayesinde', 'yüzünden', 'nedeniyle', 'sebebiyle', 'amacıyla', 'vasıtasıyla',
  // Söylem belirteçleri ve düşünme/duraksama dolguları
  'şey', 'yani', 'hani', 'acaba', 'aslında', 'şimdi', 'şöyle', 'böyle', 'mesela', 'örneğin',
  'özellikle', 'açıkçası', 'doğrusu', 'sanırım', 'galiba', 'herhalde', 'muhtemelen', 'belki',
  'zaten', 'asla', 'hiç', 'çok', 'daha', 'en', 'pek', 'biraz', 'oldukça', 'gayet', 'tam',
  'ıı', 'ııı', 'ee', 'eee', 'hmm', 'hm', 'aa', 'ooo', 'öö', 'üü', 'pardon', 'affedersiniz',
  // Zamirler ve tamlayanlar (Özne/Tamlayan olarak cümleyi başlatır, yüklem bekler)
  'ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'benim', 'senin', 'onun', 'bizim', 'sizin', 'onların',
  'kendi', 'kendim', 'bu', 'şu', 'hangi', 'kimin', 'neyin', 'bir', 'iki', 'kaç',
  // Klinik ve randevu bağlamında yüklem/tamlanan bekleyen kelimeler
  'saat', 'saati', 'gün', 'günü', 'ay', 'ayı', 'hafta', 'numaram', 'numarası', 'telefonum',
  'ismim', 'adım', 'soyadım', 'doktor', 'hekim', 'randevu', 'randevumu', 'randevuyu',
  'muayene', 'tedavi', 'tedavisi', 'kontrol', 'kontrolü', 'kanal', 'implant', 'dolgu', 'çekim',
  'diş', 'dişim', 'dişime', 'dişimde', 'dişimin', 'ağrı', 'fiyat', 'ücret',
  'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
  'yarın', 'bugün', 'haftaya', 'sabah', 'öğle', 'öğleden', 'akşam', 'gece', 'sonra', 'önce',
])

const INCOMPLETE_MULTIWORD_SUFFIXES = [
  'bir de',
  'ya da',
  'ne de',
  'hem de',
  'ondan sonra',
  'bundan sonra',
  'öğleden sonra',
  'öğleden önce',
  'dediğim gibi',
  'şöyle ki',
  'hal böyleyken',
  'bunun için',
  'onun için',
  'bu yüzden',
  'o yüzden',
  'ona göre',
  'buna göre',
  'birlikte',
  'beraber',
]

const COMPLETE_TRAILING_WORDS = new Set([
  'evet', 'hayır', 'yok', 'tamam', 'tamamdır', 'olur', 'olmaz', 'uygun', 'uygundur', 'uygunum',
  'müsait', 'müsaitim', 'tabii', 'elbette', 'peki', 'lütfen', 'teşekkürler', 'teşekkür',
  'ederim', 'sağolun', 'olun', 'günler', 'görüşürüz', 'hoşçakalın', 'kolay gelsin',
  'istiyorum', 'istiyordum', 'isterim', 'alabilirim', 'gelebilirim', 'olabilir',
  'onaylıyorum', 'iptal', 'erteleme', 'bitti', 'bu kadar', 'hepsi bu', 'yeterli',
  'mi', 'mı', 'mu', 'mü', 'miyim', 'mıyım', 'muyum', 'müyüm',
  'misiniz', 'mısınız', 'musunuz', 'müsünüz', 'miyiz', 'mıyız', 'muyuz', 'müyüz',
  'midir', 'mıdır', 'mudur', 'müdür',
  'var', 'vardı', 'oldu', 'olacak', 'yapalım', 'edelim', 'bakalım', 'alayım', 'geleyim',
  'lazım', 'gerek', 'gerekiyor', 'değil', 'değilim',
])

const NUMBER_WORDS = new Set([
  'sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz',
  'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan', 'yüz', 'bin',
])

/**
 * Türkçe Biçimbirimsel (Morfolojik) Çekimli Yüklem Algılayıcı:
 * Türkçe Özne-Nesne-Yüklem (SOV) yapısında cümlenin bittiğini gösteren çekimli fiil
 * veya ek-fiil eklerini (şimdiki, gelecek, geçmiş, geniş, yeterlilik, istek, gereklilik, soru) denetler.
 */
function hasTurkishFinitePredicateSuffix(word: string): boolean {
  if (COMPLETE_TRAILING_WORDS.has(word)) return true
  return (
    // Şimdiki zaman: -ıyor, -iyorum, -iyorsun, -iyoruz, -ıyorsunuz, -ıyorlar, -ıyordu, -ıyordum
    /[ıiuü]yor(?:um|sun|sunuz|uz|lar|du|dum|duk|muş)?$/u.test(word) ||
    // Gelecek zaman (1./2./3. şahıs çekimli): -acağım, -eceğim, -acaksınız, -eceğiz, -acaklar (sıfat-fiil olan 3. tekil iyelik -acağı/-eceği hariç)
    /(?:acağ[ıi]m|eceğ[ıi]m|acaks[ıi]n|eceksin|acaks[ıi]n[ıi]z|eceksiniz|acağ[ıi]z|eceğiz|acaklar|ecekler|acakt[ıi]m|ecektim)$/u.test(word) ||
    // Yeterlilik ve olumsuz geniş zaman: -abilirim, -ebilirim, -abilirsiniz, -abiliriz, -amam, -emem, -amayız
    /(?:abilirim|ebilirim|abilirsin|ebilirsin|abilirsiniz|ebilirsiniz|abiliriz|ebiliriz|abilirler|ebilirler|amam|emem|amazs[ıi]n|emezsin|amay[ıi]z|emeyiz)$/u.test(word) ||
    // İstek ve emir kipi: -ayım, -eyim, -alım, -elim, -sınlar, -sinler
    /(?:ay[ıi]m|eyim|al[ıi]m|elim|mal[ıi]y[ıi]m|meliyim|mal[ıi]y[ıi]z|meliyiz)$/u.test(word) ||
    // Belirli geçmiş zaman 1. tekil/çoğul ve 2. çoğul şahıs: -dım/-dim/-dum/-düm, -tım/-tim, -dık/-dik, -dınız/-diniz
    /[dt][ıiuü](?:m|k|n[ıiuü]z|lar|ler)$/u.test(word) ||
    // Duyulan geçmiş zaman çekimleri: -mışım, -mişim, -mışsınız, -mıştır, -mıştım
    /m[ıiuü]ş(?:[ıiuü]m|s[ıiuü]n[ıiuü]z|[ıiuü]z|t[ıiuü]r|t[ıiuü]m|lar|ler)$/u.test(word) ||
    // Ek-fiil bildirme eki: -dır/-dir/-dur/-dür/-tır/-tir
    /[dt][ıiuü]r$/u.test(word)
  )
}

/**
 * Türkçe Özne-Nesne-Yüklem (SOV) diziliminde yüklemin henüz gelmediğini gösteren
 * biçimbirimsel ekleri (mastar, ulaç/zarf-fiil, sıfat-fiil, şart kipi, tamlayan eki, hâl ekleri) denetler.
 */
function hasTurkishIncompleteMorphology(lastWord: string, wordCount: number): string | null {
  if (hasTurkishFinitePredicateSuffix(lastWord)) return null

  // 1. Mastar eki (-mak / -mek): "randevu almak...", "muayene olmak...", "iptal ettirmek..."
  if (lastWord.length >= 5 && /[a-zçğıöşü](?:mak|mek)$/u.test(lastWord)) {
    return 'infinitive_waiting_verb'
  }

  // 2. İsim-fiil yönelme/belirtme (-mayı/-meyi, -maya/-meye): "randevu almayı...", "gelmeye..."
  if (lastWord.length >= 5 && /(?:may[ıi]|meyi|maya|meye)$/u.test(lastWord)) {
    return 'verbal_noun_case'
  }

  // 3. Zarf-fiil / Ulaçlar (-ıp/-ip/-up/-üp, -arak/-erek, -ınca/-ince, -madan/-meden, -dıkça/-dikçe, -ken)
  if (
    lastWord.length >= 4 &&
    /(?:[ıiuü]p|arak|erek|[ıiuü]nca|[ıiuü]nce|madan|meden|d[ıiuü]kça|dikçe|t[ıiuü]kça|tikçe|ken)$/u.test(lastWord)
  ) {
    return 'trailing_converb'
  }

  // 4. Sıfat-fiil / Yan cümle iyelikleri (-dığı/-diği, -acağı/-eceği, -dığım/-diğim, -dığınız/-diğiniz)
  if (
    lastWord.length >= 5 &&
    /(?:d[ıiuü]ğ[ıiuü]|t[ıiuü]ğ[ıiuü]|acağ[ıiuü]|eceğ[ıiuü]|d[ıiuü]ğ[ıiuü]m|t[ıiuü]ğ[ıiuü]m|d[ıiuü]ğ[ıiuü]n[ıiuü]z|t[ıiuü]ğ[ıiuü]n[ıiuü]z)$/u.test(lastWord)
  ) {
    return 'subordinate_participle'
  }

  // 5. Şart kipi (-sa/-se, -ysa/-yse, -sanız/-seniz): "müsaitse...", "boşluk varsa...", "uygun olursa..."
  if (lastWord.length >= 4 && /(?:ysa|yse|san[ıi]z|seniz|ursa|ürse|arsa|erse|[a-zçğıöşü]sa|[a-zçğıöşü]se)$/u.test(lastWord)) {
    return 'conditional_clause'
  }

  // 6. Tamlayan eki (-ın/-in/-un/-ün, -nın/-nin, -ımın/-imin, -inizin/-ınızın): "doktorun...", "kliniğin...", "dişimin...", "Ahmet Bey'in..."
  if (
    lastWord.length >= 5 &&
    /(?:[ıiuü]m[ıiuü]n|[ıiuü]n[ıiuü]z[ıiuü]n|n[ıiuü]n|(?:kliniğ|doktor|hekim|randevu|tedavi|muayene|diş|eş|kız|oğul|anne|baba|bey|hanım|hoca|uzman|hasta)[ıiuü]n)$/u.test(lastWord)
  ) {
    return 'genitive_waiting_head_noun'
  }

  // 7. Vasıta / Birliktelik eki (-la/-le, -yla/-yle): "eşimle...", "kızımla...", "kartla..."
  if (wordCount >= 2 && lastWord.length >= 5 && /(?:[ıiuü]mla|[ıiuü]mle|yla|yle)$/u.test(lastWord)) {
    return 'instrumental_case_sov'
  }

  // 8. Ayrılma hâl eki (-dan/-den/-tan/-ten): "doktordan...", "kliniğinizden...", "sabahtan..."
  if (wordCount >= 2 && lastWord.length >= 5 && /[dt](?:an|en)$/u.test(lastWord)) {
    return 'ablative_case_sov'
  }

  // 9. Yönelme ve Belirtme hâl ekleri (SOV cümlesinde tümleç/nesne sonrası yüklem beklentisi)
  if (
    wordCount >= 2 &&
    /(?:randevuyu|randevumu|tarihi|saati|dişimi|dişime|kliniğe|doktora|hekime|muayeneye|kontrole|tedaviye|gününe|saatine|haftaya|yarına)$/u.test(lastWord)
  ) {
    return 'object_dative_accusative_sov'
  }

  return null
}

/**
 * Türkçe canlı konuşma metninin anlam, biçimbilim (morfoloji) ve Özne-Nesne-Yüklem (SOV)
 * söz dizimi açısından tamamlanıp tamamlanmadığını analiz eder.
 */
export function analyzeTurkishTurnCompleteness(rawTranscript: string): TurnAnalysisResult {
  const cleaned = rawTranscript
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()

  if (!cleaned) {
    return { status: 'non_speech', recommendedSilenceMs: 650, reason: 'empty' }
  }

  const normalized = cleaned
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,!?;:…"''"()[\]{}\-–—]+$/g, '')
    .trim()

  if (!normalized || normalized.length <= 1) {
    return { status: 'non_speech', recommendedSilenceMs: 650, reason: 'single_char' }
  }

  // Yarım kalmış telefon numarası kontrolü (3-9 hane arası rakam dizisi varsa kullanıcı numarayı söylemeye devam ediyordur)
  const digitsOnly = normalized.replace(/\D/g, '')
  if (digitsOnly.length >= 3 && digitsOnly.length < 10) {
    return { status: 'incomplete', recommendedSilenceMs: 950, reason: 'partial_phone_digits' }
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return { status: 'non_speech', recommendedSilenceMs: 650, reason: 'no_words' }
  }

  const lastWord = words[words.length - 1]
  const lastTwo = words.slice(-2).join(' ')

  // Sözlü telefon numarası okuma kontrolü: son kelimeler sayı ise ve toplam rakam henüz tamamlanmadıysa
  const numberWordCount = words.filter(w => NUMBER_WORDS.has(w)).length
  if (numberWordCount >= 2 && NUMBER_WORDS.has(lastWord) && digitsOnly.length < 10 && words.length < 8) {
    return { status: 'incomplete', recommendedSilenceMs: 900, reason: 'partial_spoken_number' }
  }

  // Çok kelimeli yarım kalıplar
  for (const suffix of INCOMPLETE_MULTIWORD_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_phrase:${suffix}` }
    }
  }

  // Cümle sonu bağlaç / edat / dolgu kelimesi kontrolü
  if (INCOMPLETE_TRAILING_WORDS.has(lastWord)) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_word:${lastWord}` }
  }

  // Türkçe Biçimbirimsel (Morfolojik) & SOV Yüklem Öncesi Ek Analizi
  const morphReason = hasTurkishIncompleteMorphology(lastWord, words.length)
  if (morphReason) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: morphReason }
  }

  // Özne zamiriyle ("ben", "biz", "benim") başlayan 3+ kelimeli SOV cümlede henüz çekimli yüklem yoksa
  if (
    words.length >= 3 &&
    (words[0] === 'ben' || words[0] === 'biz' || words[0] === 'benim') &&
    !hasTurkishFinitePredicateSuffix(lastWord) &&
    !/[?\.!]$/u.test(cleaned)
  ) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: 'sov_missing_final_predicate' }
  }

  // Tamamlanmış yüklem, soru eki, onay veya 10-11 haneli tam telefon numarası
  if (
    hasTurkishFinitePredicateSuffix(lastWord) ||
    COMPLETE_TRAILING_WORDS.has(lastTwo) ||
    digitsOnly.length >= 10 ||
    /[?\.!]$/u.test(cleaned)
  ) {
    return { status: 'complete', recommendedSilenceMs: 400, reason: 'complete_utterance' }
  }

  return { status: 'complete', recommendedSilenceMs: 550, reason: 'default_complete' }
}

export const SEMANTIC_TURN_PROMPT_INSTRUCTION =
  'AKILLI KONUŞMA SIRASI (TÜRKÇE SOV & TURN DETECTOR): Türkçe Özne-Nesne-Yüklem diziliminde yüklem cümlenin en sonunda gelir. Karşı taraf cümlesini bağlaçla ("ve", "ama", "yani", "şey"), edatla ("için", "ile", "gibi"), hâl veya mastar ekiyle ("dişime...", "randevu almak...", "doktordan..."), yarım kalmış telefon numarasıyla veya düşünme duraksamasıyla bıraktıysa yüklemi söyleyene kadar bekle; sözünü kesme. Öksürük, hapşırık, boğaz temizleme veya anlık ortam seslerinde konuşma sırası alma.'

/**
 * Seçilen konuşma sırası algılama moduna göre Gemini Live VAD ve ses algılama profilini üretir.
 */
export function buildRealtimeDetectionConfig(
  mode: TurnDetectionMode = 'semantic',
  channel: 'web' | 'phone' = 'web',
  customSilenceMs?: number,
): RealtimeInputConfig {
  if (mode === 'standard') {
    return {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: customSilenceMs ?? 300,
      },
    }
  }

  const defaultSilence = channel === 'phone' ? 550 : 650
  return {
    automaticActivityDetection: {
      disabled: false,
      startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
      endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
      prefixPaddingMs: 220,
      silenceDurationMs: customSilenceMs ? Math.max(500, customSilenceMs) : defaultSilence,
    },
  }
}

/**
 * 8 kHz veya 16 kHz Int16 LE PCM ses karesinin anlık darbe / öksürük / tıklama olup olmadığını analiz eder.
 */
export function analyzePcmFrameCharacteristics(pcm: Buffer): {
  rms: number
  peak: number
  crestFactor: number
  zcr: number
  isImpulseLike: boolean
} {
  const samples = pcm.length >> 1
  if (samples === 0) {
    return { rms: 0, peak: 0, crestFactor: 0, zcr: 0, isImpulseLike: false }
  }

  let sumSq = 0
  let peak = 0
  let zeroCrossings = 0
  let prevSample = pcm.readInt16LE(0)

  for (let i = 0; i < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i)
    const abs = Math.abs(s)
    if (abs > peak) peak = abs
    sumSq += s * s
    if ((s >= 0 && prevSample < 0) || (s < 0 && prevSample >= 0)) {
      zeroCrossings++
    }
    prevSample = s
  }

  const rms = Math.sqrt(sumSq / samples)
  const crestFactor = rms > 1 ? peak / rms : 0
  const zcr = zeroCrossings / samples
  const isImpulseLike = rms > 180 && (crestFactor > 4.8 || zcr > 0.42)

  return { rms, peak, crestFactor, zcr, isImpulseLike }
}
