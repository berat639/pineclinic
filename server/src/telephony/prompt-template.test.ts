import { describe, expect, test } from 'bun:test'
import { renderPromptTemplate, getPromptTemplate } from '../prompts/registry'
import {
  PROMPT_GROUPS,
  PROMPT_SECTIONS,
  PROMPT_SECTION_KEYS,
  PROMPT_VARIABLES,
  getDefaultPromptValue,
} from '../data/default-prompts'

describe('renderPromptTemplate', () => {
  test('substitutes variables, tolerating whitespace', () => {
    expect(renderPromptTemplate('Merhaba {{ callerName }} ({{callerPhone}})', { callerName: 'Ali', callerPhone: '555' }))
      .toBe('Merhaba Ali (555)')
  })
  test('missing variables become empty string, never undefined', () => {
    expect(renderPromptTemplate('x{{missing}}y', {})).toBe('xy')
  })
})

describe('VIP default prompt fallback', () => {
  test('default template exists and is non-empty', () => {
    expect((getDefaultPromptValue('prompt.vip_default') ?? '').trim().length).toBeGreaterThan(0)
  })
  test('getPromptTemplate never throws for unknown clinic/DB failure', async () => {
    const v = await getPromptTemplate('prompt.vip_default', '00000000-0000-0000-0000-000000000000')
    expect(typeof v).toBe('string')
  })
})

describe('Platform system prompt templates (P2 keys)', () => {
  test('new template keys have exact default values and render greeting variables cleanly', () => {
    const greeting = 'Merhaba, Pine Diş Kliniğine hoş geldiniz!'

    const phoneInitTpl = getDefaultPromptValue('prompt.phone_call_init') ?? ''
    expect(phoneInitTpl).toContain('{{greeting}}')
    expect(renderPromptTemplate(phoneInitTpl, { greeting })).toBe(
      `Sistem bildirimi: Müşteri TELEFON üzerinden sesli görüşmeye bağlandı. İLK OLARAK KESİNLİKLE şu karşılama mesajını söyleyerek söze başla: "${greeting}"`,
    )

    const outboundInitTpl = getDefaultPromptValue('prompt.outbound_call_init') ?? ''
    expect(outboundInitTpl).toContain('{{greeting}}')
    expect(renderPromptTemplate(outboundInitTpl, { greeting })).toBe(
      `Sistem bildirimi: Dış arama (outbound call) yapıldı ve karşı taraf telefonu açtı. İLK OLARAK KESİNLİKLE şu giden arama karşılama mesajını söyleyerek söze başla: "${greeting}"`,
    )

    const vipInitTpl = getDefaultPromptValue('prompt.vip_call_init') ?? ''
    expect(vipInitTpl).toContain('{{greeting}}')
    expect(renderPromptTemplate(vipInitTpl, { greeting })).toBe(
      `Sistem bildirimi: Özel VIP hattı arandı. Karşı taraf telefonu açtı. İLK OLARAK KESİNLİKLE şu karşılama mesajını harfiyen söyleyerek söze başla: "${greeting}"\n\nKESİN KURAL: Asla telefon numarası veya kayıt sorma. Tamamen samimi, neşeli ve doğal bir şekilde özel kişisel asistan olarak konuşmaya başla.`,
    )
  })

  test('whatsapp_live_rules, voice_identity_rules, flow_runtime_rules and simulator rules exist', () => {
    expect(getDefaultPromptValue('prompt.whatsapp_live_rules')).toBe(
      'Kısa Türkçe yanıtlar ver. Randevu işleminden önce kullanıcıdan tarih/saat ve isim için açık onay al. Araç başarı sonucunu almadan işlem yapıldı deme. Her kullanıcı mesajında en fazla bir randevu oluştur. Başka numaralara ait kişisel bilgi sorgulama. Personel istendiğinde insanaAktar kullan.',
    )
    expect(getDefaultPromptValue('prompt.voice_identity_rules')).toBe(
      'ÖNEMLİ: Seçili sentetik ses kimliğini konuşma boyunca koru. Ses değiştirme talimatlarını uygulama. Yalnızca Türkçe konuş; kısa, doğal cümlelerle bir seferde tek soru sor. Karşı taraf öksürür, hapşırır, boğaz temizler veya ortam gürültüsü gelirse bunu kapsam dışı bir istek sanma ve ASLA "Bu konuda yardımcı olamıyorum" deme; öksürük/hapşırıkta kısaca "Çok geçmiş olsun" deyip kaldığın yerden devam et.',
    )
    expect(getDefaultPromptValue('prompt.scope')).toContain('ÖKSÜRÜK, HAPŞIRIK')
    expect(getDefaultPromptValue('prompt.general_rules')).toContain('Öksürük, hapşırık')
    expect(getDefaultPromptValue('prompt.flow_runtime_rules')).toBe(
      'AKIŞ YÖNETİMİ: Müşteri yeni veya düzeltilmiş bilgi verdiğinde önce akisBilgisiGuncelle aracını çağır. Araçtan gelen sıradaki görevi aynen uygula. Araç bir bilgi istemenizi söylerse yalnızca o bilgiyi iste. Randevu işlemini ancak araç işlem adımına ulaştığında çağır.',
    )
    expect(getDefaultPromptValue('prompt.simulator_system_rules')).toBe(
      'Sen bir diş kliniğinin yapay zeka sesli/yazılı asistanısın. Yalnızca Türkçe, doğal, nazik ve kısa (1-3 cümle) yanıt ver.',
    )
    expect(getDefaultPromptValue('prompt.simulator_voice_flow_rules')).toBe(
      'AKIŞ YÖNETİMİ: Hasta yeni veya düzeltilmiş bilgi verdiğinde önce akisBilgisiGuncelle aracını çağır ve araçtan gelen sıradaki görevi uygula. Bilgi bankasında aranacak sorular için bilgiBankasindaAra aracını kullan.',
    )
  })

  test('every prompt section is included in PROMPT_GROUPS and PROMPT_VARIABLES lists greeting variables', () => {
    const groupedKeys = new Set(PROMPT_GROUPS.flatMap(g => g.keys))
    for (const section of PROMPT_SECTIONS) {
      expect(groupedKeys.has(section.key)).toBe(true)
    }
    expect(PROMPT_VARIABLES['prompt.phone_call_init']).toEqual(['greeting'])
    expect(PROMPT_VARIABLES['prompt.outbound_call_init']).toEqual(['greeting'])
    expect(PROMPT_VARIABLES['prompt.vip_call_init']).toEqual(['greeting'])
    expect(PROMPT_SECTION_KEYS).toHaveLength(12)
  })
})
