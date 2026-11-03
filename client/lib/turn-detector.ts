import { EndSensitivity, StartSensitivity, type RealtimeInputConfig } from '@google/genai'

export type TurnDetectionMode = 'semantic' | 'standard'
export type NoiseFilterMode = 'rnnoise' | 'off'

export type TurnCompleteness = 'complete' | 'incomplete' | 'non_speech'

export interface TurnAnalysisResult {
  status: TurnCompleteness
  recommendedSilenceMs: number
  reason: string
}

const INCOMPLETE_TRAILING_WORDS = new Set([
  've', 'veya', 'ama', 'fakat', 'ancak', 'lakin', 'yalnız', 'çünkü', 'zira', 'oysa', 'oysaki',
  'halbuki', 'üstelik', 'hatta', 'ayrıca', 'hem', 'ya', 'yahut', 'veyahut', 'ki', 'de', 'da',
  'ise', 'madem', 'mademki', 'şayet', 'eğer', 'gerçi', 'yoksa', 'demek', 'nasılki',
  'için', 'ile', 'gibi', 'kadar', 'göre', 'doğru', 'karşı', 'rağmen', 'üzere', 'dolayı',
  'ötürü', 'beri', 'dek', 'değin', 'ait', 'dair', 'ilişkin', 'konusunda', 'hakkında',
  'tarafından', 'sayesinde', 'yüzünden', 'nedeniyle', 'sebebiyle', 'amacıyla', 'vasıtasıyla',
  'şey', 'yani', 'hani', 'acaba', 'aslında', 'şimdi', 'şöyle', 'böyle', 'mesela', 'örneğin',
  'özellikle', 'açıkçası', 'doğrusu', 'sanırım', 'galiba', 'herhalde', 'muhtemelen', 'belki',
  'zaten', 'asla', 'hiç', 'çok', 'daha', 'en', 'pek', 'biraz', 'oldukça', 'gayet', 'tam',
  'ıı', 'ııı', 'ee', 'eee', 'hmm', 'hm', 'aa', 'ooo', 'öö', 'üü', 'pardon', 'affedersiniz',
  'ben', 'sen', 'o', 'biz', 'siz', 'onlar', 'benim', 'senin', 'onun', 'bizim', 'sizin', 'onların',
  'kendi', 'kendim', 'bu', 'şu', 'hangi', 'kimin', 'neyin', 'bir', 'iki', 'kaç',
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

function hasTurkishFinitePredicateSuffix(word: string): boolean {
  if (COMPLETE_TRAILING_WORDS.has(word)) return true
  return (
    /[ıiuü]yor(?:um|sun|sunuz|uz|lar|du|dum|duk|muş)?$/u.test(word) ||
    /(?:acağ[ıi]m|eceğ[ıi]m|acaks[ıi]n|eceksin|acaks[ıi]n[ıi]z|eceksiniz|acağ[ıi]z|eceğiz|acaklar|ecekler|acakt[ıi]m|ecektim)$/u.test(word) ||
    /(?:abilirim|ebilirim|abilirsin|ebilirsin|abilirsiniz|ebilirsiniz|abiliriz|ebiliriz|abilirler|ebilirler|amam|emem|amazs[ıi]n|emezsin|amay[ıi]z|emeyiz)$/u.test(word) ||
    /(?:ay[ıi]m|eyim|al[ıi]m|elim|mal[ıi]y[ıi]m|meliyim|mal[ıi]y[ıi]z|meliyiz)$/u.test(word) ||
    /[dt][ıiuü](?:m|k|n[ıiuü]z|lar|ler)$/u.test(word) ||
    /m[ıiuü]ş(?:[ıiuü]m|s[ıiuü]n[ıiuü]z|[ıiuü]z|t[ıiuü]r|t[ıiuü]m|lar|ler)$/u.test(word) ||
    /[dt][ıiuü]r$/u.test(word)
  )
}

function hasTurkishIncompleteMorphology(lastWord: string, wordCount: number): string | null {
  if (hasTurkishFinitePredicateSuffix(lastWord)) return null

  if (lastWord.length >= 5 && /[a-zçğıöşü](?:mak|mek)$/u.test(lastWord)) {
    return 'infinitive_waiting_verb'
  }
  if (lastWord.length >= 5 && /(?:may[ıi]|meyi|maya|meye)$/u.test(lastWord)) {
    return 'verbal_noun_case'
  }
  if (
    lastWord.length >= 4 &&
    /(?:[ıiuü]p|arak|erek|[ıiuü]nca|[ıiuü]nce|madan|meden|d[ıiuü]kça|dikçe|t[ıiuü]kça|tikçe|ken)$/u.test(lastWord)
  ) {
    return 'trailing_converb'
  }
  if (
    lastWord.length >= 5 &&
    /(?:d[ıiuü]ğ[ıiuü]|t[ıiuü]ğ[ıiuü]|acağ[ıiuü]|eceğ[ıiuü]|d[ıiuü]ğ[ıiuü]m|t[ıiuü]ğ[ıiuü]m|d[ıiuü]ğ[ıiuü]n[ıiuü]z|t[ıiuü]ğ[ıiuü]n[ıiuü]z)$/u.test(lastWord)
  ) {
    return 'subordinate_participle'
  }
  if (lastWord.length >= 4 && /(?:ysa|yse|san[ıi]z|seniz|ursa|ürse|arsa|erse|[a-zçğıöşü]sa|[a-zçğıöşü]se)$/u.test(lastWord)) {
    return 'conditional_clause'
  }
  if (
    lastWord.length >= 5 &&
    /(?:[ıiuü]m[ıiuü]n|[ıiuü]n[ıiuü]z[ıiuü]n|n[ıiuü]n|(?:kliniğ|doktor|hekim|randevu|tedavi|muayene|diş|eş|kız|oğul|anne|baba|bey|hanım|hoca|uzman|hasta)[ıiuü]n)$/u.test(lastWord)
  ) {
    return 'genitive_waiting_head_noun'
  }
  if (wordCount >= 2 && lastWord.length >= 5 && /(?:[ıiuü]mla|[ıiuü]mle|yla|yle)$/u.test(lastWord)) {
    return 'instrumental_case_sov'
  }
  if (wordCount >= 2 && lastWord.length >= 5 && /[dt](?:an|en)$/u.test(lastWord)) {
    return 'ablative_case_sov'
  }
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

  const numberWordCount = words.filter(w => NUMBER_WORDS.has(w)).length
  if (numberWordCount >= 2 && NUMBER_WORDS.has(lastWord) && digitsOnly.length < 10 && words.length < 8) {
    return { status: 'incomplete', recommendedSilenceMs: 900, reason: 'partial_spoken_number' }
  }

  for (const suffix of INCOMPLETE_MULTIWORD_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_phrase:${suffix}` }
    }
  }

  if (INCOMPLETE_TRAILING_WORDS.has(lastWord)) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_word:${lastWord}` }
  }

  const morphReason = hasTurkishIncompleteMorphology(lastWord, words.length)
  if (morphReason) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: morphReason }
  }

  if (
    words.length >= 3 &&
    (words[0] === 'ben' || words[0] === 'biz' || words[0] === 'benim') &&
    !hasTurkishFinitePredicateSuffix(lastWord) &&
    !/[?\.!]$/u.test(cleaned)
  ) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: 'sov_missing_final_predicate' }
  }

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

export function buildRealtimeDetectionConfig(
  mode: TurnDetectionMode = 'semantic',
): RealtimeInputConfig {
  if (mode === 'standard') {
    return {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 300,
      },
    }
  }

  return {
    automaticActivityDetection: {
      disabled: false,
      startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
      endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
      prefixPaddingMs: 220,
      silenceDurationMs: 650,
    },
  }
}
