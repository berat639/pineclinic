import { EndSensitivity, StartSensitivity, type RealtimeInputConfig } from '@google/genai'

export type TurnDetectionMode = 'semantic' | 'standard'
export type NoiseFilterMode = 'rnnoise' | 'off'

export type TurnCompleteness = 'complete' | 'incomplete' | 'non_speech'

export interface TurnAnalysisResult {
  status: TurnCompleteness
  /** LiveKit EOU (End-of-Utterance) tarzı cümle bitme olasılığı (0.00 – 1.00) */
  eouProbability: number
  /** Dinamik sessizlik bekleme süresi (ms) — LiveKit min/max endpointing delay karşılığı */
  recommendedSilenceMs: number
  reason: string
  /** Arayüzde gösterilecek Türkçe morfolojik/anlamsal açıklama */
  reasonLabelTr: string
}

export interface TurnContextInput {
  userText: string
  /** Asistanın son söylediği cümle/soru (LiveKit ChatContext karşılığı) */
  assistantText?: string
}

/**
 * Bağlaçlar, söylem belirteçleri ve düşünme/duraksama dolguları.
 * Bu kelimelerle biten bir ifade, soru bağlamı ne olursa olsun devam edecektir.
 */
const HARD_INCOMPLETE_WORDS = new Set([
  // Bağlaçlar
  've', 'veya', 'ama', 'fakat', 'ancak', 'lakin', 'yalnız', 'çünkü', 'zira', 'oysa', 'oysaki',
  'halbuki', 'üstelik', 'hatta', 'ayrıca', 'hem', 'ya', 'yahut', 'veyahut', 'ki', 'de', 'da',
  'ise', 'madem', 'mademki', 'şayet', 'eğer', 'gerçi', 'yoksa', 'demek', 'nasılki',
  // Edatlar (İlgeçler)
  'için', 'ile', 'gibi', 'kadar', 'göre', 'doğru', 'karşı', 'rağmen', 'üzere', 'dolayı',
  'ötürü', 'beri', 'dek', 'değin', 'ait', 'dair', 'ilişkin', 'konusunda', 'hakkında',
  'tarafından', 'sayesinde', 'yüzünden', 'nedeniyle', 'sebebiyle', 'amacıyla', 'vasıtasıyla',
  // Söylem belirteçleri ve düşünme dolguları
  'şey', 'yani', 'hani', 'acaba', 'aslında', 'şimdi', 'şöyle', 'böyle', 'mesela', 'örneğin',
  'özellikle', 'açıkçası', 'doğrusu', 'sanırım', 'galiba', 'herhalde', 'muhtemelen', 'belki',
  'zaten', 'asla', 'hiç', 'çok', 'daha', 'en', 'pek', 'biraz', 'oldukça', 'gayet', 'tam',
  'ıı', 'ııı', 'ee', 'eee', 'hmm', 'hm', 'aa', 'ooo', 'öö', 'üü', 'pardon', 'affedersiniz',
  // Zamirler ve tamlayanlar (tek başına yüklem olamaz)
  'ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'benim', 'senin', 'onun', 'bizim', 'sizin', 'onların',
  'kendi', 'kendim', 'bu', 'şu', 'hangi', 'kimin', 'neyin', 'bir', 'iki', 'kaç',
  'saat', 'numaram', 'numarası', 'telefonum', 'ismim', 'adım', 'soyadım',
])

/**
 * Bağlama göre (ör. asistan "Hangi gün?" veya "Hangi işlem?" diye sormadıysa)
 * cümle başında/ortasında tümleç olup arkadan yüklem bekleyen kelimeler.
 */
const CONTEXTUAL_INCOMPLETE_WORDS = new Set([
  'gün', 'günü', 'ay', 'ayı', 'hafta', 'doktor', 'hekim', 'randevu', 'randevumu', 'randevuyu',
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

const TIME_SLOT_WORDS = new Set([
  'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
  'yarın', 'bugün', 'haftaya', 'sabah', 'öğle', 'öğleden', 'akşam', 'günü', 'buçuk', 'buçukta', 'gibi',
])

const PROCEDURE_SLOT_WORDS = new Set([
  'muayene', 'tedavi', 'tedavisi', 'kontrol', 'kontrolü', 'kanal', 'implant', 'dolgu', 'çekim',
  'temizliği', 'beyazlatma', 'protez', 'ortodonti', 'tel', 'kaplama', 'zirkonyum', 'röntgen',
])

/**
 * Türkçe Biçimbirimsel (Morfolojik) Çekimli Yüklem Algılayıcı
 */
function hasTurkishFinitePredicateSuffix(word: string): boolean {
  if (COMPLETE_TRAILING_WORDS.has(word)) return true
  return (
    // Şimdiki zaman: -ıyor, -iyorum, -iyorsun, -iyoruz, -ıyorsunuz, -ıyorlar, -ıyordu, -ıyordum
    /[ıiuü]yor(?:um|sun|sunuz|uz|lar|du|dum|duk|muş)?$/u.test(word) ||
    // Gelecek zaman çekimli: -acağım, -eceğim, -acaksınız, -eceğiz, -acaklar
    /(?:acağ[ıi]m|eceğ[ıi]m|acaks[ıi]n|eceksin|acaks[ıi]n[ıi]z|eceksiniz|acağ[ıi]z|eceğiz|acaklar|ecekler|acakt[ıi]m|ecektim)$/u.test(word) ||
    // Yeterlilik ve olumsuz geniş zaman: -abilirim, -ebilirim, -abilirsiniz, -abiliriz, -amam, -emem
    /(?:abilirim|ebilirim|abilirsin|ebilirsin|abilirsiniz|ebilirsiniz|abiliriz|ebiliriz|abilirler|ebilirler|amam|emem|amazs[ıi]n|emezsin|amay[ıi]z|emeyiz)$/u.test(word) ||
    // İstek ve gereklilik kipi: -ayım, -eyim, -alım, -elim, -malıyım, -meliyim
    /(?:ay[ıi]m|eyim|al[ıi]m|elim|mal[ıi]y[ıi]m|meliyim|mal[ıi]y[ıi]z|meliyiz)$/u.test(word) ||
    // Belirli geçmiş zaman: -dım/-dim, -tım/-tim, -dık/-dik, -dınız/-diniz
    /[dt][ıiuü](?:m|k|n[ıiuü]z|lar|ler)$/u.test(word) ||
    // Duyulan geçmiş zaman: -mışım, -mişim, -mışsınız, -mıştır, -mıştım
    /m[ıiuü]ş(?:[ıiuü]m|s[ıiuü]n[ıiuü]z|[ıiuü]z|t[ıiuü]r|t[ıiuü]m|lar|ler)$/u.test(word) ||
    // Ek-fiil bildirme: -dır/-dir/-dur/-dür
    /[dt][ıiuü]r$/u.test(word)
  )
}

/**
 * Türkçe Özne-Nesne-Yüklem (SOV) diziliminde yüklemin henüz gelmediğini gösteren biçimbirimsel ekler.
 */
function detectTurkishIncompleteMorphology(
  lastWord: string,
  wordCount: number,
): { reason: string; labelTr: string; eou: number; silenceMs: number } | null {
  if (hasTurkishFinitePredicateSuffix(lastWord)) return null

  if (lastWord.length >= 5 && /[a-zçğıöşü](?:mak|mek)$/u.test(lastWord)) {
    return {
      reason: 'infinitive_waiting_verb',
      labelTr: 'Mastar eki (-mak/-mek) — Türkçe SOV yapısında ana fiil ("istiyorum" vb.) bekleniyor',
      eou: 0.18,
      silenceMs: 900,
    }
  }

  if (lastWord.length >= 5 && /(?:may[ıi]|meyi|maya|meye)$/u.test(lastWord)) {
    return {
      reason: 'verbal_noun_case',
      labelTr: 'İsim-fiil eki (-mayı/-meye) — cümlenin yüklemi bekleniyor',
      eou: 0.16,
      silenceMs: 900,
    }
  }

  if (
    lastWord.length >= 4 &&
    /(?:[ıiuü]p|arak|erek|[ıiuü]nca|[ıiuü]nce|madan|meden|d[ıiuü]kça|dikçe|t[ıiuü]kça|tikçe|ken)$/u.test(lastWord)
  ) {
    return {
      reason: 'trailing_converb',
      labelTr: 'Zarf-fiil (ulaç) eki — yan cümle bitti, ana cümle bekleniyor',
      eou: 0.15,
      silenceMs: 900,
    }
  }

  if (
    lastWord.length >= 5 &&
    /(?:d[ıiuü]ğ[ıiuü]|t[ıiuü]ğ[ıiuü]|acağ[ıiuü]|eceğ[ıiuü]|d[ıiuü]ğ[ıiuü]m|t[ıiuü]ğ[ıiuü]m|d[ıiuü]ğ[ıiuü]n[ıiuü]z|t[ıiuü]ğ[ıiuü]n[ıiuü]z)$/u.test(lastWord)
  ) {
    return {
      reason: 'subordinate_participle',
      labelTr: 'Sıfat-fiil (ortaç) eki — tamlanan isim veya ana yüklem bekleniyor',
      eou: 0.20,
      silenceMs: 850,
    }
  }

  if (lastWord.length >= 4 && /(?:ysa|yse|san[ıi]z|seniz|ursa|ürse|arsa|erse|[a-zçğıöşü]sa|[a-zçğıöşü]se)$/u.test(lastWord)) {
    return {
      reason: 'conditional_clause',
      labelTr: 'Şart kipi (-sa/-se) — koşul cümlesinin sonucu bekleniyor',
      eou: 0.22,
      silenceMs: 850,
    }
  }

  if (
    lastWord.length >= 5 &&
    /(?:[ıiuü]m[ıiuü]n|[ıiuü]n[ıiuü]z[ıiuü]n|n[ıiuü]n|(?:kliniğ|doktor|hekim|randevu|tedavi|muayene|diş|eş|kız|oğul|anne|baba|bey|hanım|hoca|uzman|hasta)[ıiuü]n)$/u.test(lastWord)
  ) {
    return {
      reason: 'genitive_waiting_head_noun',
      labelTr: 'Tamlayan eki (-ın/-in/-nın) — isim tamlamasının tamlananı bekleniyor',
      eou: 0.14,
      silenceMs: 900,
    }
  }

  if (wordCount >= 2 && lastWord.length >= 5 && /(?:[ıiuü]mla|[ıiuü]mle|yla|yle)$/u.test(lastWord)) {
    return {
      reason: 'instrumental_case_sov',
      labelTr: 'Vasıta/birliktelik eki (-la/-le) — yüklem henüz söylenmedi',
      eou: 0.24,
      silenceMs: 850,
    }
  }

  if (wordCount >= 2 && lastWord.length >= 5 && /[dt](?:an|en)$/u.test(lastWord)) {
    return {
      reason: 'ablative_case_sov',
      labelTr: 'Ayrılma hâl eki (-dan/-den) — Türkçe SOV diziliminde sonda yüklem bekleniyor',
      eou: 0.24,
      silenceMs: 850,
    }
  }

  if (
    wordCount >= 2 &&
    /(?:randevuyu|randevumu|tarihi|saati|dişimi|dişime|kliniğe|doktora|hekime|muayeneye|kontrole|tedaviye|gününe|saatine|haftaya|yarına)$/u.test(lastWord)
  ) {
    return {
      reason: 'object_dative_accusative_sov',
      labelTr: 'Belirtme/yönelme hâl eki — nesne söylendi, yüklem bekleniyor',
      eou: 0.25,
      silenceMs: 850,
    }
  }

  return null
}

/**
 * LiveKit EOU (End of Utterance) + Türkçe SOV Morfolojik Turn Detector:
 * Hem kullanıcının cümlesini hem de (varsa) asistanın son sorusunu (`assistantText`) birlikte değerlendirir.
 */
export function evaluateLiveKitTurkishTurn(input: TurnContextInput | string): TurnAnalysisResult {
  const rawTranscript = typeof input === 'string' ? input : input.userText
  const assistantQuestion = typeof input === 'string' ? '' : (input.assistantText || '').toLocaleLowerCase('tr-TR')

  const cleaned = rawTranscript
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()

  if (!cleaned) {
    return {
      status: 'non_speech',
      eouProbability: 0,
      recommendedSilenceMs: 650,
      reason: 'empty',
      reasonLabelTr: 'Henüz konuşma metni yok',
    }
  }

  const normalized = cleaned
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,!?;:…"''"()[\]{}\-–—]+$/g, '')
    .trim()

  if (!normalized || normalized.length <= 1) {
    return {
      status: 'non_speech',
      eouProbability: 0,
      recommendedSilenceMs: 650,
      reason: 'single_char',
      reasonLabelTr: 'Tek hece veya ortam sesi',
    }
  }

  // 1. Yarım kalmış telefon numarası (3-9 hane arası rakam)
  const digitsOnly = normalized.replace(/\D/g, '')
  if (digitsOnly.length >= 3 && digitsOnly.length < 10) {
    return {
      status: 'incomplete',
      eouProbability: 0.10,
      recommendedSilenceMs: 1000,
      reason: 'partial_phone_digits',
      reasonLabelTr: `Telefon numarası henüz tamamlanmadı (${digitsOnly.length}/10 hane)`,
    }
  }

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return {
      status: 'non_speech',
      eouProbability: 0,
      recommendedSilenceMs: 650,
      reason: 'no_words',
      reasonLabelTr: 'Kelime algılanmadı',
    }
  }

  const lastWord = words[words.length - 1]
  const lastTwo = words.slice(-2).join(' ')

  // 2. Sözlü telefon numarası okuma kontrolü
  const numberWordCount = words.filter(w => NUMBER_WORDS.has(w)).length
  if (numberWordCount >= 2 && NUMBER_WORDS.has(lastWord) && digitsOnly.length < 10 && words.length < 8) {
    return {
      status: 'incomplete',
      eouProbability: 0.12,
      recommendedSilenceMs: 950,
      reason: 'partial_spoken_number',
      reasonLabelTr: 'Sözlü telefon numarası devam ediyor',
    }
  }

  // 3. Kesin bağlaç / edat / düşünme dolgusu (soru bağlamı ne olursa olsun cümle bitmemiştir)
  if (HARD_INCOMPLETE_WORDS.has(lastWord)) {
    return {
      status: 'incomplete',
      eouProbability: 0.12,
      recommendedSilenceMs: 900,
      reason: `trailing_word:${lastWord}`,
      reasonLabelTr: `"${lastWord}" bağlacı/edatı/dolgusu ile bitti — cümlenin devamı bekleniyor`,
    }
  }

  for (const suffix of INCOMPLETE_MULTIWORD_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return {
        status: 'incomplete',
        eouProbability: 0.14,
        recommendedSilenceMs: 900,
        reason: `trailing_phrase:${suffix}`,
        reasonLabelTr: `"${suffix}" ifadesiyle bitti — cümlenin devamı bekleniyor`,
      }
    }
  }

  // 4. LiveKit Bağlamsal Soru-Cevap Eşleştirmesi (Assistant ChatContext):
  // Asistan tarih/saat/gün sorduysa ve kullanıcı "Salı günü", "Yarın öğleden sonra" gibi kısa cevap verdiyse:
  const assistantAskedDateOrTime =
    /(?:hangi gün|ne zaman|hangi tarih|saat kaç|kaçta|uygun.*gün|مüsait.*gün|tarih ve saat)/u.test(assistantQuestion)
  if (
    assistantAskedDateOrTime &&
    words.length <= 4 &&
    words[0] !== 'ben' &&
    (TIME_SLOT_WORDS.has(lastWord) || normalized.endsWith('öğleden sonra') || normalized.endsWith('öğleden önce'))
  ) {
    return {
      status: 'complete',
      eouProbability: 0.90,
      recommendedSilenceMs: 380,
      reason: 'context_slot_date_time',
      reasonLabelTr: 'Asistanın tarih/saat sorusuna tam yanıt verildi',
    }
  }

  // Asistan işlem/şikayet/doktor sorduysa ve kullanıcı kısa klinik yanıt verdiyse ("Kanal tedavisi", "İmplant", "Ahmet Bey"):
  const assistantAskedProcedureOrDoctor =
    /(?:hangi işlem|hangi tedavi|şikayetiniz|ne için|hangi doktor|hangi hekim|nasıl yardımcı)/u.test(assistantQuestion)
  if (
    assistantAskedProcedureOrDoctor &&
    words.length <= 3 &&
    words[0] !== 'ben' &&
    PROCEDURE_SLOT_WORDS.has(lastWord)
  ) {
    return {
      status: 'complete',
      eouProbability: 0.88,
      recommendedSilenceMs: 400,
      reason: 'context_slot_procedure',
      reasonLabelTr: 'Asistanın işlem/tedavi sorusuna yanıt verildi',
    }
  }

  // 5. Bağlamsız zaman/klinik kelimeleri ("yarın", "öğleden sonra", "pazartesi", "randevu") ile biten yarım ifadeler
  if (
    CONTEXTUAL_INCOMPLETE_WORDS.has(lastWord) ||
    normalized.endsWith('öğleden sonra') ||
    normalized.endsWith('öğleden önce')
  ) {
    return {
      status: 'incomplete',
      eouProbability: 0.22,
      recommendedSilenceMs: 850,
      reason: `trailing_word:${lastWord}`,
      reasonLabelTr: `"${lastWord}" tümleci/nesnesi söylendi — Türkçe SOV yapısında sonda yüklem bekleniyor`,
    }
  }

  // 6. Türkçe Biçimbirimsel (Morfolojik) & SOV Ek Analizi
  const morph = detectTurkishIncompleteMorphology(lastWord, words.length)
  if (morph) {
    return {
      status: 'incomplete',
      eouProbability: morph.eou,
      recommendedSilenceMs: morph.silenceMs,
      reason: morph.reason,
      reasonLabelTr: morph.labelTr,
    }
  }

  // 7. Özne zamiriyle ("ben", "biz", "benim") başlayan 3+ kelimeli SOV cümlede henüz çekimli yüklem yoksa
  if (
    words.length >= 3 &&
    (words[0] === 'ben' || words[0] === 'biz' || words[0] === 'benim') &&
    !hasTurkishFinitePredicateSuffix(lastWord) &&
    !/[?\.!]$/u.test(cleaned)
  ) {
    return {
      status: 'incomplete',
      eouProbability: 0.26,
      recommendedSilenceMs: 850,
      reason: 'sov_missing_final_predicate',
      reasonLabelTr: 'Özne ile başlayan cümlede henüz çekimli yüklem söylenmedi',
    }
  }

  // 8. Tamamlanmış çekimli yüklem, soru eki, onay veya 10-11 haneli tam telefon numarası
  if (
    hasTurkishFinitePredicateSuffix(lastWord) ||
    COMPLETE_TRAILING_WORDS.has(lastTwo) ||
    digitsOnly.length >= 10 ||
    /[?\.!]$/u.test(cleaned)
  ) {
    return {
      status: 'complete',
      eouProbability: 0.94,
      recommendedSilenceMs: 380,
      reason: 'complete_utterance',
      reasonLabelTr: 'Çekimli yüklem veya tam yanıt algılandı — sıra asistana geçebilir',
    }
  }

  return {
    status: 'complete',
    eouProbability: 0.72,
    recommendedSilenceMs: 520,
    reason: 'default_complete',
    reasonLabelTr: 'Kısa yanıt tamamlandı',
  }
}

export function analyzeTurkishTurnCompleteness(
  rawTranscript: string,
  assistantQuestion?: string,
): TurnAnalysisResult {
  return evaluateLiveKitTurkishTurn({ userText: rawTranscript, assistantText: assistantQuestion })
}

export const SEMANTIC_TURN_PROMPT_INSTRUCTION =
  'AKILLI KONUŞMA SIRASI (LIVEKIT EOU & TÜRKÇE SOV MOTORU): Türkçe Özne-Nesne-Yüklem diziliminde yüklem cümlenin en sonunda gelir. Karşı taraf cümlesini bağlaçla ("ve", "ama", "yani", "şey"), edatla ("için", "ile", "gibi"), hâl veya mastar ekiyle ("dişime...", "randevu almak...", "doktordan..."), yarım kalmış telefon numarasıyla veya düşünme duraksamasıyla bıraktıysa yüklemi söyleyene kadar bekle; sözünü kesme. Öksürük, hapşırık, boğaz temizleme veya anlık ortam seslerinde konuşma sırası alma.'

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
