import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { flowSessions } from '../db/schema'
import { getActiveFlow, type ConversationFlow, type FlowEdge, type FlowNode, validateConversationFlow } from '../db/repositories/flows'
import { getSetting } from '../db/repositories/settings'

export type FlowRuntimeMode = 'legacy' | 'observe' | 'active'
export type FlowChannel = 'web_direct' | 'web_socket' | 'phone'

export type FlowEngineEvent = {
  id?: string
  revision?: number
  fields?: Record<string, unknown>
  intent?: 'continue' | 'end' | 'new_person'
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

function conditionMatches(node: FlowNode, fields: Record<string, unknown>) {
  const field = String(node.data.conditionField || '')
  const actual = String(fields[field] ?? '').trim()
  const expected = String(node.data.conditionValue || '').trim()
  if (node.data.operator === 'notEmpty') return actual.length > 0
  if (node.data.operator === 'contains') return actual.toLocaleLowerCase('tr-TR').includes(expected.toLocaleLowerCase('tr-TR'))
  return actual.toLocaleLowerCase('tr-TR') === expected.toLocaleLowerCase('tr-TR')
}

function validField(node: FlowNode, fields: Record<string, unknown>) {
  const name = node.data.fieldName || ''
  const value = String(fields[name] ?? '').trim()
  if (!value) return false
  if (node.data.fieldType === 'date' || name === 'tarih') return /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (node.data.fieldType === 'time' || name === 'saat') return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  if (name === 'telefon') return value.replace(/\D/g, '').length >= 10
  return true
}

export async function resolveFlowRuntimeMode(clinicId?: string): Promise<FlowRuntimeMode> {
  const value = await getSetting('ai.flow_runtime_mode', clinicId).catch(() => null)
  return value === 'active' || value === 'observe' ? value : 'legacy'
}

export class FlowEngine {
  private state: StoredState
  private revision = 0
  private chain: Promise<unknown> = Promise.resolve()
  readonly id: string
  readonly mode: FlowRuntimeMode
  readonly channel: FlowChannel
  readonly direction: string
  readonly clinicId: string

  private constructor(args: { id: string; state: StoredState; mode: FlowRuntimeMode; channel: FlowChannel; direction: string; clinicId: string }) {
    this.id = args.id; this.state = args.state; this.mode = args.mode; this.channel = args.channel; this.direction = args.direction; this.clinicId = args.clinicId
  }

  static async create(args: { clinicId: string; direction: string; channel: FlowChannel; mode?: FlowRuntimeMode }) {
    const flow = await getActiveFlow(args.direction, args.clinicId)
    if (!flow) return null
    const validation = validateConversationFlow(flow.nodes, flow.edges)
    if (validation.some(issue => issue.level === 'error')) return null
    const mode = args.mode || await resolveFlowRuntimeMode(args.clinicId)
    if (mode === 'legacy') return null
    const start = flow.nodes.find(node => node.type === 'START')
    const engine = new FlowEngine({
      id: randomUUID(), mode, channel: args.channel, direction: args.direction, clinicId: args.clinicId,
      state: { flow: structuredClone(flow), currentNodeId: start?.id, fields: {}, handledEvents: {}, completedActions: [] },
    })
    await engine.persist()
    return engine
  }

  private async persist(status = 'active') {
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
    if (node.type === 'FIELD') return node.data.description || `${node.data.fieldName || 'Bu bilgiyi'} kullanıcıdan kısa ve açık biçimde iste.`
    if (node.type === 'END') return node.data.message || 'Görüşmeyi kısa ve nazikçe tamamla.'
    return undefined
  }

  private async advance(): Promise<FlowEngineResult> {
    for (let guard = 0; guard < this.state.flow.nodes.length + 2; guard += 1) {
      const node = this.node()
      if (!node) return { success: false, revision: this.revision, fields: this.state.fields, message: 'Akışın devam edeceği adım bulunamadı.' }
      if (node.type === 'START') { this.next(edgesFrom(this.state.flow.edges, node.id)[0]); continue }
      if (node.type === 'FIELD') {
        if (!validField(node, this.state.fields)) return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type, prompt: this.promptFor(node) } }
        this.next(edgesFrom(this.state.flow.edges, node.id)[0]); continue
      }
      if (node.type === 'CONDITION') {
        const branch = conditionMatches(node, this.state.fields) ? 'true' : 'false'
        this.next(edgesFrom(this.state.flow.edges, node.id).find(edge => edge.sourceHandle === branch)); continue
      }
      if (node.type === 'ACTION') {
        if (this.mode === 'observe') return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type }, message: 'Akış bu adımda bir işlem yapacaktı.' }
        if (!this.state.completedActions.includes(node.id)) return { success: true, revision: this.revision, fields: this.state.fields, next: { nodeId: node.id, type: node.type } }
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

  async completeAction(nodeId: string, success: boolean, message?: string) {
    const node = this.node()
    if (!node || node.id !== nodeId || node.type !== 'ACTION') return { success: false, message: 'Bu işlem görüşmenin mevcut adımına ait değil.' }
    if (!success) return { success: false, message: message || 'İşlem tamamlanamadı.' }
    if (!this.state.completedActions.includes(nodeId)) this.state.completedActions.push(nodeId)
    this.next(edgesFrom(this.state.flow.edges, node.id)[0])
    const result = await this.advance(); this.revision += 1; await this.persist(result.completed ? 'completed' : 'active')
    return { ...result, revision: this.revision }
  }

  async close() { await this.persist('closed') }
}

const liveEngines = new Map<string, FlowEngine>()
const webSessionKeys = new Map<string, string>()
export function keepFlowEngine(engine: FlowEngine) { liveEngines.set(engine.id, engine); return engine }
export function getFlowEngine(id: string) { return liveEngines.get(id) }
export async function createWebFlowSession(clinicId: string, direction = 'inbound') {
  const engine = await FlowEngine.create({ clinicId, direction, channel: 'web_direct' })
  if (!engine) return null
  const token = randomUUID() + randomUUID().replace(/-/g, '')
  keepFlowEngine(engine); webSessionKeys.set(engine.id, token)
  return { id: engine.id, token, revision: 0 }
}
export function getAuthorizedWebFlowEngine(id: string, token: string | undefined) {
  const expected = webSessionKeys.get(id)
  return expected && token === expected ? liveEngines.get(id) : undefined
}
export async function closeFlowEngine(id: string) { const engine = liveEngines.get(id); if (engine) { await engine.close(); liveEngines.delete(id); webSessionKeys.delete(id) } }
