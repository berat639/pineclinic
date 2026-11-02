import { isLiveModel, normalizeThinkingLevel, type ThinkingLevel } from './live-model-profile'

export interface VoiceSettings {
  model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking'
  thinkingLevel: ThinkingLevel
  voiceName: string
  startWaitSeconds: number
  callSilenceTimeout: number
  callSilenceCloseTimeout: number
  callMaxDuration: number
  maxActivePhoneCalls: number
}

export const VOICE_SETTINGS_DEFAULTS: VoiceSettings = {
  model: 'gemini-3.8-live',
  thinkingLevel: 'LOW',
  voiceName: 'Aoede',
  startWaitSeconds: 0.4,
  callSilenceTimeout: 30,
  callSilenceCloseTimeout: 15,
  callMaxDuration: 600,
  maxActivePhoneCalls: 3,
}

export const ALLOWED_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const

export async function resolveVoiceSettings(clinicId?: string): Promise<VoiceSettings> {
  const [{ getSetting }, { resolveLiveModel }] = await Promise.all([
    import('../db/repositories/settings'),
    import('./assistant-config'),
  ])
  const [
    model,
    thinkingLevelRaw,
    voiceNameRaw,
    startWaitRaw,
    silenceWarnRaw,
    silenceCloseRaw,
    maxDurationRaw,
    maxCallsRaw,
  ] = await Promise.all([
    resolveLiveModel(),
    getSetting('ai.thinking_level', clinicId),
    getSetting('ai.voice_name', clinicId),
    getSetting('ai.start_wait_seconds', clinicId),
    getSetting('ai.call_silence_timeout', clinicId),
    getSetting('ai.call_silence_close_timeout', clinicId),
    getSetting('ai.call_max_duration', clinicId),
    getSetting('ai.max_active_phone_calls', clinicId),
  ])

  const startWaitNum = Number(startWaitRaw)
  const silenceWarnNum = Number(silenceWarnRaw)
  const silenceCloseNum = Number(silenceCloseRaw)
  const maxDurationNum = Number(maxDurationRaw)
  const maxCallsNum = Number(maxCallsRaw)

  return {
    model: (isLiveModel(model) ? model : VOICE_SETTINGS_DEFAULTS.model) as VoiceSettings['model'],
    thinkingLevel: normalizeThinkingLevel(thinkingLevelRaw),
    voiceName: voiceNameRaw?.trim() || VOICE_SETTINGS_DEFAULTS.voiceName,
    startWaitSeconds: Number.isFinite(startWaitNum) && startWaitRaw !== null
      ? Math.min(2, Math.max(0, startWaitNum))
      : VOICE_SETTINGS_DEFAULTS.startWaitSeconds,
    callSilenceTimeout: Number.isFinite(silenceWarnNum) && silenceWarnNum >= 5 && silenceWarnNum <= 120
      ? silenceWarnNum
      : VOICE_SETTINGS_DEFAULTS.callSilenceTimeout,
    callSilenceCloseTimeout: Number.isFinite(silenceCloseNum) && silenceCloseNum >= 5 && silenceCloseNum <= 120
      ? silenceCloseNum
      : VOICE_SETTINGS_DEFAULTS.callSilenceCloseTimeout,
    callMaxDuration: Number.isFinite(maxDurationNum) && maxDurationNum >= 180 && maxDurationNum <= 900
      ? maxDurationNum
      : VOICE_SETTINGS_DEFAULTS.callMaxDuration,
    maxActivePhoneCalls: Number.isInteger(maxCallsNum) && maxCallsNum >= 2 && maxCallsNum <= 5
      ? maxCallsNum
      : VOICE_SETTINGS_DEFAULTS.maxActivePhoneCalls,
  }
}

export function validateVoiceSettings(input: Record<string, unknown>): {
  valid: boolean
  error?: string
  fieldErrors: Partial<Record<keyof VoiceSettings, string>>
} {
  const fieldErrors: Partial<Record<keyof VoiceSettings, string>> = {}

  if (input.model !== undefined && !isLiveModel(String(input.model))) {
    fieldErrors.model = 'Geçersiz canlı model seçimi'
  }
  if (input.thinkingLevel !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(String(input.thinkingLevel).toUpperCase())) {
    fieldErrors.thinkingLevel = 'Düşünme seviyesi düşük, orta veya yüksek olmalıdır'
  }
  if (input.voiceName !== undefined && !(ALLOWED_VOICES as readonly string[]).includes(String(input.voiceName).trim())) {
    fieldErrors.voiceName = 'Geçersiz asistan sesi seçimi'
  }
  if (input.startWaitSeconds !== undefined) {
    const wait = Number(input.startWaitSeconds)
    if (!Number.isFinite(wait) || wait < 0 || wait > 2) {
      fieldErrors.startWaitSeconds = 'Başlangıç bekleme süresi 0 ile 2 saniye arasında olmalıdır'
    }
  }
  if (input.callSilenceTimeout !== undefined) {
    const s = Number(input.callSilenceTimeout)
    if (!Number.isFinite(s) || s < 5 || s > 120) {
      fieldErrors.callSilenceTimeout = 'Sessizlik uyarısı 5 ile 120 saniye arasında olmalıdır'
    }
  }
  if (input.callSilenceCloseTimeout !== undefined) {
    const s = Number(input.callSilenceCloseTimeout)
    if (!Number.isFinite(s) || s < 5 || s > 120) {
      fieldErrors.callSilenceCloseTimeout = 'Uyarı sonrası kapanış süresi 5 ile 120 saniye arasında olmalıdır'
    }
  }
  if (input.callMaxDuration !== undefined) {
    const s = Number(input.callMaxDuration)
    if (!Number.isFinite(s) || s < 180 || s > 900) {
      fieldErrors.callMaxDuration = 'Maksimum görüşme süresi 3 ile 15 dakika arasında olmalıdır'
    }
  }
  if (input.maxActivePhoneCalls !== undefined) {
    const n = Number(input.maxActivePhoneCalls)
    if (!Number.isInteger(n) || n < 2 || n > 5) {
      fieldErrors.maxActivePhoneCalls = 'Aktif telefon çağrısı kapasitesi 2 ile 5 arasında olmalıdır'
    }
  }

  const firstError = Object.values(fieldErrors)[0]
  return {
    valid: !firstError,
    error: firstError,
    fieldErrors,
  }
}

export async function saveVoiceSettings(input: Record<string, unknown>, clinicId?: string): Promise<VoiceSettings> {
  const { setAiModel, setSetting } = await import('../db/repositories/settings')
  if (input.model !== undefined) await setAiModel(String(input.model))
  if (input.thinkingLevel !== undefined) await setSetting('ai.thinking_level', normalizeThinkingLevel(String(input.thinkingLevel)), clinicId)
  if (input.voiceName !== undefined) await setSetting('ai.voice_name', String(input.voiceName).trim() || VOICE_SETTINGS_DEFAULTS.voiceName, clinicId)
  if (input.startWaitSeconds !== undefined) await setSetting('ai.start_wait_seconds', String(Number(input.startWaitSeconds)), clinicId)
  if (input.callSilenceTimeout !== undefined) await setSetting('ai.call_silence_timeout', String(Number(input.callSilenceTimeout)), clinicId)
  if (input.callSilenceCloseTimeout !== undefined) await setSetting('ai.call_silence_close_timeout', String(Number(input.callSilenceCloseTimeout)), clinicId)
  if (input.callMaxDuration !== undefined) await setSetting('ai.call_max_duration', String(Number(input.callMaxDuration)), clinicId)
  if (input.maxActivePhoneCalls !== undefined) await setSetting('ai.max_active_phone_calls', String(Number(input.maxActivePhoneCalls)), clinicId)

  return resolveVoiceSettings(clinicId)
}
