import { describe, expect, test } from 'bun:test'
import { EndSensitivity, StartSensitivity } from '@google/genai'
import {
  analyzePcmFrameCharacteristics,
  analyzeTurkishTurnCompleteness,
  buildRealtimeDetectionConfig,
  evaluateLiveKitTurkishTurn,
} from './turn-detector'
import { validateVoiceSettings } from './voice-settings'

describe('Turkish Semantic Turn Detector', () => {
  test('classifies trailing conjunctions, fillers, and partial phone numbers as incomplete', () => {
    expect(analyzeTurkishTurnCompleteness('Yarın randevu almak istiyorum ama').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Şimdi şöyle').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Numaram 0532 411').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('sıfır beş yüz otuz iki').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Pazartesi günü bir de').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Dişim ağrıyor yani').status).toBe('incomplete')
  })

  test('evaluates LiveKit context-aware EOU probability with assistant question context', () => {
    // Bağlam yokken "Salı günü" tümleçtir ve yüklem bekler
    const withoutContext = evaluateLiveKitTurkishTurn({ userText: 'Salı günü' })
    expect(withoutContext.status).toBe('incomplete')
    expect(withoutContext.eouProbability).toBeLessThan(0.5)

    // Asistan "Hangi gün?" diye sorduğunda ise "Salı günü" tam bir cevaptır
    const withDateQuestion = evaluateLiveKitTurkishTurn({
      userText: 'Salı günü',
      assistantText: 'Hangi gün için randevu oluşturmamı istersiniz?',
    })
    expect(withDateQuestion.status).toBe('complete')
    expect(withDateQuestion.eouProbability).toBeGreaterThanOrEqual(0.85)
    expect(withDateQuestion.recommendedSilenceMs).toBeLessThanOrEqual(400)
  })

  test('detects Turkish SOV verb-final pauses (infinitives, case suffixes, conditionals, genitives) as incomplete', () => {
    // Mastar (-mak/-mek) ile biten ve henüz "istiyorum" yüklemi gelmemiş cümleler
    expect(analyzeTurkishTurnCompleteness('Yarın öğleden sonra randevu almak').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('İmplant tedavisi için muayene olmak').status).toBe('incomplete')
    // İsim-fiil (-mayı/-meye)
    expect(analyzeTurkishTurnCompleteness('Yarın kliniğinize gelmeyi').status).toBe('incomplete')
    // Şart kipi (-sa/-se) yan cümlesi
    expect(analyzeTurkishTurnCompleteness('Yarın saat üçte boşluk varsa').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Doktor Bey müsaitse').status).toBe('incomplete')
    // Tamlayan eki (-ın/-in/-nın) — tamlanan henüz gelmedi
    expect(analyzeTurkishTurnCompleteness('Benim dişimin').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Doktor Ahmet Beyin').status).toBe('incomplete')
    // SOV Hâl ekleri (Ayrılma -dan/-den, Vasıta -la/-le, Yönelme/Belirtme)
    expect(analyzeTurkishTurnCompleteness('Doktor Ahmet Beyden').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Yarın sabah eşimle').status).toBe('incomplete')
    expect(analyzeTurkishTurnCompleteness('Mevcut randevumu').status).toBe('incomplete')
    // Özne ile başlayıp henüz yüklemi söylenmemiş 3+ kelimeli SOV cümleler
    expect(analyzeTurkishTurnCompleteness('Ben yarın öğleden sonra klinikte').status).toBe('incomplete')
  })

  test('classifies complete Turkish sentences, finite verbs, confirmations, and full phone numbers as complete', () => {
    expect(analyzeTurkishTurnCompleteness('Yarın öğleden sonra randevu almak istiyorum').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Yarın saat üçte geleceğim').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Sol alt azı dişim çok ağrıyor').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Randevu alabilir miyim').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Evet onaylıyorum').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('0532 411 22 33').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Perşembe günü boş yer var mı?').status).toBe('complete')
    expect(analyzeTurkishTurnCompleteness('Teşekkür ederim iyi günler').status).toBe('complete')
  })

  test('classifies empty or noise-tagged transcripts as non_speech', () => {
    expect(analyzeTurkishTurnCompleteness('').status).toBe('non_speech')
    expect(analyzeTurkishTurnCompleteness('[öksürük]').status).toBe('non_speech')
    expect(analyzeTurkishTurnCompleteness('<noise>').status).toBe('non_speech')
  })

  test('builds semantic vs standard realtime detection configs accurately', () => {
    const semanticWeb = buildRealtimeDetectionConfig('semantic', 'web')
    expect(semanticWeb.automaticActivityDetection?.startOfSpeechSensitivity).toBe(
      StartSensitivity.START_SENSITIVITY_LOW,
    )
    expect(semanticWeb.automaticActivityDetection?.endOfSpeechSensitivity).toBe(
      EndSensitivity.END_SENSITIVITY_LOW,
    )
    expect(semanticWeb.automaticActivityDetection?.silenceDurationMs).toBe(650)

    const standardPhone = buildRealtimeDetectionConfig('standard', 'phone', 300)
    expect(standardPhone.automaticActivityDetection?.startOfSpeechSensitivity).toBe(
      StartSensitivity.START_SENSITIVITY_HIGH,
    )
    expect(standardPhone.automaticActivityDetection?.endOfSpeechSensitivity).toBe(
      EndSensitivity.END_SENSITIVITY_HIGH,
    )
    expect(standardPhone.automaticActivityDetection?.silenceDurationMs).toBe(300)
  })

  test('distinguishes sharp impulse/cough bursts from sustained voiced speech', () => {
    // 160 samples (320 bytes): single sharp spike (cough/click transient)
    const impulseBuf = Buffer.alloc(320, 0)
    impulseBuf.writeInt16LE(22000, 20)
    impulseBuf.writeInt16LE(-21000, 22)
    const impulse = analyzePcmFrameCharacteristics(impulseBuf)
    expect(impulse.isImpulseLike).toBe(true)

    // Smooth 250 Hz sine wave (voiced vowel)
    const speechBuf = Buffer.alloc(320, 0)
    for (let i = 0; i < 160; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * 250 * i) / 8000) * 4000)
      speechBuf.writeInt16LE(sample, i * 2)
    }
    const speech = analyzePcmFrameCharacteristics(speechBuf)
    expect(speech.isImpulseLike).toBe(false)
  })

  test('validates turnDetectionMode and noiseFilterMode in voice settings', () => {
    expect(
      validateVoiceSettings({ turnDetectionMode: 'semantic', noiseFilterMode: 'rnnoise' }).valid,
    ).toBe(true)
    expect(
      validateVoiceSettings({ turnDetectionMode: 'standard', noiseFilterMode: 'off' }).valid,
    ).toBe(true)
    const invalid = validateVoiceSettings({ turnDetectionMode: 'invalid', noiseFilterMode: 'bad' })
    expect(invalid.valid).toBe(false)
    expect(invalid.fieldErrors.turnDetectionMode).toBeDefined()
    expect(invalid.fieldErrors.noiseFilterMode).toBeDefined()
  })
})

