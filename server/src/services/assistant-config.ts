import { getAiModel, getSetting } from '../db/repositories/settings'
import { PROMPT_SECTION_KEYS, getDefaultPromptValue } from '../data/default-prompts'
import { getEffectivePromptSections, renderPromptTemplate } from '../prompts/registry'
import { ALLOWED_LIVE_MODELS, DEFAULT_LIVE_MODEL, isLiveModel } from './live-model-profile'

export { ALLOWED_LIVE_MODELS, DEFAULT_LIVE_MODEL }

export async function resolveLiveModel(): Promise<string> {
  const saved = await getAiModel()
  if (isLiveModel(saved)) return saved
  const fromEnv = process.env.GEMINI_LIVE_MODEL
  if (isLiveModel(fromEnv)) return fromEnv
  return DEFAULT_LIVE_MODEL
}

export async function buildSystemPrompt(greeting: string, direction: string = 'inbound'): Promise<string> {
  let dbSections: Record<string, string> = {}
  try {
    dbSections = await getEffectivePromptSections()
  } catch {}

  const parts: string[] = []
  let activeFlow: import('../db/repositories/flows').ConversationFlow | null = null
  let minimalFlow = false
  let flowRuntimeActive = false
  try {
    const flows = await import('../db/repositories/flows')
    activeFlow = await flows.getActiveFlow(direction)
    minimalFlow = Boolean(activeFlow && flows.isMinimalGreetingEndFlow(activeFlow))
    flowRuntimeActive = (await getSetting('ai.flow_runtime_mode')) === 'active'
  } catch {}
  for (const key of PROMPT_SECTION_KEYS) {
    // Minimal Flow Builder akışında varsayılan randevu senaryosu devreye
    // girerse model, akışta olmayan soruları kendiliğinden üretir.
    if (minimalFlow && key === 'prompt.appointment_rules') continue
    let value = dbSections[key] || getDefaultPromptValue(key) || ''
    if (key === 'prompt.greeting_flow') {
      if (direction === 'whatsapp') {
        value = dbSections['prompt.whatsapp_greeting_flow']
          || getDefaultPromptValue('prompt.whatsapp_greeting_flow')
          || 'WhatsApp üzerinden yazılı destek veriyorsun. Kısa ve anlaşılır yanıtlar yaz. Kullanıcıyı her mesajda yeniden karşılama. Telefonla konuşma veya arama başlatma talimatlarını uygulama.'
      } else if (direction === 'outbound') {
        const outboundTpl = dbSections['prompt.outbound_greeting_flow']
          || getDefaultPromptValue('prompt.outbound_greeting_flow')
          || `GIDEN ARAMA (OUTBOUND) KARŞILAMA VE GÖREV TALİMATI:\nSen dış arama (outbound call) yapıyorsun. Karşı taraf telefonu açtığında İLK CÜMLE olarak KESİNLİKLE şu giden karşılama mesajını söyle:\n"{{greeting}}"\nArdından konuşma akışındaki adımları sırasıyla uygula.`
        value = /\{\{\s*greeting\s*\}\}/.test(outboundTpl)
          ? renderPromptTemplate(outboundTpl, { greeting })
          : `${outboundTpl}\n"${greeting}"`
      } else {
        value = /\{\{\s*greeting\s*\}\}/.test(value)
          ? renderPromptTemplate(value, { greeting })
          : `GELEN ARAMA (INBOUND) KARŞILAMA:\nMüşteri aradığında şu karşılama mesajını söyle: "${greeting}"\nSonra müşterinin ne istediğini dinle ve yardımcı ol.`
      }
    }
    if (value) parts.push(value)
  }

  // Inject conversation flow as prompt text
  try {
    const { flowToPromptText } = await import('../db/repositories/flows')
    // The runtime sends only the active task through its tool result. Keeping
    // the whole graph out of the Live instruction avoids charging it every turn.
    if (activeFlow && !flowRuntimeActive) {
      const flowText = flowToPromptText(activeFlow)
      if (flowText) parts.push(flowText)
    }
  } catch {}

  // Inject optional per-clinic AI behavior preferences (tone, length, language, KB strictness)
  try {
    const [tonePreset, responseLength, languagePref, unknownFallback, kbStrictness] = await Promise.all([
      getSetting('ai.tone_preset'),
      getSetting('ai.response_length'),
      getSetting('ai.language'),
      getSetting('ai.unknown_fallback'),
      getSetting('ai.kb_strictness'),
    ])
    const behaviorLines: string[] = []
    if (tonePreset === 'formal') {
      behaviorLines.push('- Üslup: Resmi, kurumsal ve saygılı ("Siz" dili) konuş.')
    } else if (tonePreset === 'warm') {
      behaviorLines.push('- Üslup: Samimi, sıcak, empatik ve rahatlatıcı bir dille konuş.')
    } else if (tonePreset === 'concise') {
      behaviorLines.push('- Üslup: Doğrudan, pratik ve net konuş; gereksiz giriş cümleleri kullanma.')
    }
    if (responseLength === 'short') {
      behaviorLines.push('- Yanıt Uzunluğu: Her yanıtta en fazla 1-2 kısa cümle kur.')
    } else if (responseLength === 'detailed') {
      behaviorLines.push('- Yanıt Uzunluğu: Hastanın sorularını açıklayıcı ve kapsamlı yanıtla.')
    }
    if (languagePref === 'tr_only') {
      behaviorLines.push('- Dil Politikası: Yalnızca Türkçe konuş.')
    } else if (languagePref === 'multilingual') {
      behaviorLines.push('- Dil Politikası: Varsayılan dil Türkçe; ancak hasta İngilizce/Almanca/Arapça konuşursa o dilde yanıt ver.')
    }
    if (kbStrictness === 'strict') {
      behaviorLines.push('- Bilgi Tabanı Kuralı (SIKI MOD): Yalnızca Bilgi Bankası içinde açıkça yer alan bilgileri söyle; bilgi bankasında olmayan konularda asla tahmin yürütme.')
    }
    if (unknownFallback === 'transfer') {
      behaviorLines.push('- Bilinmeyen Soru Davranışı: Bilgi bankasında cevabı olmayan bir soru gelirse hastayı yetkili personele aktar (aramaAktar / insanaAktar).')
    } else if (unknownFallback === 'take_note') {
      behaviorLines.push('- Bilinmeyen Soru Davranışı: Bilgi bankasında cevabı olmayan bir soru gelirse hastaNotKaydet aracını kullanarak konuyu bankoya not bırak.')
    }
    if (behaviorLines.length > 0) {
      parts.push(`KLİNİK AI DAVRANIŞ TERCİHLERİ:\n${behaviorLines.join('\n')}`)
    }
  } catch {}

  if (direction !== 'whatsapp') {
    const joined = parts.join('\n\n')
    if (!joined.includes('ÖKSÜRÜK') && !joined.includes('öksür')) {
      parts.push(
        'KONUŞMA DIŞI SESLER (ÖKSÜRÜK / HAPŞIRIK / GÜRÜLTÜ): Karşı tarafın öksürmesi, hapşırması, boğaz temizlemesi, nefes sesi veya ortam gürültüsü kapsam dışı bir istek DEĞİLDİR; böyle seslerde ASLA "Bu konuda yardımcı olamıyorum" deme. Öksürük veya hapşırıkta kısaca "Çok geçmiş olsun" deyip kaldığın yerden devam et.',
      )
    }
    if (!joined.includes('KONU DIŞI ISRAR')) {
      parts.push(
        'KONU DIŞI ISRAR VE OTOMATİK KAPATMA KURALI: Karşı taraf klinik veya randevu dışında alakasız bir konu açarsa ilk seferde nazikçe klinik/randevu konusuna yönlendir. Karşı taraf uyarıya rağmen ikinci kez konu dışına çıkar veya konuyu dağıtmaya devam ederse sohbeti KESİNLİKLE uzatma; "Yardımcı olabileceğim bir klinik işleminiz yoksa görüşmemizi sonlandırıyorum, sağlıklı günler dilerim." de ve hemen cagriySonlandir aracını çağır.',
      )
    }
  }

  return parts.join('\n\n')
}
