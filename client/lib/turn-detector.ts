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
  'onaylıyorum', 'iptal', 'erteleme', 'bitti', 'bu kadar', 'hepsi bu',
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

  if (/(?:[ıiuü]p|arak|erek|[ıiuü]nca|[ıiuü]nce|ken)$/u.test(lastWord) && !COMPLETE_TRAILING_WORDS.has(lastWord)) {
    return { status: 'incomplete', recommendedSilenceMs: 800, reason: 'trailing_converb' }
  }

  if (
    COMPLETE_TRAILING_WORDS.has(lastWord) ||
    COMPLETE_TRAILING_WORDS.has(lastTwo) ||
    digitsOnly.length >= 10 ||
    /[?\.!]$/u.test(cleaned)
  ) {
    return { status: 'complete', recommendedSilenceMs: 400, reason: 'complete_utterance' }
  }

  return { status: 'complete', recommendedSilenceMs: 550, reason: 'default_complete' }
}

export const SEMANTIC_TURN_PROMPT_INSTRUCTION =
  'AKILLI KONUŞMA SIRASI (TURN DETECTOR): Karşı taraf cümlesini bağlaçla ("ve", "ama", "yani", "şey", "bir de"), yarım kalmış telefon numarasıyla veya düşünme duraksamasıyla bıraktıysa cümlesini tamamlamasını bekle; sözünü kesme. Öksürük, hapşırık, boğaz temizleme veya anlık ortam seslerinde konuşma sırası alma.'

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
