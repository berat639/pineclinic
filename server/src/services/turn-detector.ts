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
  've', 'veya', 'ama', 'fakat', 'ancak', 'lakin', 'yalnız', 'çünkü', 'için', 'ile',
  'şey', 'yani', 'hani', 'acaba', 'aslında', 'şimdi', 'şöyle', 'böyle', 'mesela', 'örneğin',
  'ıı', 'ııı', 'ee', 'eee', 'hmm', 'hm', 'aa', 'ooo',
  'bir', 'de', 'da', 'ki', 'hem', 'ya', 'ne', 'gibi', 'kadar', 'göre', 'sonra', 'önce',
  'saat', 'gün', 'günü', 'ay', 'ayı', 'numaram', 'numarası', 'ismim', 'adım', 'ben',
  'doktor', 'hekim', 'randevu', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
  'yarın', 'bugün', 'haftaya', 'sabah', 'öğleden', 'akşam',
])

const INCOMPLETE_MULTIWORD_SUFFIXES = [
  'bir de',
  'ya da',
  'ne zaman',
  'ondan sonra',
  'bundan sonra',
  'öğleden sonra',
  'öğleden önce',
  'dediğim gibi',
  'şöyle ki',
]

const COMPLETE_TRAILING_WORDS = new Set([
  'evet', 'hayır', 'yok', 'tamam', 'olur', 'uygun', 'uygundur', 'tabii', 'elbette', 'peki',
  'lütfen', 'teşekkürler', 'teşekkür', 'ederim', 'sağolun', 'olun', 'günler', 'görüşürüz',
  'hoşçakalın', 'istiyorum', 'istiyordum', 'isterim', 'alabilirim', 'gelebilirim', 'olabilir',
  'onaylıyorum', 'onaylıyorum.', 'iptal', 'erteleme', 'bitti', 'bu kadar', 'hepsi bu',
  'mi', 'mı', 'mu', 'mü', 'miyim', 'mıyım', 'muyum', 'müyüm',
  'misiniz', 'mısınız', 'musunuz', 'müsünüz', 'miyiz', 'mıyız', 'muyuz', 'müyüz',
  'var', 'vardı', 'oldu', 'olacak', 'yapalım', 'edelim', 'bakalım',
])

const NUMBER_WORDS = new Set([
  'sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz',
  'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan', 'yüz', 'bin',
])

/**
 * Türkçe canlı konuşma metninin anlam ve söz dizimi açısından tamamlanıp tamamlanmadığını analiz eder.
 * - Bağlaç, düşünme dolgusu ("şey", "yani", "ve", "ama") veya yarım kalmış telefon numarası ile bitiyorsa 'incomplete' döner.
 * - Yüklem, soru eki veya onay ifadesiyle bitiyorsa 'complete' döner.
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

  // Yarım kalmış telefon numarası kontrolü (4-9 hane arası rakam dizisi varsa kullanıcı numarayı söylemeye devam ediyordur)
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
    if (normalized.endsWith(suffix) && suffix !== 'ne zaman') {
      return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_phrase:${suffix}` }
    }
  }

  // Cümle sonu bağlaç / dolgu kelimesi kontrolü
  if (INCOMPLETE_TRAILING_WORDS.has(lastWord)) {
    return { status: 'incomplete', recommendedSilenceMs: 850, reason: `trailing_word:${lastWord}` }
  }

  // Ulaç (zarf-fiil) ekleriyle biten yarım yan cümleler (-ıp/-ip/-up/-üp, -arak/-erek, -ınca/-ince, -ken)
  if (/(?:[ıiuü]p|arak|erek|[ıiuü]nca|[ıiuü]nce|ken)$/u.test(lastWord) && words.length >= 1 && !COMPLETE_TRAILING_WORDS.has(lastWord)) {
    return { status: 'incomplete', recommendedSilenceMs: 800, reason: 'trailing_converb' }
  }

  // Tamamlanmış yüklem, soru eki, onay veya 10-11 haneli tam telefon numarası
  if (
    COMPLETE_TRAILING_WORDS.has(lastWord) ||
    COMPLETE_TRAILING_WORDS.has(lastTwo) ||
    digitsOnly.length >= 10 ||
    /[?\.!]$/u.test(cleaned)
  ) {
    return { status: 'complete', recommendedSilenceMs: 400, reason: 'complete_utterance' }
  }

  // Varsayılan dengeli süre
  return { status: 'complete', recommendedSilenceMs: 550, reason: 'default_complete' }
}

export const SEMANTIC_TURN_PROMPT_INSTRUCTION =
  'AKILLI KONUŞMA SIRASI (TURN DETECTOR): Karşı taraf cümlesini bağlaçla ("ve", "ama", "yani", "şey", "bir de"), yarım kalmış telefon numarasıyla veya düşünme duraksamasıyla bıraktıysa cümlesini tamamlamasını bekle; sözünü kesme. Öksürük, hapşırık, boğaz temizleme veya anlık ortam seslerinde konuşma sırası alma.'

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

  // Semantic mod: öksürük ve anlık seslerin araya girmesini önlemek için düşük başlangıç/bitiş hassasiyeti
  // ve Türkçe düşünme duraksamalarına uygun sessizlik penceresi.
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
 * Öksürük ve masa tıklaması yüksek tepe/RMS oranına (crest factor) ve yüksek sıfır geçiş oranına (ZCR) sahiptir.
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
  // Yüksek enerjili ama aşırı gürültülü/keskin darbe (öksürük patlaması, hapşırık, mikrofon darbesi)
  const isImpulseLike = rms > 180 && (crestFactor > 4.8 || zcr > 0.42)

  return { rms, peak, crestFactor, zcr, isImpulseLike }
}
