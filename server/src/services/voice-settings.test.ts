import { describe, expect, test } from 'bun:test'
import {
  buildOffTopicPromptRule,
  DEFAULT_OFF_TOPIC_CLOSE_MESSAGE,
  validateVoiceSettings,
  VOICE_SETTINGS_DEFAULTS,
} from './voice-settings'
import { renderPromptTemplate } from '../prompts/registry'
import { PROMPT_SECTIONS } from '../data/default-prompts'

describe('voice-settings validation & prompt registry', () => {
  test('accepts valid voice settings including offTopicMaxStrikes and offTopicCloseMessage', () => {
    const res = validateVoiceSettings({
      model: 'gemini-3.8-live-extended-thinking',
      thinkingLevel: 'HIGH',
      voiceName: 'Aoede',
      startWaitSeconds: 0.6,
      callSilenceTimeout: 25,
      callSilenceCloseTimeout: 10,
      callMaxDuration: 480,
      maxActivePhoneCalls: 4,
      offTopicMaxStrikes: 2,
      offTopicCloseMessage: DEFAULT_OFF_TOPIC_CLOSE_MESSAGE,
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
      offTopicMaxStrikes: 9,
      offTopicCloseMessage: 'kısa',
    })
    expect(res.valid).toBe(false)
    expect(res.fieldErrors.voiceName).toBeDefined()
    expect(res.fieldErrors.startWaitSeconds).toBeDefined()
    expect(res.fieldErrors.callMaxDuration).toBeDefined()
    expect(res.fieldErrors.offTopicMaxStrikes).toBeDefined()
    expect(res.fieldErrors.offTopicCloseMessage).toBeDefined()
  })

  test('builds off-topic prompt rule from configured strikes and closing message', () => {
    const rule2 = buildOffTopicPromptRule(2, DEFAULT_OFF_TOPIC_CLOSE_MESSAGE)
    expect(rule2).toContain('SINIR: 2. KEZ')
    expect(rule2).toContain(DEFAULT_OFF_TOPIC_CLOSE_MESSAGE)

    const rule1 = buildOffTopicPromptRule(1, 'Görüşmemizi sonlandırıyorum, iyi günler.')
    expect(rule1).toContain('SINIR: 1 KEZ')
    expect(rule1).toContain('Görüşmemizi sonlandırıyorum, iyi günler.')
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

  test('flowToPromptText includes wait-for-customer instructions after every question and traverses merged Hayır branch', async () => {
    const { flowToPromptText } = await import('../db/repositories/flows')
    const prompt = flowToPromptText({
      id: 'sample',
      name: 'sample',
      isActive: true,
      createdAt: '',
      updatedAt: '',
      nodes: [
        { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: { label: 'Karşılama Mesajı' } },
        { id: 'cond_kayitli', type: 'CONDITION', position: { x: 0, y: 100 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true' } },
        { id: 'field_sikayet', type: 'FIELD', position: { x: 0, y: 200 }, data: { fieldName: 'sikayet', description: 'Şikayetiniz veya yaptırmak istediğiniz işlem nedir?' } },
        { id: 'field_musteri_adi', type: 'FIELD', position: { x: 200, y: 200 }, data: { fieldName: 'musteri_adi', description: 'Adınızı ve soyadınızı alabilir miyim?', required: true } },
        { id: 'field_tel', type: 'FIELD', position: { x: 200, y: 300 }, data: { fieldName: 'telefon', description: 'Size ulaşabileceğimiz telefon numaranızı alabilir miyim?', required: true } },
        { id: 'field_tarih', type: 'FIELD', position: { x: 0, y: 400 }, data: { fieldName: 'tarih', description: 'Hangi tarihe randevu oluşturmak istersiniz?', required: true } },
        { id: 'field_saat', type: 'FIELD', position: { x: 0, y: 500 }, data: { fieldName: 'saat', description: 'Saat kaç için randevu istersiniz?', required: true } },
        { id: 'action_randevu', type: 'ACTION', position: { x: 0, y: 600 }, data: { action: 'save_appointment_pending' } },
        { id: 'end', type: 'END', position: { x: 0, y: 700 }, data: { label: 'Görüşmeyi Bitir' } },
      ],
      edges: [
        { id: 'e_s_c', source: 'start', target: 'cond_kayitli' },
        { id: 'e_c_true', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
        { id: 'e_c_false', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_musteri_adi' },
        { id: 'e_ad_tel', source: 'field_musteri_adi', target: 'field_tel' },
        { id: 'e_tel_sik', source: 'field_tel', target: 'field_sikayet' },
        { id: 'e_sik_tar', source: 'field_sikayet', target: 'field_tarih' },
        { id: 'e_tar_sa', source: 'field_tarih', target: 'field_saat' },
        { id: 'e_sa_act', source: 'field_saat', target: 'action_randevu' },
        { id: 'e_act_end', source: 'action_randevu', target: 'end' },
      ],
    })

    expect(prompt).toContain('Müşterinin konuşmasını ve cevabını bekle')
    const hayirSection = prompt.split('- Hayır (Kırmızı Yol):')[1] || ''
    expect(hayirSection).toContain('"musteri_adi" bilgisini sor')
    expect(hayirSection).toContain('"telefon" bilgisini sor')
    expect(hayirSection).toContain('"sikayet" bilgisini sor')
    expect(hayirSection).toContain('"tarih" bilgisini sor')
    expect(hayirSection).toContain('"saat" bilgisini sor')
    expect(hayirSection).toContain('RANDEVU OLUŞTUR')
    expect(prompt).toContain('⚡ HIZLI GEÇİŞ VE TEKRARSIZ SORU KURALI')
  })

  test('isEnglishResponseDetected never false-positives on Turkish text or isolated common words', async () => {
    const { isEnglishResponseDetected, buildRealtimeDetectionConfig } = await import('./turn-detector')
    expect(isEnglishResponseDetected('Merhaba, randevu planı için uygun tarih nedir?')).toBe(false)
    expect(isEnglishResponseDetected('Tamam, test sonuçlarınızı kontrol ediyorum.')).toBe(false)
    expect(isEnglishResponseDetected('What time would you like to book your appointment?')).toBe(true)
    expect(isEnglishResponseDetected("I'm sorry, I cannot help with that.")).toBe(true)

    const phoneCfg = buildRealtimeDetectionConfig('semantic', 'phone')
    expect(phoneCfg.automaticActivityDetection?.silenceDurationMs).toBe(380)
    const webCfg = buildRealtimeDetectionConfig('semantic', 'web')
    expect(webCfg.automaticActivityDetection?.silenceDurationMs).toBe(420)
  })

  test('buildFlowNodePrompt combines consecutive musteri_adi+telefon and tarih+saat into single natural questions', async () => {
    const { buildDefaultWebFlow } = await import('../db/repositories/flows')
    const { buildFlowNodePrompt } = await import('./flow-engine')
    const webFlow = buildDefaultWebFlow()

    const firstNode = webFlow.nodes.find(n => n.id === 'field_musteri_adi')!
    const combinedIdentityPrompt = buildFlowNodePrompt(webFlow, firstNode, {})
    expect(combinedIdentityPrompt).toContain('adınızı, soyadınızı ve telefon numaranızı')

    const dateNode = webFlow.nodes.find(n => n.id === 'field_tarih')!
    const combinedSlotPrompt = buildFlowNodePrompt(webFlow, dateNode, { musteri_adi: 'Ahmet Yılmaz', telefon: '05551234567' })
    expect(combinedSlotPrompt).toContain('Hangi gün ve saat için randevu oluşturmamı istersiniz?')
  })
})
