import { and, desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { conversationFlows } from '../schema'
import { requireClinicId } from '../../tenancy/context'
import { getTransferConfirmationQuestion } from '../../services/transfer-triggers'
export { validateConversationFlow, type FlowValidationIssue, EXECUTABLE_ACTIONS, FLOW_EVENT_TRIGGERS } from '../../services/flow-validation'

export type FlowConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'isEmpty'
  | 'notEmpty'
  | 'intent'

export interface FlowConditionRule {
  field: string
  operator: FlowConditionOperator
  value?: string
  valueTo?: string
}

export interface FlowConditionGroup {
  logic: 'AND' | 'OR'
  rules: Array<FlowConditionRule | FlowConditionGroup>
}

export type FlowEventTrigger =
  | 'on_silence'
  | 'on_no_match'
  | 'on_transfer_fail'
  | 'on_call_end'
  | 'on_whatsapp_message'

export interface FlowNode {
  id: string
  type: 'START' | 'FIELD' | 'CONDITION' | 'ACTION' | 'END'
  position: { x: number; y: number }
  data: {
    label?: string
    // FIELD node
    fieldName?: string
    description?: string
    required?: boolean
    fieldType?: 'text' | 'date' | 'time' | 'enum' | 'user'
    enumValues?: string[]
    // CONDITION node (legacy + compound)
    conditionField?: string
    operator?: FlowConditionOperator
    conditionValue?: string
    conditionValueTo?: string
    conditionLogic?: 'AND' | 'OR'
    rules?: FlowConditionRule[]
    conditionGroup?: FlowConditionGroup
    // ACTION node
    action?: string
    message?: string
    variableName?: string
    variableValue?: string
    waitSeconds?: number
    promptInstruction?: string
    transferNumber?: string
    triggerKeywords?: string
    eventTrigger?: FlowEventTrigger
    requireConfirmation?: boolean
    confirmationQuestion?: string
  }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  label?: string
}

export interface ConversationFlow {
  id: string
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Legacy Flow Builder releases used display-oriented field names. The runtime
 * and appointment service use these stable canonical names exclusively.
 */
const LEGACY_FIELD_ALIASES: Record<string, string> = {
  ad_soyad: 'musteri_adi',
  hasta_adi: 'musteri_adi',
  hastaadisoyadi: 'musteri_adi',
  hastaAdiSoyadi: 'musteri_adi',
  hastatelefonu: 'telefon',
  hastaTelefonu: 'telefon',
  hastasikayeti: 'sikayet',
  hastaSikayeti: 'sikayet',
  randevutarihi: 'tarih',
  randevuTarihi: 'tarih',
  randevusaati: 'saat',
  randevuSaati: 'saat',
}

const LEGACY_CONDITION_ALIASES: Record<string, string> = {
  is_registered: 'kayitli',
}

export function injectFlowSystemVariables(
  fields: Record<string, unknown> = {},
  ctx?: {
    direction?: string
    channel?: string
    silenceCount?: number
    durationSec?: number
    now?: Date
  },
): Record<string, unknown> {
  const now = ctx?.now ?? new Date()
  const istanbulParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)
  const hourStr = istanbulParts.find(p => p.type === 'hour')?.value ?? String(now.getHours())
  const hour = Number(hourStr) % 24
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const weekdayShort = istanbulParts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const weekday = weekdayMap[weekdayShort] ?? 1
  const isOpen = weekday >= 1 && weekday <= 6 && hour >= 9 && hour < 19

  const kayitliVal = fields['kayitli'] ?? fields['caller.isKnownPatient']
  const isKnown =
    kayitliVal !== undefined
      ? ['true', 'evet', '1'].includes(String(kayitliVal).toLocaleLowerCase('tr-TR'))
      : false

  return {
    ...fields,
    'caller.isKnownPatient': fields['caller.isKnownPatient'] ?? String(isKnown),
    'caller.isVip': fields['caller.isVip'] ?? 'false',
    'caller.hasUpcomingAppointment': fields['caller.hasUpcomingAppointment'] ?? 'false',
    'call.direction': ctx?.direction ?? fields['call.direction'] ?? 'inbound',
    'call.channel': ctx?.channel ?? fields['call.channel'] ?? 'phone',
    'call.silenceCount': String(ctx?.silenceCount ?? fields['call.silenceCount'] ?? 0),
    'call.durationSec': String(ctx?.durationSec ?? fields['call.durationSec'] ?? 0),
    'time.hour': String(fields['time.hour'] ?? hour),
    'time.weekday': String(fields['time.weekday'] ?? weekday),
    'clinic.isOpen': String(fields['clinic.isOpen'] ?? isOpen),
  }
}

export function renderFlowTemplate(template: string, fields: Record<string, unknown>): string {
  if (!template) return ''
  return template.replace(/\{\{\s*(?:fields\.)?([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const val = fields[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

function isRuleGroup(item: FlowConditionRule | FlowConditionGroup): item is FlowConditionGroup {
  return 'logic' in item && Array.isArray((item as FlowConditionGroup).rules)
}

export function evaluateConditionRule(
  rule: FlowConditionRule,
  fields: Record<string, unknown>,
  intentMatchedByAi?: boolean,
): boolean {
  const field = String(rule.field || '').trim()
  const op = rule.operator || 'equals'
  const rawVal = fields[field] ?? (field === 'caller.isKnownPatient' ? fields['kayitli'] : field === 'kayitli' ? fields['caller.isKnownPatient'] : undefined)
  const actual = String(rawVal ?? '').trim()
  const expected = String(rule.value ?? '').trim()
  const expectedTo = String(rule.valueTo ?? '').trim()

  if (field === 'user_intent' || op === 'intent') {
    if (typeof intentMatchedByAi === 'boolean') return intentMatchedByAi
    if (!actual) return false
    const actualLow = actual.toLocaleLowerCase('tr-TR')
    if (['true', 'evet', '1', 'var'].includes(actualLow)) return true
    if (['false', 'hayır', 'hayir', '0', 'yok'].includes(actualLow)) return false
    const expectedWords = expected.toLocaleLowerCase('tr-TR').split(/[\s,;:.!?]+/).filter(w => w.length >= 3)
    return expectedWords.some(w => actualLow.includes(w)) || actualLow.includes(expected.toLocaleLowerCase('tr-TR'))
  }

  const actualLow = actual.toLocaleLowerCase('tr-TR')
  const expectedLow = expected.toLocaleLowerCase('tr-TR')

  switch (op) {
    case 'isEmpty':
      return actual.length === 0
    case 'notEmpty':
      return actual.length > 0
    case 'contains':
      return actualLow.includes(expectedLow)
    case 'notContains':
      return !actualLow.includes(expectedLow)
    case 'startsWith':
      return actualLow.startsWith(expectedLow)
    case 'regex': {
      if (!expected) return false
      try {
        return new RegExp(expected, 'i').test(actual)
      } catch {
        return false
      }
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const aNum = Number(actual.replace(',', '.'))
      const eNum = Number(expected.replace(',', '.'))
      if (!Number.isFinite(aNum) || !Number.isFinite(eNum)) return false
      if (op === 'gt') return aNum > eNum
      if (op === 'gte') return aNum >= eNum
      if (op === 'lt') return aNum < eNum
      return aNum <= eNum
    }
    case 'between': {
      const aNum = Number(actual.replace(',', '.'))
      const parts = expectedTo ? [expected, expectedTo] : expected.split(/\s*[,;-]\s*/)
      const low = Number((parts[0] ?? '').replace(',', '.'))
      const high = Number((parts[1] ?? '').replace(',', '.'))
      if (!Number.isFinite(aNum) || !Number.isFinite(low) || !Number.isFinite(high)) return false
      return aNum >= Math.min(low, high) && aNum <= Math.max(low, high)
    }
    case 'in': {
      const items = expectedLow.split(/[,;|]+/).map(s => s.trim()).filter(Boolean)
      return items.includes(actualLow)
    }
    case 'notEquals': {
      if (expectedLow === 'true') return !['true', 'evet', '1'].includes(actualLow)
      if (expectedLow === 'false') return !['false', 'hayır', 'hayir', '0'].includes(actualLow)
      return actualLow !== expectedLow
    }
    case 'equals':
    default: {
      if (expectedLow === 'true' && (actualLow === 'true' || actualLow === 'evet' || actualLow === '1')) return true
      if (expectedLow === 'false' && (actualLow === 'false' || actualLow === 'hayır' || actualLow === 'hayir' || actualLow === '0')) return true
      return actualLow === expectedLow
    }
  }
}

export function evaluateConditionGroup(
  group: FlowConditionGroup,
  fields: Record<string, unknown>,
  intentMatchedByAi?: boolean,
): boolean {
  if (!group.rules || group.rules.length === 0) return false
  const evalItem = (item: FlowConditionRule | FlowConditionGroup): boolean =>
    isRuleGroup(item)
      ? evaluateConditionGroup(item, fields, intentMatchedByAi)
      : evaluateConditionRule(item, fields, intentMatchedByAi)
  return group.logic === 'OR' ? group.rules.some(evalItem) : group.rules.every(evalItem)
}

export function evaluateConditionNode(
  node: FlowNode,
  rawFields: Record<string, unknown>,
  intentMatchedByAi?: boolean,
  ctx?: { direction?: string; channel?: string; silenceCount?: number; durationSec?: number },
): boolean {
  const fields = injectFlowSystemVariables(rawFields, ctx)
  if (node.data.conditionGroup && Array.isArray(node.data.conditionGroup.rules) && node.data.conditionGroup.rules.length > 0) {
    return evaluateConditionGroup(node.data.conditionGroup, fields, intentMatchedByAi)
  }
  if (Array.isArray(node.data.rules) && node.data.rules.length > 0) {
    return evaluateConditionGroup(
      { logic: node.data.conditionLogic === 'OR' ? 'OR' : 'AND', rules: node.data.rules },
      fields,
      intentMatchedByAi,
    )
  }
  return evaluateConditionRule(
    {
      field: String(node.data.conditionField || ''),
      operator: node.data.operator || 'equals',
      value: node.data.conditionValue,
      valueTo: node.data.conditionValueTo,
    },
    fields,
    intentMatchedByAi,
  )
}

function normalizeFlowNodes(nodes: FlowNode[]): { nodes: FlowNode[]; changed: boolean } {
  let changed = false
  const normalized = nodes.map(node => {
    const data = { ...node.data }
    if (node.type === 'FIELD' && data.fieldName) {
      const canonical = LEGACY_FIELD_ALIASES[data.fieldName] ?? LEGACY_FIELD_ALIASES[data.fieldName.toLowerCase()]
      if (canonical && canonical !== data.fieldName) {
        data.fieldName = canonical
        changed = true
      }
    }
    if (node.type === 'CONDITION' && data.conditionField) {
      const canonical = LEGACY_CONDITION_ALIASES[data.conditionField] ?? LEGACY_CONDITION_ALIASES[data.conditionField.toLowerCase()]
      if (canonical && canonical !== data.conditionField) {
        data.conditionField = canonical
        changed = true
      }
    }
    return changed || data !== node.data ? { ...node, data } : node
  })
  return { nodes: normalized, changed }
}

function getTransferPromptConfig(data: Record<string, unknown>) {
  const target = String(data.transferNumber || '')
  const keywords = String(data.triggerKeywords || '')
  const keywordList = keywords.split(/[,;|\n]+/).map(value => value.trim()).filter(Boolean)
  const requiresConfirmation = data.requireConfirmation !== false
  const confirmationQuestion = typeof data.confirmationQuestion === 'string'
    ? data.confirmationQuestion.trim()
    : ''

  const questionInstruction = confirmationQuestion
    ? `yalnızca ${JSON.stringify(confirmationQuestion)} diye sor`
    : keywordList.length > 0
      ? `eşleşen ifadeye ait şu soruyu sor: ${keywordList.map(keyword =>
          `${JSON.stringify(keyword)} için ${JSON.stringify(getTransferConfirmationQuestion({ keyword, target }))}`,
        ).join('; ')}`
      : `yalnızca ${JSON.stringify(getTransferConfirmationQuestion({ keyword: '', target }))} diye sor`

  return { target, keywords, requiresConfirmation, questionInstruction }
}

function toIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

export async function getActiveFlow(direction: string = 'inbound', explicitClinicId?: string): Promise<ConversationFlow | null> {
  const clinicId = explicitClinicId ?? requireClinicId()
  const rows = await db
    .select()
    .from(conversationFlows)
    .where(and(eq(conversationFlows.clinicId, clinicId), eq(conversationFlows.isActive, true), eq(conversationFlows.direction, direction)))
    .orderBy(desc(conversationFlows.updatedAt))
    .limit(1)
  if (rows.length === 0) return null
  const r = rows[0]
  const normalized = normalizeFlowNodes(r.nodes as FlowNode[])
  if (normalized.changed) {
    await db.update(conversationFlows)
      .set({ nodes: normalized.nodes, updatedAt: new Date() })
      .where(eq(conversationFlows.id, r.id))
  }
  return {
    id: r.id,
    name: r.name,
    nodes: normalized.nodes,
    edges: r.edges as FlowEdge[],
    isActive: r.isActive,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

export async function saveFlow(nodes: FlowNode[], edges: FlowEdge[], direction: string = 'inbound'): Promise<ConversationFlow> {
  const clinicId = requireClinicId()
  const normalized = normalizeFlowNodes(nodes)
  nodes = normalized.nodes
  const existing = await getActiveFlow(direction)
  await db
    .update(conversationFlows)
    .set({ isActive: false })
    .where(and(
      eq(conversationFlows.clinicId, clinicId),
      eq(conversationFlows.direction, direction),
      eq(conversationFlows.isActive, true),
    ))
  if (existing) {
    const [updated] = await db
      .update(conversationFlows)
      .set({ nodes, edges, isActive: true, updatedAt: new Date() })
      .where(eq(conversationFlows.id, existing.id))
      .returning()
    return {
      id: updated.id,
      name: updated.name,
      nodes: updated.nodes as FlowNode[],
      edges: updated.edges as FlowEdge[],
      isActive: updated.isActive,
      createdAt: toIso(updated.createdAt),
      updatedAt: toIso(updated.updatedAt),
    }
  }
  const [inserted] = await db
    .insert(conversationFlows)
    .values({ clinicId, nodes, edges, direction })
    .returning()
  return {
    id: inserted.id,
    name: inserted.name,
    nodes: inserted.nodes as FlowNode[],
    edges: inserted.edges as FlowEdge[],
    isActive: inserted.isActive,
    createdAt: toIso(inserted.createdAt),
    updatedAt: toIso(inserted.updatedAt),
  }
}

export function getFieldNodes(flow: ConversationFlow): FlowNode[] {
  return flow.nodes.filter(n => n.type === 'FIELD' && n.data.fieldName)
}

export function isMinimalGreetingEndFlow(flow: ConversationFlow): boolean {
  const start = flow.nodes.find(n => n.type === 'START')
  if (!start) return false
  const nodeMap = new Map(flow.nodes.map(n => [n.id, n]))
  const edgeMap = new Map<string, FlowEdge[]>()
  for (const edge of flow.edges) {
    const list = edgeMap.get(edge.source) || []
    list.push(edge)
    edgeMap.set(edge.source, list)
  }
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    for (const edge of edgeMap.get(id) || []) visit(edge.target)
  }
  visit(start.id)
  const reachable = [...visited].map(id => nodeMap.get(id)).filter(Boolean) as FlowNode[]
  return reachable.length > 0 && reachable.every(n => n.type === 'START' || n.type === 'END')
}

export function flowToToolFields(flow: ConversationFlow): {
  properties: Record<string, { type: string; description: string; enum?: string[] }>
  required: string[]
} {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {}
  const requiredSet = new Set<string>()
  for (const node of getFieldNodes(flow)) {
    const originalName = node.data.fieldName!
    const safeName = originalName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()

    if (properties[safeName]) continue
    const prop: { type: string; description: string; enum?: string[] } = {
      type: 'STRING',
      description: node.data.description ? `${originalName}: ${node.data.description}` : originalName,
    }
    if (node.data.fieldType === 'enum' && node.data.enumValues?.length) {
      prop.enum = node.data.enumValues
    }
    properties[safeName] = prop
    if (node.data.required) requiredSet.add(safeName)
  }
  return { properties, required: [...requiredSet] }
}

const OPERATOR_LABELS: Record<string, string> = {
  equals: '==',
  notEquals: '!=',
  contains: 'içeriyorsa',
  notContains: 'içermiyorsa',
  startsWith: 'ile başlıyorsa',
  regex: 'regex eşleşiyorsa',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  between: 'arasındaysa',
  in: 'listesindeyse',
  isEmpty: 'boşsa',
  notEmpty: 'boş değilse',
  intent: 'niyetini taşıyorsa',
}

function formatRuleText(r: FlowConditionRule): string {
  const opLabel = OPERATOR_LABELS[r.operator] || r.operator
  if (r.operator === 'isEmpty' || r.operator === 'notEmpty') return `"${r.field}" ${opLabel}`
  if (r.operator === 'between') return `"${r.field}" ${r.value || ''} ile ${r.valueTo || ''} ${opLabel}`
  return `"${r.field}" ${opLabel} "${r.value || ''}"`
}

export function flowToPromptText(flow: ConversationFlow): string {
  if (flow.nodes.length === 0) return ''

  const lines: string[] = ['KONUŞMA AKIŞI VE TALİMATLARI:']
  const nodeMap = new Map(flow.nodes.map(n => [n.id, n]))
  const edgeMap = new Map<string, FlowEdge[]>()
  for (const e of flow.edges) {
    const list = edgeMap.get(e.source) || []
    list.push(e)
    edgeMap.set(e.source, list)
  }

  const startNode = flow.nodes.find(n => n.type === 'START')
  if (!startNode) return ''

  let step = 1
  const visited = new Set<string>()

  function traverse(nodeId: string, indent: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return
    const prefix = '  '.repeat(indent)

    switch (node.type) {
      case 'START':
        lines.push(`${prefix}${step}. Karşılama mesajını söyleyerek söze başla.`)
        step++
        break
      case 'FIELD':
        lines.push(`${prefix}${step}. "${node.data.fieldName}" alanını sor${node.data.required ? ' (zorunlu)' : ''}: "${node.data.description}"`)
        step++
        break
      case 'CONDITION': {
        const field = node.data.conditionField
        const val = node.data.conditionValue || ''
        if (Array.isArray(node.data.rules) && node.data.rules.length > 0) {
          const joiner = node.data.conditionLogic === 'OR' ? ' VEYA ' : ' VE '
          lines.push(`${prefix}${step}. KOŞUL (${node.data.conditionLogic || 'AND'}): ${node.data.rules.map(formatRuleText).join(joiner)} ise:`)
        } else if (field === 'user_intent' || node.data.operator === 'intent') {
          lines.push(`${prefix}${step}. KOŞUL (KULLANICI NİYETİ): Kullanıcının ifadesi "${val}" niyetini taşıyorsa:`)
        } else if (field === 'kayitli' || field === 'caller.isKnownPatient') {
          const isRegisteredExpected = val.toLowerCase() !== 'false' && val.toLowerCase() !== 'hayır'
          lines.push(`${prefix}${step}. KOŞUL (HASTA KAYIT DURUMU): musteriSorgula sonucuna göre hasta sistemde ${isRegisteredExpected ? 'kayıtlı ise (kayitli=true)' : 'kayıtlı değilse (kayitli=false)'}:`)
        } else {
          const op = OPERATOR_LABELS[node.data.operator || 'equals'] || '=='
          lines.push(`${prefix}${step}. KOŞUL: "${field}" ${op} "${val}" ise:`)
        }
        step++
        const edges = edgeMap.get(nodeId) || []
        const trueEdge = edges.find(e => e.sourceHandle === 'true')
        const falseEdge = edges.find(e => e.sourceHandle === 'false')
        if (trueEdge) {
          lines.push(`${prefix}  - Evet:`)
          traverse(trueEdge.target, indent + 2)
        }
        if (falseEdge) {
          lines.push(`${prefix}  - Hayır:`)
          traverse(falseEdge.target, indent + 2)
        }
        return
      }
      case 'ACTION': {
        const actionData = node.data as Record<string, unknown>
        const act = actionData.action
        if (act === 'transfer_call') {
          const { target, keywords, requiresConfirmation, questionInstruction } = getTransferPromptConfig(actionData)
          if (requiresConfirmation) {
            lines.push(`${prefix}${step}. ARAMAYI ONAYLA VE AKTAR: Önce kullanıcıya ${questionInstruction}. Açık bir olumlu cevap gelmeden aramaAktar aracını çağırma veya aktardığını söyleme. Kullanıcı onaylarsa aramaAktar aracını çağır ve "hedef" parametresine "${target}" değerini yaz.${keywords ? ` Bu kural "${keywords}" tetikleyici ifadeleri için geçerlidir.` : ''}`)
          } else {
            lines.push(`${prefix}${step}. ARAMAYI AKTAR: ŞU AN aramaAktar aracını çağır ve "hedef" parametresine "${target}" değerini yaz.${keywords ? ` Müşteri "${keywords}" ifadelerinden birini söylerse de derhal aktar.` : ''}`)
          }
        } else if (act === 'send_wa_message') {
          const message = (node.data as Record<string, unknown>).message || ''
          lines.push(`${prefix}${step}. WHATSAPP YANITI: Kullanıcıya şu mesajı yanıt olarak yaz: ${JSON.stringify(message)}. Bu adımda randevu oluşturma.`)
        } else if (act === 'send_wa_location') {
          lines.push(`${prefix}${step}. ARAYANA WHATSAPP KONUMU GÖNDER: Kullanıcı konum, adres veya yol tarifi istediğinde whatsappKonumGonder aracını çağır. Araç başarılı olursa konumun WhatsApp'tan gönderildiğini söyle.`)
        } else if (act === 'save_patient_note' || act === 'notBirak') {
          lines.push(`${prefix}${step}. HASTADAN NOT AL: Karşı tarafın yanıtını / mesajını hastaNotKaydet aracını çağırarak kaydet.`)
        } else if (act === 'end_call') {
          const msg = (node.data as Record<string, unknown>).message || ''
          lines.push(`${prefix}${step}. BİLGİ VER VE BİTİR: ${msg ? `"${msg}" diyerek ` : ''}cagriySonlandir aracını çağır.`)
        } else if (act === 'set_variable') {
          lines.push(`${prefix}${step}. DEĞİŞKEN ATA: "${actionData.variableName || ''}" alanına "${actionData.variableValue || ''}" değerini ata ve devam et.`)
        } else if (act === 'send_sms') {
          lines.push(`${prefix}${step}. SMS GÖNDER: Hastaya "${actionData.message || ''}" içerikli bilgilendirme SMS'ini ilet.`)
        } else if (act === 'wait_reprompt' || act === 'wait') {
          lines.push(`${prefix}${step}. BEKLE / YENİDEN SOR: "${actionData.message || 'Sizi dinliyorum, nasıl yardımcı olabilirim?'}" cümlesiyle hastayı yönlendir.`)
        } else if (act === 'switch_prompt') {
          lines.push(`${prefix}${step}. MOD / TALİMAT DEĞİŞTİR: Bundan sonraki konuşmada şu talimata göre davran: "${actionData.promptInstruction || actionData.message || ''}".`)
        } else {
          lines.push(`${prefix}${step}. Randevu bilgilerini toplayıp randevuOlustur aracını çağır.`)
        }
        step++
        break
      }
      case 'END': {
        const endMsg = typeof node.data.message === 'string' ? node.data.message.trim() : ''
        lines.push(`${prefix}${step}. ${endMsg ? `"${endMsg}" diyerek görüşmeyi` : 'Görüşmeyi'} nazikçe tamamla ve veda et.`)
        step++
        return
      }
    }

    const edges = edgeMap.get(nodeId) || []
    for (const e of edges) {
      if (!visited.has(e.target)) {
        traverse(e.target, indent)
      }
    }
  }

  traverse(startNode.id, 0)

  // ── Global Tetikleyiciler & Olay Düğümleri ──
  const globalActions = flow.nodes.filter(n => n.type === 'ACTION' && ((n.data as any).triggerKeywords || (n.data as any).eventTrigger))
  if (globalActions.length > 0) {
    lines.push('\n⚡ GLOBAL TETİKLEYİCİLER (Görüşmenin HERHANGİ bir anında geçerlidir):')
    for (const node of globalActions) {
      const actionData = node.data as Record<string, unknown>
      const act = actionData.action
      const ev = actionData.eventTrigger as string | undefined

      if (ev === 'on_silence') {
        lines.push(`- [SESSİZLİK OLAYI] Müşteri sessiz kaldığında: ${actionData.message ? `"${actionData.message}" de` : 'nazikçe tekrar sor'}.`)
      } else if (ev === 'on_no_match') {
        lines.push(`- [ANLAŞILAMAMA OLAYI] Müşterinin cevabı anlaşılamadığında: ${actionData.message ? `"${actionData.message}" de` : 'kısaca tekrar etmesini rica et'}.`)
      } else if (ev === 'on_transfer_fail') {
        lines.push(`- [AKTARIM HATASI OLAYI] Aktarım yapılamazsa: ${actionData.message ? `"${actionData.message}" diyerek` : ''} hastaNotKaydet ile iletişim notu al.`)
      }

      if (act === 'transfer_call' && actionData.triggerKeywords) {
        const { target, keywords, requiresConfirmation, questionInstruction } = getTransferPromptConfig(actionData)
        if (requiresConfirmation) {
          lines.push(`- Eğer müşteri "${keywords}" ifadelerinden birini kullanır veya bu ifadelerden belirgin bir parça söylerse, akışı kes ve ${questionInstruction}. Açıkça olumlu cevap gelmeden aramaAktar aracını çağırma veya aktardığını söyleme. Onay gelince aramaAktar aracını çağır ve "hedef" parametresini "${target}" yap.`)
        } else {
          lines.push(`- Eğer müşteri "${keywords}" ifadelerinden birini kullanırsa, akışı derhal kesip aramaAktar aracını çağır ve "hedef" parametresini "${target}" yap.`)
        }
      } else if (act === 'send_wa_location' && actionData.triggerKeywords) {
        const keywords = String(actionData.triggerKeywords || '')
        lines.push(`- Eğer müşteri "${keywords}" ifadelerini kullanır veya konum/adres/yol tarifi isterse, akışı derhal kesip whatsappKonumGonder aracını çağır. Başarılı sonuçtan sonra konumu WhatsApp'tan gönderdiğini söyle.`)
      } else if (act === 'end_call' && actionData.triggerKeywords) {
        const keywords = String(actionData.triggerKeywords || '')
        const msg = (node.data as Record<string, unknown>).message || ''
        lines.push(`- Eğer müşteri "${keywords}" ifadelerini kullanırsa, akışı derhal kesip cagriySonlandir() aracını çağır. ${msg ? `Öncesinde "${msg}" de.` : ''}`)
      }
    }
  }

  const unvisitedRoots = flow.nodes.filter(n => !visited.has(n.id) && !flow.edges.some(e => e.target === n.id) && !(n.type === 'ACTION' && ((n.data as any).triggerKeywords || (n.data as any).eventTrigger)))
  for (const root of unvisitedRoots) {
    if (root.type !== 'END') {
      lines.push(`\nBAĞIMSIZ AKIŞ KURALI:`)
      traverse(root.id, 0)
    }
  }

  if (isMinimalGreetingEndFlow(flow)) {
    lines.push(`\nMİNİMAL AKIŞ KURALI:\nKarşılama mesajını yalnızca bir kez söyle. Sonra karşı tarafın konuşmasını bekle; kendiliğinden randevu, şikayet, tarih, saat veya başka soru sorma. Karşı taraf bir soru sorarsa yalnızca o soruya kısa cevap ver ve yeni konu başlatma. Akışta başka adım olmadığı için görüşmeyi kendi kendine uzatma.`)
  } else {
    const outgoing = edgeMap.get(startNode.id) || []
    if (outgoing.length === 0) {
      lines.push(`\nGENEL VE DOĞAL SOHBET TALİMATI:
Karşılama mesajını söyledikten sonra karşı tarafın (müşterinin/hastanın) söylediği her cümleye mutlaka doğal, samimi, ilgili ve mantıklı cevaplar ver. Sorularına cevap ver, sohbeti devam ettir ve asla sessiz kalma. Karşı taraf görüşmeyi bitirmek istediğinde vedalaş.`)
    } else {
      lines.push(`\nGENEL İLETİŞİM KURALI:
Akış adımlarını takip ederken karşı taraf farklı bir şey söyler veya soru sorarsa, önce samimi ve net bir şekilde cevabını ver, ardından akışa devam et. Asla cevapsız bırakma.`)
    }
  }

  return lines.join('\n')
}
