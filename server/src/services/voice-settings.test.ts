import { describe, expect, test } from 'bun:test'
import { validateVoiceSettings, VOICE_SETTINGS_DEFAULTS } from './voice-settings'
import { renderPromptTemplate } from '../prompts/registry'
import { PROMPT_SECTIONS } from '../data/default-prompts'

describe('voice-settings validation & prompt registry', () => {
  test('accepts valid voice settings', () => {
    const res = validateVoiceSettings({
      model: 'gemini-3.8-live-extended-thinking',
      thinkingLevel: 'HIGH',
      voiceName: 'Aoede',
      startWaitSeconds: 0.6,
      callSilenceTimeout: 25,
      callSilenceCloseTimeout: 10,
      callMaxDuration: 480,
      maxActivePhoneCalls: 4,
    })
    expect(res.valid).toBe(true)
    expect(res.error).toBeUndefined()
  })

  test('rejects invalid voice settings with field-level errors', () => {
    const res = validateVoiceSettings({
      ...VOICE_SETTINGS_DEFAULTS,
      voiceName: 'InvalidVoiceName',
      startWaitSeconds: 5,
      callMaxDuration: 60,
    })
    expect(res.valid).toBe(false)
    expect(res.fieldErrors.voiceName).toBeDefined()
    expect(res.fieldErrors.startWaitSeconds).toBeDefined()
    expect(res.fieldErrors.callMaxDuration).toBeDefined()
  })

  test('renders prompt template variables and includes all Faz 6 prompt keys', () => {
    const rendered = renderPromptTemplate(
      'Karşılama: "{{greeting}}" | Alanlar: {{customFields}}',
      { greeting: 'Hoş geldiniz', customFields: 'isim, telefon' },
    )
    expect(rendered).toBe('Karşılama: "Hoş geldiniz" | Alanlar: isim, telefon')

    const keys = PROMPT_SECTIONS.map(s => s.key)
    expect(keys).toContain('prompt.outbound_greeting_flow')
    expect(keys).toContain('prompt.whatsapp_greeting_flow')
    expect(keys).toContain('prompt.phone_channel_rules')
    expect(keys).toContain('prompt.flow_priority_rules')
    expect(keys).toContain('prompt.vip_default')
  })
})
