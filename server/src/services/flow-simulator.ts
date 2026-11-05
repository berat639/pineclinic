import { Type } from '@google/genai'
import { evaluateConditionNode, renderFlowTemplate, type FlowEdge, type FlowNode, flowToPromptText } from '../db/repositories/flows'
import { getGreeting } from '../db/repositories/settings'
import { retrieveTopK, buildRagPrompt } from '../rag'
import { getGeminiClient } from './gemini-client'
import { recordAiTokenUsage } from '../db/repositories/ai-usage'
import { currentClinicId } from '../tenancy/context'
import { getPromptTemplate, renderPromptTemplate } from '../prompts/registry'
import { PROMPT_SECTION_KEYS } from '../data/default-prompts'
import { resolveClinicGeminiKey } from './gemini-client'
import { DEFAULT_LIVE_MODEL, isLiveModel } from './live-model-profile'
import { getAiModel } from '../db/repositories/settings'
import { wrapWithTurkishLanguageLock } from './turn-detector'

/**
 * GÜVENLİK SINIRI: Bu modül yalnızca bellekteki TASLAK akış üzerinde çalışır.
 * Yayındaki akışa (flow-engine, flow_sessions), telefon hattına, randevu/not
 * kayıtlarına ve ayarlara YAZMAZ. Tek yan etki, kullanım sayacına
 * `source: 'simulator'` kaydı eklemektir.
 */

export interface SimulationMessage {
  role: 'ai' | 'user' | 'system' | 'action'
  text: string
}

export interface FlowSimulationRequest {
  direction?: 'inbound' | 'outbound' | 'whatsapp' | 'web'
  nodes: FlowNode[]
  edges: FlowEdge[]
  currentNodeId?: string | null
  fields?: Record<string, string>
  visitedNodeIds?: string[]
  visitedEdgeIds?: string[]
  history?: Array<{ role: 'user' | 'model'; text: string }>
  userMessage?: string
  manualBranch?: 'true' | 'false'
  /** 'adim' (varsayılan) | 'sesli_ayar' (sesli oturum ayarı) | 'sesli_bilgi' (sesli bilgi bankası araması) */
  kind?: 'adim' | 'sesli_ayar' | 'sesli_bilgi'
  /** Yapay zeka yanıtı üretmeden yalnızca akışı ilerletir (sesli mod aracı için). */
  skipReply?: boolean
}

export interface SimulatorVoiceConfig {
  available: boolean
  message?: string
  apiKey?: string
  model?: string
  voiceName?: string
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  turnDetectionMode?: 'semantic' | 'standard'
  noiseFilterMode?: 'rnnoise' | 'off'
  callMaxDuration?: number
  offTopicMaxStrikes?: number
  offTopicCloseMessage?: string
  systemPrompt?: string
  greeting?: string
}

export interface FlowSimulationResponse {
  currentNodeId: string | null
  visitedNodeIds: string[]
  visitedEdgeIds: string[]
  fields: Record<string, string>
  extractedFields: Record<string, string>
  logs: SimulationMessage[]
  completed: boolean
  aiPowered: boolean
  usedKnowledgeTitles: string[]
  /** Sıradaki zorunlu görev (sesli moda araç yanıtı olarak verilir). */
  nextInstruction?: string
  voiceConfig?: SimulatorVoiceConfig
  toolResult?: Record<string, unknown>
}

const ACTION_LABELS: Record<string, string> = {
  save_appointment_pending: '📝 Randevu Talebi Oluştur (Onay Bekler)',
  randevuOlustur: '📝 Randevu Oluştur',
  save_patient_note: '🗒️ Hastadan Not Al (Bankoya İlet)',
  notBirak: '🗒️ Anket / Hasta Notu Kaydet',
  set_variable: '🔧 Değişken Ata',
  send_sms: '💬 SMS Gönder',
  wait_reprompt: '⏳ Bekle / Yeniden Sor',
  wait: '⏳ Bekle / Yeniden Sor',
  switch_prompt: '🔄 Prompt / Mod Değiştir',
  end_call: '👋 Bilgi Ver ve Görüşmeyi Bitir',
  transfer_call: '📞 Aramayı Yetkiliye Aktar',
  transfer: '📞 Canlı Desteğe Aktar',
  send_wa_location: '📍 WhatsApp’tan Konum Gönder',
  send_wa_message: '📱 WhatsApp Mesajı Gönder',
  save_record: '💾 Veritabanına Kaydet',
}

function getTodayIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

function evaluateDeterministicCondition(
  node: FlowNode,
  fields: Record<string, string>,
  intentMatchedByAi?: boolean,
  direction?: string,
): boolean {
  return evaluateConditionNode(node, fields, intentMatchedByAi, {
    direction: direction || 'inbound',
    channel: direction === 'whatsapp' ? 'whatsapp' : direction === 'web' ? 'web_direct' : 'phone',
  })
}

function isFieldSatisfied(node: FlowNode, fields: Record<string, string>): boolean {
  const name = String(node.data.fieldName || '').trim()
  if (!name) return true
  const val = String(fields[name] ?? '').trim()
  if (!val) return false
  if (val === '(boş)' && !node.data.required) return true
  if (node.data.fieldType === 'date' || name === 'tarih') return /^\d{4}-\d{2}-\d{2}$/.test(val)
  if (node.data.fieldType === 'time' || name === 'saat') return /^([01]\d|2[0-3]):[0-5]\d$/.test(val)
  if (name === 'telefon') return val.replace(/\D/g, '').length >= 10
  return true
}

const NO_AI_MESSAGE = 'Bu klinik için yapay zeka bağlantısı tanımlı değil.'

function emptyState(req: FlowSimulationRequest): FlowSimulationResponse {
  return {
    currentNodeId: req.currentNodeId ?? null,
    visitedNodeIds: req.visitedNodeIds || [],
    visitedEdgeIds: req.visitedEdgeIds || [],
    fields: { ...(req.fields || {}) },
    extractedFields: {},
    logs: [],
    completed: false,
    aiPowered: false,
    usedKnowledgeTitles: [],
  }
}

async function resolveGreeting(direction: string): Promise<string> {
  try {
    return direction === 'outbound'
      ? (await getGreeting('outbound')) || 'Merhaba, kliniğimizden memnuniyet anketi için arıyorum.'
      : (await getGreeting('inbound')) || 'Merhaba, kliniğimize hoş geldiniz. Size nasıl yardımcı olabilirim?'
  } catch {
    return 'Merhaba, kliniğimize hoş geldiniz. Size nasıl yardımcı olabilirim?'
  }
}

const DEFAULT_SIMULATOR_SYSTEM_RULES =
  'Sen bir diş kliniğinin yapay zeka sesli/yazılı asistanısın. Yalnızca Türkçe, doğal, nazik ve kısa (1-3 cümle) yanıt ver.'
const DEFAULT_SIMULATOR_VOICE_FLOW_RULES =
  'AKIŞ YÖNETİMİ: Karşılama mesajını söyledikten sonra DUR ve hastanın konuşmasını bekle. Hasta konuştuğunda veya her soruya yanıt verdiğinde önce akisBilgisiGuncelle aracını çağır, araçtan gelen sıradaki TEK görevi/soruyu uygula ve tekrar hastanın konuşmasını bekle. Hasta yanıt vermeden asla bir sonraki soruya geçme. Bilgi bankasında aranacak sorular için bilgiBankasindaAra aracını kullan.'

/** Kliniğin (yoksa platformun) sistem talimatlarını sırayla birleştirir. Salt okunur. */
async function buildClinicInstructions(clinicId: string | undefined, direction: string, greeting: string): Promise<string> {
  const parts: string[] = []
  for (const key of PROMPT_SECTION_KEYS) {
    let value = ''
    try { value = await getPromptTemplate(key, clinicId) } catch { value = '' }
    if (!value) continue
    if (key === 'prompt.greeting_flow') {
      if (direction === 'outbound') {
        value = (await getPromptTemplate('prompt.outbound_greeting_flow', clinicId).catch(() => '')) || value
      } else if (direction === 'whatsapp') {
        value = (await getPromptTemplate('prompt.whatsapp_greeting_flow', clinicId).catch(() => '')) || value
      }
      value = renderPromptTemplate(value, { greeting })
    }
    parts.push(value)
  }
  return parts.join('\n\n')
}

/** Taslak akış için sesli oturum ayarı. Kliniğin anahtarı, yoksa ortak yedek anahtar kullanılır. */
async function buildVoiceConfig(req: FlowSimulationRequest, clinicId: string | undefined): Promise<SimulatorVoiceConfig> {
  let apiKey = ''
  try {
    apiKey = (await resolveClinicGeminiKey(clinicId)).apiKey
  } catch {
    return { available: false, message: NO_AI_MESSAGE }
  }
  const direction = req.direction || 'inbound'
  const greeting = await resolveGreeting(direction)
  const saved = await getAiModel().catch(() => null)
  const model = isLiveModel(saved) ? saved : isLiveModel(process.env.GEMINI_LIVE_MODEL) ? process.env.GEMINI_LIVE_MODEL! : DEFAULT_LIVE_MODEL
  const flowPrompt = flowToPromptText({
    id: 'sim', name: 'simulation', nodes: Array.isArray(req.nodes) ? req.nodes : [], edges: Array.isArray(req.edges) ? req.edges : [],
    isActive: true, createdAt: '', updatedAt: '',
  })
  const [instructions, rawVoiceFlowRules, voiceSettings] = await Promise.all([
    buildClinicInstructions(clinicId, direction, greeting),
    getPromptTemplate('prompt.simulator_voice_flow_rules', clinicId).catch(() => ''),
    import('./voice-settings').then(m => m.resolveVoiceSettings(clinicId)).catch(() => null),
  ])
  const voiceFlowRules = renderPromptTemplate(rawVoiceFlowRules.trim() || DEFAULT_SIMULATOR_VOICE_FLOW_RULES, {}).trim() || DEFAULT_SIMULATOR_VOICE_FLOW_RULES
  let ragContext = ''
  try {
    const docs = await retrieveTopK('kliniğin genel bilgileri, çalışma saatleri, hizmetler', 5, direction)
    if (docs.length > 0) ragContext = await buildRagPrompt(docs)
  } catch { /* bilgi bankası isteğe bağlı */ }
  const offTopicRule = voiceSettings
    ? (await import('./voice-settings')).buildOffTopicPromptRule(voiceSettings.offTopicMaxStrikes, voiceSettings.offTopicCloseMessage)
    : ''
  const systemPrompt = wrapWithTurkishLanguageLock(`BUGÜNÜN TARİHİ: ${getTodayIso()}. Bu bir SİMÜLASYONDUR; hiçbir kayıt gerçekten oluşturulmaz.

${instructions}

${flowPrompt}

${voiceFlowRules}${offTopicRule ? `\n\n${offTopicRule}` : ''}${ragContext}`)
  return {
    available: true,
    apiKey,
    model,
    voiceName: voiceSettings?.voiceName || 'Aoede',
    thinkingLevel: voiceSettings?.thinkingLevel || 'LOW',
    turnDetectionMode: voiceSettings?.turnDetectionMode || 'semantic',
    noiseFilterMode: voiceSettings?.noiseFilterMode || 'rnnoise',
    callMaxDuration: voiceSettings?.callMaxDuration || 600,
    offTopicMaxStrikes: voiceSettings?.offTopicMaxStrikes || 2,
    offTopicCloseMessage: voiceSettings?.offTopicCloseMessage,
    systemPrompt,
    greeting,
  }
}

export async function runFlowSimulationStep(req: FlowSimulationRequest): Promise<FlowSimulationResponse> {
  const clinicId = currentClinicId() || undefined
  if (req.kind === 'sesli_ayar') {
    return { ...emptyState(req), voiceConfig: await buildVoiceConfig(req, clinicId) }
  }
  if (req.kind === 'sesli_bilgi') {
    const query = (req.userMessage || '').trim()
    let titles: string[] = []
    let text = ''
    try {
      const docs = query ? await retrieveTopK(query, 3, req.direction || 'inbound') : []
      titles = docs.map(d => d.title)
      text = docs.length > 0 ? await buildRagPrompt(docs) : ''
    } catch { /* bilgi bankası isteğe bağlı */ }
    return { ...emptyState(req), usedKnowledgeTitles: titles, toolResult: { sonuc: text || 'Bilgi bankasında ilgili kayıt bulunamadı.' } }
  }
  return runStep(req, clinicId)
}

async function runStep(req: FlowSimulationRequest, clinicId: string | undefined): Promise<FlowSimulationResponse> {
  const direction = req.direction || 'inbound'
  const nodes = Array.isArray(req.nodes) ? req.nodes : []
  const edges = Array.isArray(req.edges) ? req.edges : []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const fields: Record<string, string> = { ...(req.fields || {}) }
  const extractedFields: Record<string, string> = {}
  const visitedNodeIds = [...(req.visitedNodeIds || [])]
  const visitedEdgeIds = [...(req.visitedEdgeIds || [])]
  const logs: SimulationMessage[] = []
  const usedKnowledgeTitles: string[] = []

  const ai = await getGeminiClient(clinicId).catch(() => null)
  const modelName = process.env.GEMINI_SIMULATION_MODEL || 'gemini-3.8-flash'

  const userMessage = (req.userMessage || '').trim()
  let currId: string | null = req.currentNodeId ?? nodes.find(n => n.type === 'START')?.id ?? null

  // 1. Check Global Keyword Triggers first if user sent a message
  let matchedGlobalFound = false
  if (userMessage) {
    const lowMsg = userMessage.toLocaleLowerCase('tr-TR')
    const matchedGlobal = nodes.find(n => {
      if (n.type !== 'ACTION') return false
      const kwRaw = String(n.data.triggerKeywords || '')
      const kwList = kwRaw.split(/[,;|\n]+/).map(k => k.trim().toLocaleLowerCase('tr-TR')).filter(Boolean)
      return kwList.some(k => lowMsg.includes(k))
    })

    if (matchedGlobal) {
      matchedGlobalFound = true
      currId = matchedGlobal.id
      if (!visitedNodeIds.includes(matchedGlobal.id)) visitedNodeIds.push(matchedGlobal.id)
      const actLabel = ACTION_LABELS[String(matchedGlobal.data.action || '')] || matchedGlobal.data.label || 'İşlem'
      logs.push({
        role: 'action',
        text: `⚡ GLOBAL TETİKLEYİCİ EŞLEŞTİ: ${actLabel}`,
      })
    }
  }

  // 2. If user sent a message, run AI extraction (fields + user_intent) & RAG lookup
  let ragContext = ''
  let aiIntentMatched: boolean | undefined = undefined

  if (userMessage && !matchedGlobalFound) {
    try {
      const docs = await retrieveTopK(userMessage, 3, direction)
      if (docs.length > 0) {
        usedKnowledgeTitles.push(...docs.map(d => d.title))
        ragContext = await buildRagPrompt(docs)
      }
    } catch {
      // RAG optional in simulation if embeddings aren't configured
    }

    const fieldNodes = nodes.filter(n => n.type === 'FIELD' && n.data.fieldName)
    const activeNode = currId ? nodeMap.get(currId) : undefined

    if (ai) {
      try {
        const fieldSchemaProps: Record<string, any> = {}
        for (const fn of fieldNodes) {
          const fName = String(fn.data.fieldName!)
          fieldSchemaProps[fName] = {
            type: Type.STRING,
            description: `${fn.data.description || fName}. ${
              fn.data.fieldType === 'date' || fName === 'tarih'
                ? `Bugün ${getTodayIso()}. YYYY-MM-DD formatına çevir.`
                : fn.data.fieldType === 'time' || fName === 'saat'
                ? 'HH:MM (24 saat) formatına çevir.'
                : ''
            }`,
          }
        }

        const intentCondNodes = nodes.filter(
          n => n.type === 'CONDITION' && (n.data.conditionField === 'user_intent' || n.data.operator === 'intent')
        )

        const extractionResult = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Bugünün tarihi: ${getTodayIso()}.
Şu anki aktif adım: ${activeNode ? JSON.stringify({ id: activeNode.id, type: activeNode.type, data: activeNode.data }) : 'Yok'}.
Mevcut toplanmış alanlar: ${JSON.stringify(fields)}.
${intentCondNodes.length > 0 ? `Kontrol edilecek özel niyet koşulu: "${intentCondNodes.map(n => n.data.conditionValue).join(' | ')}"` : ''}
Kullanıcının son mesajı: "${userMessage}"

Görev:
1. Yalnızca kullanıcının son mesajında AÇIKÇA söylediği alanları (fields) JSON içinde doldur; kullanıcının henüz söylemediği alanları KESİNLİKLE tahmin etme veya doldurma. Eğer şu anki aktif adım bir FIELD ise ve kullanıcı kısa bir yanıt verdiyse (ör. sadece isim, sadece saat, sadece puan), o yanıtı yalnızca aktif adımın fieldName alanına ata.
2. Eğer özel niyet koşulu varsa, kullanıcının mesajının bu niyeti taşıyıp taşımadığını intentMatched (true/false) olarak belirt.`,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                fields: {
                  type: Type.OBJECT,
                  properties: fieldSchemaProps,
                },
                intentMatched: {
                  type: Type.BOOLEAN,
                  description: 'Kullanıcı mesajı özel niyet koşulunu karşılıyor mu?',
                },
              },
            },
          },
        })

        const extractionMeta = (extractionResult as any).usageMetadata
        if (extractionMeta) {
          void recordAiTokenUsage({
            clinicId,
            source: 'simulator',
            promptTokens: Number(extractionMeta.promptTokenCount ?? 0),
            responseTokens: Number(extractionMeta.candidatesTokenCount ?? 0),
            totalTokens: Number(extractionMeta.totalTokenCount ?? 0),
            callCount: 1,
          })
        }
        const parsed = JSON.parse(extractionResult.text || '{}')
        if (parsed.fields && typeof parsed.fields === 'object') {
          for (const [k, v] of Object.entries(parsed.fields)) {
            if (typeof v === 'string' && v.trim()) {
              fields[k] = v.trim()
              extractedFields[k] = v.trim()
            }
          }
        }
        if (typeof parsed.intentMatched === 'boolean') {
          aiIntentMatched = parsed.intentMatched
          fields.user_intent = String(parsed.intentMatched)
        }
      } catch (err) {
        console.warn('[FlowSimulator] AI alan çıkarımı yedek moda geçti:', err)
      }
    }

    // Fallback direct assignment if active node is FIELD and AI didn't extract it
    if (activeNode?.type === 'FIELD' && activeNode.data.fieldName) {
      const fName = String(activeNode.data.fieldName)
      if (!extractedFields[fName] && !fields[fName]) {
        fields[fName] = userMessage
        extractedFields[fName] = userMessage
      }
    }
  }

  // 3. If manualBranch was clicked on a CONDITION node
  if (req.manualBranch && currId) {
    const condNode = nodeMap.get(currId)
    if (condNode?.type === 'CONDITION') {
      const outEdge = edges.find(e => e.source === condNode.id && e.sourceHandle === req.manualBranch)
      logs.push({
        role: 'system',
        text: `🔀 Koşul Dalı Seçildi: ${req.manualBranch === 'true' ? '✅ EVET (Yeşil Yol)' : '❌ HAYIR (Kırmızı Yol)'}`,
      })
      if (outEdge) {
        if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
        currId = outEdge.target
      }
    }
  }

  // 4. Advance through the flow graph
  let completed = false
  let stoppedNode: FlowNode | undefined = undefined
  const triggeredActions: FlowNode[] = []
  const prevVisitedSet = new Set(req.visitedNodeIds || [])
  const greetingText = await resolveGreeting(direction)

  let startedFromStartNode = false

  for (let guard = 0; guard < nodes.length + 4; guard++) {
    if (!currId) break
    const node = nodeMap.get(currId)
    if (!node) break
    if (!visitedNodeIds.includes(node.id)) visitedNodeIds.push(node.id)

    if (node.type === 'START') {
      startedFromStartNode = true
      const outEdge = edges.find(e => e.source === node.id)
      if (!outEdge) {
        stoppedNode = node
        logs.push({ role: 'system', text: '⚠️ Karşılama adımından sonra bağlı bir adım bulunmuyor.' })
        break
      }
      if (!userMessage && !req.manualBranch && !req.skipReply) {
        stoppedNode = node
        logs.push({
          role: 'system',
          text: '⏳ Karşılama mesajı söylendi — müşterinin konuşması bekleniyor (müşteri yanıt verdikten sonra sıradaki adıma geçilir).',
        })
        break
      }
      if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
      currId = outEdge.target
      continue
    }

    if (node.type === 'FIELD') {
      if (!isFieldSatisfied(node, fields)) {
        stoppedNode = node
        break
      }
      const outEdge = edges.find(e => e.source === node.id)
      if (!outEdge) {
        stoppedNode = node
        break
      }
      if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
      currId = outEdge.target
      continue
    }

    if (node.type === 'CONDITION') {
      const condField = String(node.data.conditionField || '')
      // If user_intent and no userMessage yet, pause at the condition node
      if ((condField === 'user_intent' || node.data.operator === 'intent') && !userMessage && !req.manualBranch) {
        stoppedNode = node
        logs.push({
          role: 'system',
          text: `🔀 Özel Niyet Koşulu: "${node.data.conditionValue || ''}" — Bir hasta mesajı yazarak yapay zekanın hangi dala yönlendirdiğini test edin.`,
        })
        break
      }

      const matched = evaluateDeterministicCondition(node, fields, aiIntentMatched, direction)
      const branch = matched ? 'true' : 'false'
      logs.push({
        role: 'system',
        text: `🔀 Koşul Değerlendirildi (${condField || 'koşul'}): ${matched ? '✅ EVET (Yeşil Yol)' : '❌ HAYIR (Kırmızı Yol)'}`,
      })
      const outEdge = edges.find(e => e.source === node.id && e.sourceHandle === branch)
      if (!outEdge) {
        stoppedNode = node
        logs.push({ role: 'system', text: `⚠️ Koşulun "${matched ? 'Evet' : 'Hayır'}" çıkışı hiçbir adıma bağlı değil!` })
        break
      }
      if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
      currId = outEdge.target
      continue
    }

    if (node.type === 'ACTION') {
      const act = String(node.data.action || '')
      if (act === 'set_variable' && node.data.variableName) {
        const varVal = renderFlowTemplate(String(node.data.variableValue ?? ''), fields)
        fields[node.data.variableName] = varVal
        extractedFields[node.data.variableName] = varVal
      }
      if (act === 'switch_prompt') {
        const instr = renderFlowTemplate(String(node.data.promptInstruction || node.data.message || ''), fields)
        if (instr) fields.activePromptOverride = instr
      }
      if ((act === 'wait_reprompt' || act === 'wait') && !prevVisitedSet.has(node.id)) {
        stoppedNode = node
        break
      }
      if ((act === 'transfer_call' || act === 'transfer') && node.data.requireConfirmation !== false && String(node.data.confirmationQuestion || '').trim()) {
        const confirmKey = `_transferConfirm_${node.id}`
        if (fields[confirmKey] !== 'confirmed' && fields[confirmKey] !== 'declined') {
          if (fields[confirmKey] === 'asked' && userMessage) {
            const lowerMsg = userMessage.toLocaleLowerCase('tr-TR')
            const isNegative = /\b(hayır|hayir|değil|degil|istemiyorum|vazgeçtim|vazgectim|gerek yok|aktarma)\b/i.test(lowerMsg)
            if (isNegative) {
              fields[confirmKey] = 'declined'
              logs.push({
                role: 'system',
                text: `❌ Kullanıcı aktarımı reddetti — aktarım iptal edildi.`,
              })
              const outEdge = edges.find(e => e.source === node.id)
              if (!outEdge) {
                stoppedNode = node
                completed = true
                break
              }
              if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
              currId = outEdge.target
              continue
            }
            fields[confirmKey] = 'confirmed'
            logs.push({
              role: 'system',
              text: `✅ Kullanıcı aktarımı onayladı.`,
            })
          } else {
            fields[confirmKey] = 'asked'
            stoppedNode = node
            logs.push({
              role: 'system',
              text: `❓ Aktarım Onay Sorusu Soruluyor: "${String(node.data.confirmationQuestion).trim()}" — Kullanıcının onayı bekleniyor.`,
            })
            break
          }
        }
      }
      triggeredActions.push(node)
      const actTitle = ACTION_LABELS[act] || node.data.label || act
      logs.push({
        role: 'action',
        text: `⚡ İŞLEM TETİKLENDİ: ${actTitle}\nToplanan Veriler: ${JSON.stringify(fields)}`,
      })
      const outEdge = edges.find(e => e.source === node.id)
      if (!outEdge) {
        stoppedNode = node
        completed = true
        break
      }
      if (!visitedEdgeIds.includes(outEdge.id)) visitedEdgeIds.push(outEdge.id)
      currId = outEdge.target
      continue
    }

    if (node.type === 'END') {
      stoppedNode = node
      completed = true
      break
    }
  }

  // 5. Generate Natural AI Response for the current state
  const flowPrompt = flowToPromptText({
    id: 'sim',
    name: 'simulation',
    nodes,
    edges,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  })

  const buildActionOutcomeText = (actionNode: FlowNode): string => {
    const act = String(actionNode.data.action || '')
    const target = String(actionNode.data.transferNumber || 'Resepsiyon')
    const msg = renderFlowTemplate(String(actionNode.data.message || ''), fields)
    if (act === 'transfer_call' || act === 'transfer') {
      return `Aramanızı ${target} yetkili hattına aktarıyorum, lütfen hattan ayrılmayın.`
    }
    if (act === 'save_appointment_pending' || act === 'randevuOlustur') {
      return `Randevu talebiniz (${fields.tarih || 'belirtilen tarih'} ${fields.saat || ''}) başarıyla oluşturuldu.`
    }
    if (act === 'save_patient_note' || act === 'notBirak') {
      return 'Notunuz kaydedildi ve klinik bankosuna iletildi.'
    }
    if (act === 'send_wa_location') {
      return 'Klinik konumumuz WhatsApp üzerinden telefonunuza gönderildi.'
    }
    if (act === 'send_wa_message' || act === 'send_sms') {
      return msg || 'Bilgilendirme mesajınız gönderildi.'
    }
    if (act === 'end_call') {
      return msg || 'Görüşmemizi sonlandırıyorum, sağlıklı günler dileriz.'
    }
    return `${ACTION_LABELS[act] || act} işlemi tamamlandı.`
  }

  const triggeredActionSummary = triggeredActions.map(buildActionOutcomeText).filter(Boolean).join(' ')

  let stepInstruction = ''
  if (stoppedNode?.type === 'START') {
    stepInstruction = `Yalnızca şu karşılama mesajını söyle: "${greetingText}". Karşılamayı söyledikten sonra DUR ve müşterinin konuşmasını bekle; başka soru sorma.`
  } else if (stoppedNode?.type === 'FIELD') {
    stepInstruction = `${triggeredActionSummary ? `Önce şu işlemin gerçekleştiğini belirt: "${triggeredActionSummary}". Ardından ` : ''}Şu anki akış adımında hastadan YALNIZCA "${stoppedNode.data.fieldName}" bilgisini istemelisin. Sorulacak soru: "${stoppedNode.data.description || stoppedNode.data.fieldName}". Bu tek soruyu sorduktan sonra DUR ve müşterinin konuşmasını/cevabını bekle; başka adımın sorusunu peşine ekleme.`
  } else if (stoppedNode?.type === 'CONDITION') {
    stepInstruction = `Şu anki adımda hastanın niyetini ("${stoppedNode.data.conditionValue}") anlamak için nasıl yardımcı olabileceğini sor ve müşterinin konuşmasını bekle.`
  } else if (stoppedNode?.type === 'ACTION' && (stoppedNode.data.action === 'wait_reprompt' || stoppedNode.data.action === 'wait')) {
    const waitMsg = renderFlowTemplate(String(stoppedNode.data.message || 'Sizi dinliyorum, nasıl yardımcı olabilirim?'), fields)
    stepInstruction = `Hastaya "${waitMsg}" cümlesini söyle ve konuşmasını bekle.`
  } else if (stoppedNode?.type === 'ACTION' && (stoppedNode.data.action === 'transfer_call' || stoppedNode.data.action === 'transfer') && fields[`_transferConfirm_${stoppedNode.id}`] === 'asked') {
    const confirmQ = renderFlowTemplate(String(stoppedNode.data.confirmationQuestion || 'Sizi yetkili birime aktarmamı ister misiniz?'), fields)
    stepInstruction = `Hastaya yalnızca şu aktarım onay sorusunu sor: "${confirmQ}" ve cevabını bekle.`
  } else if (stoppedNode?.type === 'END' || completed) {
    const closeMsg = stoppedNode?.data?.message || 'Görüşmeyi nazikçe tamamla ve sağlıklı günler dile.'
    stepInstruction = `${triggeredActionSummary ? `Gerçekleşen işlem bilgisini hastaya söyle: "${triggeredActionSummary}". ` : ''}Akış tamamlandı. Kapanış mesajı: "${closeMsg}".`
  }

  if (req.skipReply) {
    return {
      currentNodeId: stoppedNode?.id ?? currId,
      visitedNodeIds,
      visitedEdgeIds,
      fields,
      extractedFields,
      logs,
      completed,
      aiPowered: Boolean(ai),
      usedKnowledgeTitles,
      nextInstruction: stepInstruction || 'Akışta sıradaki adıma göre hastayla doğal biçimde devam et.',
    }
  }

  if (ai) {
    try {
      const historyContents = (req.history || []).slice(-10).map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      }))

      const [clinicInstructions, rawSimRules] = await Promise.all([
        buildClinicInstructions(clinicId, direction, greetingText),
        getPromptTemplate('prompt.simulator_system_rules', clinicId).catch(() => ''),
      ])
      const simSystemRules = renderPromptTemplate(rawSimRules.trim() || DEFAULT_SIMULATOR_SYSTEM_RULES, {}).trim() || DEFAULT_SIMULATOR_SYSTEM_RULES
      const sysInstruction = `${simSystemRules}
Bugünün tarihi: ${getTodayIso()}.
${stoppedNode?.type === 'START' ? `Görüşme yeni başladı. Yalnızca şu karşılama mesajını söyle: "${greetingText}" ve müşterinin konuşmasını bekle; ek soru sorma.` : ''}
${ragContext ? `\nKLİNİK BİLGİ BANKASI (Eğer kullanıcı bir soru sorduysa bu bilgilerle yanıtla):\n${ragContext}\n` : ''}
${clinicInstructions ? `\nKLİNİK TALİMATLARI:\n${clinicInstructions}\n` : ''}
${flowPrompt}

MEVCUT TOPLANAN BİLGİLER: ${JSON.stringify(fields)}
SIRADAKİ ZORUNLU GÖREVİN: ${stepInstruction}`

      const promptTurn = userMessage
        ? `Hasta şöyle dedi: "${userMessage}". Eğer hastanın mesajında bir soru varsa önce Bilgi Bankası ile kısaca yanıtla, ardından sıradaki görevi (${stepInstruction}) doğal bir cümleyle uygula.`
        : `Görüşmeyi başlat ve sıradaki görevi (${stepInstruction}) uygula.`

      const gen = await ai.models.generateContent({
        model: modelName,
        contents: [...historyContents, { role: 'user', parts: [{ text: promptTurn }] }],
        config: {
          systemInstruction: wrapWithTurkishLanguageLock(sysInstruction),
          temperature: 0.35,
        },
      })

      const genMeta = (gen as any).usageMetadata
      if (genMeta) {
        void recordAiTokenUsage({
          clinicId,
          source: 'simulator',
          promptTokens: Number(genMeta.promptTokenCount ?? 0),
          responseTokens: Number(genMeta.candidatesTokenCount ?? 0),
          totalTokens: Number(genMeta.totalTokenCount ?? 0),
        })
      }
      const aiText = (gen.text || '').trim()
      if (aiText) {
        logs.push({ role: 'ai', text: `🤖 AI Asistan: ${aiText}` })
        return {
          currentNodeId: stoppedNode?.id ?? currId,
          visitedNodeIds,
          visitedEdgeIds,
          fields,
          extractedFields,
          logs,
          completed,
          aiPowered: true,
          usedKnowledgeTitles,
        }
      }
    } catch (err) {
      console.warn('[FlowSimulator] AI yanıt üretimi yedek moda geçti:', err)
    }
  }

  // Fallback deterministic message if GEMINI_API_KEY is not active
  if (startedFromStartNode && !userMessage) {
    logs.push({ role: 'ai', text: `▶ Karşılama: "${greetingText}"` })
  }
  if (triggeredActionSummary) {
    logs.push({
      role: 'ai',
      text: `🤖 AI Asistan: ${triggeredActionSummary}`,
    })
  }
  if (stoppedNode?.type === 'FIELD') {
    logs.push({
      role: 'ai',
      text: `🤖 AI Sorusu (${stoppedNode.data.fieldName}): "${stoppedNode.data.description || `${stoppedNode.data.fieldName} bilgisini paylaşır mısınız?`}"`,
    })
  } else if (stoppedNode?.type === 'ACTION' && (stoppedNode.data.action === 'wait_reprompt' || stoppedNode.data.action === 'wait')) {
    const waitMsg = renderFlowTemplate(String(stoppedNode.data.message || 'Sizi dinliyorum, nasıl yardımcı olabilirim?'), fields)
    logs.push({
      role: 'ai',
      text: `🤖 AI Asistan: "${waitMsg}"`,
    })
  } else if (stoppedNode?.type === 'ACTION' && (stoppedNode.data.action === 'transfer_call' || stoppedNode.data.action === 'transfer') && fields[`_transferConfirm_${stoppedNode.id}`] === 'asked') {
    const confirmQ = renderFlowTemplate(String(stoppedNode.data.confirmationQuestion || 'Sizi yetkili birime aktarmamı ister misiniz?'), fields)
    logs.push({
      role: 'ai',
      text: `🤖 AI Asistan: "${confirmQ}"`,
    })
  } else if (stoppedNode?.type === 'END') {
    logs.push({
      role: 'ai',
      text: `⏹️ [${stoppedNode.data.label || 'Görüşme Tamamlandı'}]: ${stoppedNode.data.message || 'Görüşme nazikçe sonlandırıldı.'}`,
    })
  }

  return {
    currentNodeId: stoppedNode?.id ?? currId,
    visitedNodeIds,
    visitedEdgeIds,
    fields,
    extractedFields,
    logs,
    completed,
    aiPowered: false,
    usedKnowledgeTitles,
  }
}
