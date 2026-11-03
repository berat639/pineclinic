import { randomUUID } from 'crypto'
import { db } from '../db/client'
import { flowSessions } from '../db/schema'
import { isRemovedWebhookAction } from './flow-validation'
import {
  evaluateConditionNode,
  getActiveFlow,
  getTransferPromptConfig,
  injectFlowSystemVariables,
  renderFlowTemplate,
  validateConversationFlow,
  type ConversationFlow,
  type FlowEdge,
  type FlowEventTrigger,
  type FlowNode,
} from '../db/repositories/flows'
import { getSetting } from '../db/repositories/settings'

export type FlowRuntimeMode = 'legacy' | 'observe' | 'active'
export type FlowChannel = 'web_direct' | 'web_socket' | 'phone' | 'whatsapp'

export type FlowEngineEvent = {
  id?: string
  revision?: number
  fields?: Record<string, unknown>
  intent?: 'continue' | 'end' | 'new_person'
  eventTrigger?: FlowEventTrigger
}

export type FlowEngineResult = {
  success: boolean
  revision: number
  fields: Record<string, unknown>
  next?: { nodeId: string; type: FlowNode['type']; prompt?: string }
  completed?: boolean
  message?: string
  replayed?: boolean
}

type StoredState = {
  flow: ConversationFlow
  currentNodeId?: string
  fields: Record<string, unknown>
  handledEvents: Record<string, FlowEngineResult>
  completedActions: string[]
}

function cleanFields(fields: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => {
    if (!key || key.startsWith('_') || value === undefined || value === null) return false
    return typeof value !== 'string' || value.trim().length > 0
  }))
}

function edgesFrom(edges: FlowEdge[], nodeId: string) { return edges.filter(edge => edge.source === nodeId) }

function validField(node: FlowNode, fields: Record<string, unknown>) {
  const name = node.data.fieldName || ''
  const value = String(fields[name] ?? '').trim()
  if (!value) return false
  if (node.data.fieldType === 'date' || name === 'tarih') return /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (node.data.fieldType === 'time' || name === 'saat') return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  if (name === 'telefon') return value.replace(/\D/g, '').length >= 10
  return true
}

export function buildFlowNodePrompt(
  flow: ConversationFlow,
  node: FlowNode,
  fields: Record<string, unknown> = {},
): string | undefined {
  if (node.type === 'FIELD') {
    const nextEdge = edgesFrom(flow.edges, node.id)[0]
    const nextNode = nextEdge ? flow.nodes.find(n => n.id === nextEdge.target) : undefined
    if (
      node.data.fieldName === 'tarih' &&
      nextNode?.type === 'FIELD' &&
      nextNode.data.fieldName === 'saat' &&
      !validField(nextNode, fields)
    ) {
      return 'Hangi gün ve saat için randevu oluşturmamı istersiniz? (Bu soruyu sorduktan sonra DUR ve müşterinin konuşmasını/cevabını bekle; cevap almadan sıradaki adıma geçme.)'
    }
    if (
      node.data.fieldName === 'musteri_adi' &&
      nextNode?.type === 'FIELD' &&
      nextNode.data.fieldName === 'telefon' &&
      !validField(nextNode, fields)
    ) {
      return 'Randevunuz için adınızı, soyadınızı ve telefon numaranızı alabilir miyim? (Bu soruyu sorduktan sonra DUR ve müşterinin konuşmasını/cevabını bekle; cevap almadan sıradaki adıma geçme.)'
    }
    const base = node.data.description || `${node.data.fieldName || 'Bu bilgiyi'} kullanıcıdan kısa ve açık biçimde iste.`
    return `${base} (Bu soruyu sorduktan sonra DUR ve müşterinin konuşmasını/cevabını bekle; cevap almadan sıradaki adıma geçme.)`
  }
  if (node.type === 'END') return node.data.message || 'Görüşmeyi kısa ve nazikçe tamamla.'
  if (node.type === 'ACTION') {
    const act = String(node.data.action || '')
    if (act === 'wait_reprompt' || act === 'wait') {
      return renderFlowTemplate(node.data.message || 'Sizi dinliyorum, nasıl yardımcı olabilirim?', fields)
    }
    if (act === 'switch_prompt') {
      return renderFlowTemplate(node.data.promptInstruction || node.data.message || '', fields)
    }
    if (act === 'transfer_call' || act === 'transfer') {
      const { target, requiresConfirmation, questionInstruction } = getTransferPromptConfig(node.data as Record<string, unknown>)
      if (requiresConfirmation) {
        return `Önce kullanıcıya ${questionInstruction} ve müşterinin cevabını bekle. Açıkça olumlu cevap gelirse aramaAktar aracını "hedef": "${target || 'resepsiyon'}" parametresiyle çağır.`
      }
      return `Şimdi aramaAktar aracını "hedef": "${target || 'resepsiyon'}" parametresiyle çağır ve aramayı yetkili birime aktar.`
    }
    if (act === 'save_appointment_pending' || act === 'randevuOlustur') {
      return 'Tüm randevu bilgileri tamamlandı. Şimdi randevuOlustur aracını çağırarak randevuyu kaydet.'
    }
    if (act === 'save_patient_note' || act === 'notBirak') {
      return 'Şimdi hastaNotKaydet aracını çağırarak hastanın notunu veya mesajını kaydet.'
    }
    if (act === 'send_wa_location') {
      return 'Şimdi whatsappKonumGonder aracını çağırarak kliniğin konumunu arayan numaraya WhatsApp üzerinden gönder.'
    }
    if (act === 'send_wa_message') {
      const msg = renderFlowTemplate(String(node.data.message || ''), fields)
      return msg ? `Hastaya şu mesajı ilet: "${msg}".` : 'Hastaya bilgilendirme mesajını ilet.'
    }
    if (act === 'send_sms') {
      const msg = renderFlowTemplate(String(node.data.message || ''), fields)
      return msg ? `Hastaya "${msg}" içerikli bilgilendirme SMS'inin gönderildiğini belirt.` : 'Hastaya bilgilendirme SMS\'inin gönderildiğini belirt.'
    }
    if (act === 'end_call') {
      const msg = renderFlowTemplate(String(node.data.message || ''), fields)
      return `${msg ? `"${msg}" diyerek ` : ''}cagriySonlandir aracını çağır ve görüşmeyi sonlandır.`
    }
  }
  return undefined
}

export async function resolveFlowRuntimeMode(clinicId?: string): Promise<FlowRuntimeMode> {
  const value = await getSetting('ai.flow_runtime_mode', clinicId).catch(() => null)
  return value === 'active' || value === 'observe' ? value : 'legacy'
}

export class FlowEngine {
  private state: StoredState
  private revision = 0
  private chain: Promise<unknown> = Promise.resolve()
  private skipPersist = false
  readonly id: string
  readonly mode: FlowRuntimeMode
  readonly channel: FlowChannel
  readonly direction: string
  readonly clinicId: string

  private constructor(args: { id: string; state: StoredState; mode: FlowRuntimeMode; channel: FlowChannel; direction: string; clinicId: string; skipPersist?: boolean }) {
    this.id = args.id; this.state = args.state; this.mode = args.mode; this.channel = args.channel; this.direction = args.direction; this.clinicId = args.clinicId; this.skipPersist = Boolean(args.skipPersist)
  }

  static fromMemory(flow: ConversationFlow, opts?: { direction?: string; channel?: FlowChannel; mode?: FlowRuntimeMode; initialFields?: Record<string, unknown> }) {
    const direction = opts?.direction || 'inbound'
    const channel = opts?.channel || 'phone'
    const mode = opts?.mode || 'active'
    const start = flow.nodes.find(node => node.type === 'START')
    const initialWithSys = injectFlowSystemVariables(cleanFields(opts?.initialFields), {
      direction,
      channel,
    })
    return new FlowEngine({
      id: randomUUID(),
      mode,
      channel,
      direction,
      clinicId: 'memory',
      skipPersist: true,
      state: { flow: structuredClone(flow), currentNodeId: start?.id, fields: initialWithSys, handledEvents: {}, completedActions: [] },
    })
  }

  static async create(args: { clinicId: string; direction: string; channel: FlowChannel; mode?: FlowRuntimeMode; initialFields?: Record<string, unknown> }) {
    const flow = await getActiveFlow(args.direction, args.clinicId)
    if (!flow) return null
    const validation = validateConversationFlow(flow.nodes, flow.edges)
    if (validation.some(issue => issue.level === 'error')) return null
    const mode = args.mode || await resolveFlowRuntimeMode(args.clinicId)
    if (mode === 'legacy') return null
    const start = flow.nodes.find(node => node.type === 'START')
    const initialWithSys = injectFlowSystemVariables(cleanFields(args.initialFields), {
      direction: args.direction,
      channel: args.channel,
    })
    const engine = new FlowEngine({
      id: randomUUID(), mode, channel: args.channel, direction: args.direction, clinicId: args.clinicId,
      state: { flow: structuredClone(flow), currentNodeId: start?.id, fields: initialWithSys, handledEvents: {}, completedActions: [] },
    })
    await engine.persist()
    return engine
  }

  private async persist(status = 'active') {
    if (this.skipPersist) return
    const expiresAt = new Date(Date.now() + 35 * 60_000)
    await db.insert(flowSessions).values({
      id: this.id, clinicId: this.clinicId, direction: this.direction, channel: this.channel, flowId: this.state.flow.id,
      status, revision: this.revision, state: this.state, expiresAt, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: flowSessions.id,
      set: { status, revision: this.revision, state: this.state, expiresAt, updatedAt: new Date() },
    }).catch(error => console.error('[FlowEngine] durum kaydedilemedi:', error))
  }

  private node() { return this.state.flow.nodes.find(node => node.id === this.state.currentNodeId) }

  expectedAction() {
    const node = this.node()
    return node?.type === 'ACTION' ? { nodeId: node.id, action: String(node.data.action || '') } : undefined
  }

  private next(edge?: FlowEdge) { this.state.currentNodeId = edge?.target }

  private promptFor(node: FlowNode) {
    return buildFlowNodePrompt(this.state.flow, node, this.state.fields)
  }

  private async advance(): Promise<FlowEngineResult> {
    this.state.fields = injectFlowSystemVariables(this.state.fields, {
      direction: this.direction,
      channel: this.channel,
    })

    for (let guard = 0; guard < this.state.flow.nodes.length + 2; guard += 1) {
      const node = this.node()
      if (!node) return { success: false, revision: this.revision, fields: this.state.fields, message: 'Akışın devam edeceği adım bulunamadı.' }
      if (node.type === 'START') { this.next(edgesFrom(this.state.flow.edges, node.id)[0]); continue }
      if (node.type === 'FIELD') {
        if (!validField(node, this.state.fields)) return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) } }
        this.next(edgesFrom(this.state.flow.edges, node.id)[0]); continue
      }
      if (node.type === 'CONDITION') {
        const matched = evaluateConditionNode(node, this.state.fields, undefined, {
          direction: this.direction,
          channel: this.channel,
        })
        const branch = matched ? 'true' : 'false'
        this.next(edgesFrom(this.state.flow.edges, node.id).find(edge => edge.sourceHandle === branch)); continue
      }
      if (node.type === 'ACTION') {
        const act = String(node.data.action || '')
        if (!this.state.completedActions.includes(node.id)) {
          if (act === 'set_variable') {
            const varName = String(node.data.variableName || '').trim()
            if (varName) {
              this.state.fields[varName] = renderFlowTemplate(String(node.data.variableValue ?? ''), this.state.fields)
            }
            this.state.completedActions.push(node.id)
            this.next(edgesFrom(this.state.flow.edges, node.id)[0])
            continue
          }
          if (act === 'switch_prompt') {
            const instr = renderFlowTemplate(String(node.data.promptInstruction || node.data.message || ''), this.state.fields)
            if (instr) this.state.fields['activePromptOverride'] = instr
            this.state.completedActions.push(node.id)
            this.next(edgesFrom(this.state.flow.edges, node.id)[0])
            continue
          }
          if (isRemovedWebhookAction(node)) {
            // Kaldırılan eski akış webhook'u: çalışma anında pas geçilir (DB'ye dokunulmaz).
            console.warn(`[FlowEngine] Kaldırılmış 'webhook' işlemi pas geçildi (node: ${node.id})`)
            this.state.completedActions.push(node.id)
            const outEdge = edgesFrom(this.state.flow.edges, node.id)[0]
            if (!outEdge) {
              return { success: true, revision: this.revision, fields: this.state.fields, completed: true }
            }
            this.next(outEdge)
            continue
          }
          if (act === 'wait_reprompt' || act === 'wait' || act === 'send_sms' || act === 'send_wa_message') {
            this.state.completedActions.push(node.id)
            return {
              success: true,
              revision: this.revision,
              fields: this.state.fields,
              next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) },
            }
          }
        }
        if (this.mode === 'observe') return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) }, message: 'Akış bu adımda bir işlem yapacaktı.' }
        if (!this.state.completedActions.includes(node.id)) return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) } }
        this.next(edgesFrom(this.state.flow.edges, node.id)[0]); continue
      }
      if (node.type === 'END') return { success: true, revision: this.revision, fields: this.state.fields, completed: true, next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) } }
    }
    return { success: false, revision: this.revision, fields: this.state.fields, message: 'Akışta tamamlanamayan bir döngü var.' }
  }

  async accept(event: FlowEngineEvent): Promise<FlowEngineResult> {
    const run = async () => {
      const eventId = event.id || randomUUID()
      const replay = this.state.handledEvents[eventId]
      if (replay) return { ...replay, replayed: true }
      if (event.revision !== undefined && event.revision !== this.revision) return { success: false, revision: this.revision, fields: this.state.fields, message: 'Bu görüşme adımı güncel değil.' }
      if (event.intent === 'new_person') { this.state.fields = {}; this.state.completedActions = []; const start = this.state.flow.nodes.find(node => node.type === 'START'); this.state.currentNodeId = start?.id }
      if (event.eventTrigger) {
        const triggerNode = this.state.flow.nodes.find(n => n.type === 'ACTION' && n.data.eventTrigger === event.eventTrigger)
        if (triggerNode) {
          this.state.currentNodeId = triggerNode.id
        }
      }
      this.state.fields = { ...this.state.fields, ...cleanFields(event.fields) }
      const result = await this.advance()
      this.revision += 1
      const committed = { ...result, revision: this.revision }
      this.state.handledEvents[eventId] = committed
      if (Object.keys(this.state.handledEvents).length > 50) delete this.state.handledEvents[Object.keys(this.state.handledEvents)[0]]
      await this.persist(committed.completed ? 'completed' : 'active')
      return committed
    }
    const queued = this.chain.then(run, run) as Promise<FlowEngineResult>
    this.chain = queued.then(() => undefined, () => undefined)
    return queued
  }

  async completeAction(nodeId: string, success: boolean, message?: string): Promise<FlowEngineResult> {
    const node = this.node()
    if (!node || node.id !== nodeId || node.type !== 'ACTION') return { success: false, revision: this.revision, fields: this.state.fields, message: 'Bu işlem görüşmenin mevcut adımına ait değil.' }
    if (!success) return { success: false, revision: this.revision, fields: this.state.fields, message: message || 'İşlem tamamlanamadı.' }
    if (!this.state.completedActions.includes(nodeId)) this.state.completedActions.push(nodeId)
    this.next(edgesFrom(this.state.flow.edges, node.id)[0])
    const result = await this.advance(); this.revision += 1; await this.persist(result.completed ? 'completed' : 'active')
    return { ...result, revision: this.revision }
  }

  async close() { await this.persist('closed') }
}

const liveEngines = new Map<string, FlowEngine>()
const webSessionKeys = new Map<string, string>()
const webToolSessionKeys = new Map<string, { clinicId: string; expiresAt: number }>()
const WEB_TOOL_KEY_TTL_MS = 2 * 60 * 60_000

export function issueWebToolSessionKey(clinicId: string): string {
  const now = Date.now()
  if (webToolSessionKeys.size > 500) {
    for (const [k, v] of webToolSessionKeys) {
      if (v.expiresAt <= now) webToolSessionKeys.delete(k)
    }
  }
  const token = randomUUID() + randomUUID().replace(/-/g, '')
  webToolSessionKeys.set(token, { clinicId, expiresAt: now + WEB_TOOL_KEY_TTL_MS })
  return token
}

export function isAuthorizedWebToolSession(clinicId: string, token: string | undefined): boolean {
  if (!token || !clinicId) return false
  const now = Date.now()
  const standalone = webToolSessionKeys.get(token)
  if (standalone) {
    if (standalone.expiresAt <= now) {
      webToolSessionKeys.delete(token)
      return false
    }
    if (standalone.clinicId === clinicId) return true
  }
  for (const [engineId, expectedToken] of webSessionKeys) {
    if (expectedToken === token) {
      const engine = liveEngines.get(engineId)
      if (engine && engine.clinicId === clinicId) return true
    }
  }
  return false
}

export function keepFlowEngine(engine: FlowEngine) { liveEngines.set(engine.id, engine); return engine }
export function getFlowEngine(id: string) { return liveEngines.get(id) }
export async function createWebFlowSession(clinicId: string, direction = 'inbound') {
  const engine = await FlowEngine.create({ clinicId, direction, channel: 'web_direct' })
  if (!engine) return null
  const token = issueWebToolSessionKey(clinicId)
  keepFlowEngine(engine); webSessionKeys.set(engine.id, token)
  return { id: engine.id, token, revision: 0 }
}
export function getAuthorizedWebFlowEngine(id: string, token: string | undefined) {
  const expected = webSessionKeys.get(id)
  return expected && token === expected ? liveEngines.get(id) : undefined
}
export async function closeFlowEngine(id: string) { const engine = liveEngines.get(id); if (engine) { await engine.close(); liveEngines.delete(id); webSessionKeys.delete(id) } }
