/**
 * Akış yol özeti motoru (saf, test edilebilir).
 *
 * Her adım (node) için TEK bir özet üretir:
 *   Ne yapar · Hangi durumda gelinir · Sonra nereye gider · Uyarı.
 * Tüm koşul kombinasyonları ayrı ayrı sayılmaz: başlangıçtan adıma giden yollar bulunur,
 * birbirini tamamlayan yollar sadeleştirilir ("A ve B" + "A ve B değil" → "A").
 * Yol sayısı 200 ile sınırlıdır; döngüler tek yolda bir adımı iki kez gezmez.
 */
import { ACTION_LABELS as GLOSSARY_ACTION_LABELS, FIELD_LABELS, LOGIC_LABELS, OPERATOR_LABELS } from './ui-glossary'

export const MAX_PATHS = 200
const MAX_SHOWN_PATHS = 5

export interface FlowNodeLike {
  id: string
  type?: string
  data?: Record<string, any>
}
export interface FlowEdgeLike {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
}

export interface NodeSummary {
  nodeId: string
  /** Ne yapar */
  does: string
  /** Hangi durumda gelinir (en fazla 5 satır) */
  when: string[]
  /** Sonra nereye gider */
  next: string[]
  /** Uyarılar */
  warnings: string[]
  reachable: boolean
  /** Yol sınırı aşıldı mı */
  truncated: boolean
}

// ── Etiketler ────────────────────────────────────────────────────────────────
const LOCAL_OPERATOR_LABELS: Record<string, string> = {
  ...OPERATOR_LABELS,
  contains: 'içeriyorsa',
  notContains: 'içermiyorsa',
  regex: 'desene uyuyorsa',
}

const LOCAL_ACTION_LABELS: Record<string, string> = {
  save_appointment_pending: 'Randevu talebi oluşturulur (onay bekler)',
  randevuOlustur: 'Randevu oluşturulur',
  save_patient_note: 'Hastadan not alınır ve bankoya iletilir',
  notBirak: 'Anket / hasta notu kaydedilir',
  end_call: 'Bilgi verilir ve görüşme bitirilir',
  transfer_call: 'Arama yetkiliye aktarılır',
  transfer: 'Arama canlı desteğe aktarılır',
  send_wa_location: 'WhatsApp’tan konum gönderilir',
  send_wa_message: 'WhatsApp mesajı gönderilir',
  save_record: 'Kayıt veritabanına eklenir',
  set_variable: GLOSSARY_ACTION_LABELS.set_variable,
  send_sms: GLOSSARY_ACTION_LABELS.send_sms,
  wait_reprompt: GLOSSARY_ACTION_LABELS.wait_reprompt,
  wait: GLOSSARY_ACTION_LABELS.wait_reprompt,
  switch_prompt: GLOSSARY_ACTION_LABELS.switch_prompt,
}

const EVENT_LABELS: Record<string, string> = {
  on_silence: 'Sessiz kalındığında',
  on_no_match: 'Cevap anlaşılamadığında',
  on_transfer_fail: 'Aktarım başarısız olduğunda',
  on_call_end: 'Görüşme kapandığında',
  on_whatsapp_message: 'WhatsApp mesajı geldiğinde',
}

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const BOOLEAN_FIELDS = new Set(['kayitli', 'caller.isKnownPatient', 'caller.isVip', 'caller.hasUpcomingAppointment', 'clinic.isOpen'])

/** Eski adlandırmayı yeni sözlük adına çevirir. */
function canonicalField(field: string): string {
  return field === 'kayitli' ? 'caller.isKnownPatient' : field
}

function fieldText(field: string, fieldNames: Record<string, string>): string {
  const key = canonicalField(field)
  if (Object.prototype.hasOwnProperty.call(FIELD_LABELS, key)) return (FIELD_LABELS as Record<string, string>)[key]
  if (fieldNames[field]) return fieldNames[field]
  return field || 'Bir bilgi'
}

function pad2(v: string): string {
  const n = Number(v)
  return Number.isFinite(n) && v.trim() !== '' ? String(Math.trunc(n)).padStart(2, '0') : v
}

function valueText(field: string, value: string | undefined): string {
  const raw = String(value ?? '').trim()
  const key = canonicalField(field)
  const low = raw.toLocaleLowerCase('tr-TR')
  if (BOOLEAN_FIELDS.has(field) || BOOLEAN_FIELDS.has(key) || low === 'true' || low === 'false') {
    if (low === 'true') return 'Evet'
    if (low === 'false') return 'Hayır'
  }
  if (key === 'time.hour') return pad2(raw)
  if (key === 'time.weekday') {
    const n = Number(raw)
    if (n >= 1 && n <= 7) return WEEKDAYS[n - 1]
  }
  if (key === 'call.direction') {
    if (low === 'inbound') return 'Gelen arama'
    if (low === 'outbound') return 'Giden arama'
  }
  return raw || '…'
}

export interface Rule {
  field: string
  operator: string
  value?: string
  valueTo?: string
}

const INVERSE: Record<string, string> = {
  equals: 'notEquals',
  notEquals: 'equals',
  contains: 'notContains',
  notContains: 'contains',
  isEmpty: 'notEmpty',
  notEmpty: 'isEmpty',
  gt: 'lte',
  lte: 'gt',
  gte: 'lt',
  lt: 'gte',
}

/** Bir kuralı Türkçe cümleye çevirir. `negate` true ise tersini anlatır. */
export function describeRule(rule: Rule, fieldNames: Record<string, string> = {}, negate = false): string {
  const field = rule.field
  if (rule.operator === 'intent' || field === 'user_intent') {
    const intent = String(rule.value || '').trim() || 'belirtilen niyet'
    return negate ? `“${intent}” niyeti algılanmazsa` : `“${intent}” niyeti algılanırsa`
  }
  let op = rule.operator
  let neg = negate
  const rawBool = String(rule.value ?? '').trim().toLocaleLowerCase('tr-TR')
  if ((op === 'equals' || op === 'notEquals') && (rawBool === 'true' || rawBool === 'false')) {
    // Evet/Hayır sorusunda tersi doğrudan karşıt cevaptır: "Kayıtlı hasta mı? Hayır".
    const matches = (op === 'equals') !== negate
    const answer = (rawBool === 'true') === matches ? 'Evet' : 'Hayır'
    return `${fieldText(field, fieldNames)} ${answer}`
  }
  if (neg && INVERSE[op]) {
    op = INVERSE[op]
    neg = false
  }
  const label = fieldText(field, fieldNames)
  const opText = LOCAL_OPERATOR_LABELS[op] || op
  let text: string
  if (op === 'isEmpty' || op === 'notEmpty') {
    text = `${label} ${opText}`
  } else if (op === 'between') {
    text = `${label} ${valueText(field, rule.value)}–${valueText(field, rule.valueTo)} ${opText}`
  } else if (op === 'in') {
    const items = String(rule.value || '').split(',').map(s => s.trim()).filter(Boolean).map(v => valueText(field, v))
    text = `${label} ${items.join(', ')} ${opText}`
  } else if ((op === 'equals' || op === 'notEquals') && (BOOLEAN_FIELDS.has(field) || BOOLEAN_FIELDS.has(canonicalField(field)))) {
    text = `${label} ${valueText(field, rule.value)}${op === 'notEquals' ? ' değilse' : ''}`
  } else {
    text = `${label} ${valueText(field, rule.value)} ${opText}`
  }
  return neg ? `${text} değil` : text
}

/** Düğümün kurallarını (eski tekli alanlar dahil) tek listeye indirger. */
export function getConditionRules(data: Record<string, any> | undefined): { rules: Rule[]; logic: 'AND' | 'OR' } {
  const d = data || {}
  const logic: 'AND' | 'OR' = d.conditionLogic === 'OR' ? 'OR' : 'AND'
  if (Array.isArray(d.rules) && d.rules.length > 0) {
    return {
      rules: d.rules.map((r: any) => ({ field: String(r.field || ''), operator: String(r.operator || 'equals'), value: r.value, valueTo: r.valueTo })),
      logic,
    }
  }
  return {
    rules: [{ field: String(d.conditionField || ''), operator: String(d.operator || 'equals'), value: d.conditionValue, valueTo: d.conditionValueTo }],
    logic,
  }
}

/** Bir koşul düğümünün tek cümlelik özeti (bağlaçlı). */
export function describeCondition(data: Record<string, any> | undefined, fieldNames: Record<string, string> = {}): string {
  const { rules, logic } = getConditionRules(data)
  return rules.map(r => describeRule(r, fieldNames)).join(` ${LOGIC_LABELS[logic]} `)
}

// ── Yol modeli ───────────────────────────────────────────────────────────────
interface Literal {
  /** Kuralın kimliği (aynı kural, iki kutupta aynı id) */
  id: string
  positive: boolean
  text: string
}
type Path = Literal[]

function literalKey(l: Literal): string {
  return `${l.id}|${l.positive ? '1' : '0'}`
}

function pathKey(p: Path): string {
  return p.map(literalKey).sort().join('&')
}

/** Bir dalı (evet/hayır) koşul parçalarına çevirir. */
function branchLiterals(nodeId: string, data: Record<string, any> | undefined, branch: 'true' | 'false', fieldNames: Record<string, string>): Literal[] {
  const { rules, logic } = getConditionRules(data)
  const positive = branch === 'true'
  if (rules.length === 1) {
    return [{ id: `${nodeId}#0`, positive, text: describeRule(rules[0], fieldNames, !positive) }]
  }
  // Çoklu kural: VE + evet dalı → her kural ayrı parça; diğer durumlarda tek birleşik parça.
  if (logic === 'AND' && positive) {
    return rules.map((r, i) => ({ id: `${nodeId}#${i}`, positive: true, text: describeRule(r, fieldNames) }))
  }
  if (logic === 'OR' && !positive) {
    return rules.map((r, i) => ({ id: `${nodeId}#${i}`, positive: false, text: describeRule(r, fieldNames, true) }))
  }
  const joined = rules.map(r => describeRule(r, fieldNames)).join(` ${LOGIC_LABELS[logic]} `)
  return [{ id: `${nodeId}#all`, positive, text: positive ? joined : `Şu durum yoksa: ${joined}` }]
}

/** Yolları sadeleştirir: yinelenenleri atar, tamamlayıcı çiftleri birleştirir, kapsananı eler. */
export function simplifyPaths(paths: Path[]): Path[] {
  // Bir yolda aynı kuralın iki kutbu varsa çelişkilidir, atılır.
  let current: Path[] = []
  const seen = new Set<string>()
  for (const p of paths) {
    const byId = new Map<string, boolean>()
    let contradictory = false
    const dedup: Path = []
    for (const l of p) {
      const prev = byId.get(l.id)
      if (prev === undefined) {
        byId.set(l.id, l.positive)
        dedup.push(l)
      } else if (prev !== l.positive) {
        contradictory = true
        break
      }
    }
    if (contradictory) continue
    const k = pathKey(dedup)
    if (seen.has(k)) continue
    seen.add(k)
    current.push(dedup)
  }

  let changed = true
  let guard = 0
  while (changed && guard++ < 1000) {
    changed = false
    outer: for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i]
        const b = current[j]
        // Kapsama: a ⊆ b ise b gereksizdir ("A" varken "A ve B" anlamsız).
        const aKeys = new Set(a.map(literalKey))
        const bKeys = new Set(b.map(literalKey))
        if (a.every(l => bKeys.has(literalKey(l)))) { current.splice(j, 1); changed = true; break outer }
        if (b.every(l => aKeys.has(literalKey(l)))) { current.splice(i, 1); changed = true; break outer }
        // Tamamlayıcı: tek kuralın kutbu dışında aynıysa birleştir.
        if (a.length !== b.length) continue
        const aMap = new Map(a.map(l => [l.id, l.positive]))
        let diffId: string | null = null
        let ok = true
        for (const l of b) {
          const v = aMap.get(l.id)
          if (v === undefined) { ok = false; break }
          if (v !== l.positive) {
            if (diffId) { ok = false; break }
            diffId = l.id
          }
        }
        if (ok && diffId) {
          const merged = a.filter(l => l.id !== diffId)
          current.splice(j, 1)
          current[i] = merged
          changed = true
          break outer
        }
      }
    }
  }
  return current
}

// ── Grafik taraması ──────────────────────────────────────────────────────────
interface Traversal {
  pathsByNode: Map<string, Path[]>
  inLoop: Set<string>
  truncated: boolean
}

function traverse(nodes: FlowNodeLike[], edges: FlowEdgeLike[], fieldNames: Record<string, string>): Traversal {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const outEdges = new Map<string, FlowEdgeLike[]>()
  for (const e of edges) {
    const list = outEdges.get(e.source) || []
    list.push(e)
    outEdges.set(e.source, list)
  }
  const pathsByNode = new Map<string, Path[]>()
  const inLoop = new Set<string>()
  let count = 0
  let truncated = false

  const visit = (id: string, literals: Path, stack: string[]) => {
    if (truncated) return
    const node = nodeMap.get(id)
    if (!node) return
    if (stack.includes(id)) {
      // Döngü: yolu burada kes, döngüdeki adımları işaretle.
      for (let i = stack.indexOf(id); i < stack.length; i++) inLoop.add(stack[i])
      return
    }
    if (count >= MAX_PATHS) { truncated = true; return }
    count++
    const list = pathsByNode.get(id) || []
    list.push(literals)
    pathsByNode.set(id, list)

    const nextStack = [...stack, id]
    const outs = outEdges.get(id) || []
    if (node.type === 'conditionNode') {
      for (const branch of ['true', 'false'] as const) {
        const edge = outs.find(e => e.sourceHandle === branch)
        if (edge) visit(edge.target, [...literals, ...branchLiterals(id, node.data, branch, fieldNames)], nextStack)
      }
      return
    }
    for (const e of outs) visit(e.target, literals, nextStack)
  }

  const starts = nodes.filter(n => n.type === 'startNode')
  for (const s of starts) visit(s.id, [], [])
  return { pathsByNode, inLoop, truncated }
}

function nodeTitle(node: FlowNodeLike, fieldNames: Record<string, string>): string {
  const d = node.data || {}
  switch (node.type) {
    case 'startNode': return 'Başlangıç'
    case 'endNode': return 'Görüşmenin sonu'
    case 'fieldNode': return `“${String(d.label || fieldNames[d.fieldName] || 'Bilgi')}” sorusu`
    case 'conditionNode': return `Koşul: ${describeCondition(d, fieldNames)}`
    case 'actionNode': return actionTitle(d)
    default: return String(d.label || 'Adım')
  }
}

function actionTitle(d: Record<string, any>): string {
  if (d.action === 'webhook') return 'Desteklenmeyen adım'
  return LOCAL_ACTION_LABELS[String(d.action)] || String(d.label || 'İşlem seçilmedi')
}

function doesText(node: FlowNodeLike, fieldNames: Record<string, string>): string {
  const d = node.data || {}
  switch (node.type) {
    case 'startNode': return 'Görüşme burada başlar.'
    case 'endNode': return d.message ? `Görüşme sona erer. Söylenecek söz: “${String(d.message)}”` : 'Görüşme sona erer.'
    case 'fieldNode': {
      const label = String(d.label || fieldNames[d.fieldName] || 'Bu bilgi')
      return `${label} hastadan sorulur${d.required ? ' (zorunlu)' : ''}.`
    }
    case 'conditionNode': return `Şunu kontrol eder: ${describeCondition(d, fieldNames)}.`
    case 'actionNode': {
      if (d.action === 'webhook') return 'Bu adım artık desteklenmiyor, silin.'
      const base = actionTitle(d)
      return base.endsWith('.') ? base : `${base}.`
    }
    default: return 'Akışta bir adım.'
  }
}

/** Ardışık/benzersiz parça yollarını cümleye çevirir. */
function pathSentence(path: Path): string {
  if (path.length === 0) return 'Her durumda'
  return path.map(l => l.text).join(` ${LOGIC_LABELS.AND} `)
}

function nextTexts(node: FlowNodeLike, edges: FlowEdgeLike[], nodeMap: Map<string, FlowNodeLike>, fieldNames: Record<string, string>): { lines: string[]; warnings: string[] } {
  const outs = edges.filter(e => e.source === node.id)
  const lines: string[] = []
  const warnings: string[] = []
  if (node.type === 'endNode') return { lines: ['Görüşme biter.'], warnings }
  if (node.type === 'conditionNode') {
    for (const [branch, label] of [['true', 'Evet ise'], ['false', 'Hayır ise']] as const) {
      const e = outs.find(x => x.sourceHandle === branch)
      const target = e ? nodeMap.get(e.target) : undefined
      if (target) lines.push(`${label} → ${nodeTitle(target, fieldNames)}`)
      else warnings.push(`“${label.replace(' ise', '')}” çıkışı hiçbir adıma bağlı değil.`)
    }
    return { lines, warnings }
  }
  if (outs.length === 0) {
    warnings.push('Bu adımdan sonra hiçbir adıma bağlı değil.')
    return { lines, warnings }
  }
  for (const e of outs) {
    const t = nodeMap.get(e.target)
    if (t) lines.push(`Sonra → ${nodeTitle(t, fieldNames)}`)
  }
  return { lines, warnings }
}

/** Soru adımlarından alan adı → görünen ad eşlemesi. */
export function collectFieldNames(nodes: FlowNodeLike[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of nodes) {
    if (n.type === 'fieldNode' && n.data?.fieldName && n.data?.label) out[String(n.data.fieldName)] = String(n.data.label)
  }
  return out
}

/** Tek adımın özeti. */
export function summarizeNode(nodes: FlowNodeLike[], edges: FlowEdgeLike[], nodeId: string): NodeSummary | null {
  return summarizeFlow(nodes, edges)[nodeId] || null
}

/** Akıştaki her adımın özetini üretir (tek geçişte). */
export function summarizeFlow(nodes: FlowNodeLike[], edges: FlowEdgeLike[]): Record<string, NodeSummary> {
  const fieldNames = collectFieldNames(nodes)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const { pathsByNode, inLoop, truncated } = traverse(nodes, edges, fieldNames)
  const result: Record<string, NodeSummary> = {}

  for (const node of nodes) {
    const d = node.data || {}
    const warnings: string[] = []
    const next = nextTexts(node, edges, nodeMap, fieldNames)
    warnings.push(...next.warnings)

    const isStart = node.type === 'startNode'
    const event = node.type === 'actionNode' && d.eventTrigger ? String(d.eventTrigger) : ''
    const rawPaths = pathsByNode.get(node.id)
    const reachable = isStart || Boolean(event) || Boolean(rawPaths && rawPaths.length > 0)

    let when: string[] = []
    if (isStart) {
      when = ['Görüşme başladığında']
    } else if (event) {
      when = [`Olay: ${EVENT_LABELS[event] || 'Belirli bir olay olduğunda'} (akıştaki sıradan bağımsız çalışır)`]
    } else if (!reachable) {
      when = ['Bu adıma hiçbir yoldan gelinmiyor.']
      warnings.push('Bu adıma hiçbir yoldan gelinmiyor; başlangıca bağlayın veya silin.')
    } else {
      const simplified = simplifyPaths(rawPaths || [])
      const sentences = Array.from(new Set(simplified.map(pathSentence)))
      if (sentences.includes('Her durumda')) {
        when = ['Her durumda']
      } else {
        when = sentences.slice(0, MAX_SHOWN_PATHS).map(s => `${s} gelinir`)
        if (sentences.length > MAX_SHOWN_PATHS) when.push(`… ve ${sentences.length - MAX_SHOWN_PATHS} durum daha`)
      }
    }

    if (node.type === 'actionNode' && d.action === 'webhook') warnings.push('Bu adım artık desteklenmiyor, silin. Görüşme sırasında atlanır.')
    if (inLoop.has(node.id)) warnings.push('Bu adım bir döngünün içinde.')
    if (truncated && reachable) warnings.push(`Akış çok dallı; ilk ${MAX_PATHS} yol dikkate alındı.`)

    result[node.id] = {
      nodeId: node.id,
      does: doesText(node, fieldNames),
      when,
      next: next.lines,
      warnings,
      reachable,
      truncated,
    }
  }
  return result
}

/** Akışın yapısal parmak izi (önbellek anahtarı). Yalnızca yapı: konum ve geçici alanlar hariç. */
export function flowGraphHash(nodes: FlowNodeLike[], edges: FlowEdgeLike[]): string {
  const clean = (data: Record<string, any> | undefined) => {
    const out: Record<string, any> = {}
    for (const k of Object.keys(data || {}).sort()) {
      if (k.startsWith('_')) continue
      out[k] = (data as any)[k]
    }
    return out
  }
  const payload = JSON.stringify({
    n: nodes.map(n => [n.id, n.type, clean(n.data)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    e: edges.map(e => [e.source, e.target, e.sourceHandle || '']).sort((a, b) => a.join('>').localeCompare(b.join('>'))),
  })
  // FNV-1a 32 bit (tarayıcı ve sunucuda aynı sonuç)
  let h = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
