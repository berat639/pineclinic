import { eq, sql as drizzleSql } from 'drizzle-orm'
import { db } from '../client'
import { conversationFlows } from '../schema'

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
    fieldType?: 'text' | 'date' | 'time' | 'enum'
    enumValues?: string[]
    // CONDITION node
    conditionField?: string
    operator?: 'equals' | 'contains' | 'notEmpty'
    conditionValue?: string
    // ACTION node
    action?: 'randevuOlustur' | 'searchKnowledgeBase'
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

function toIso(d: Date | null | undefined): string {
  return d ? d.toISOString() : ''
}

export async function getActiveFlow(): Promise<ConversationFlow | null> {
  const rows = await db
    .select()
    .from(conversationFlows)
    .where(eq(conversationFlows.isActive, true))
    .limit(1)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    name: r.name,
    nodes: r.nodes as FlowNode[],
    edges: r.edges as FlowEdge[],
    isActive: r.isActive,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

export async function saveFlow(nodes: FlowNode[], edges: FlowEdge[]): Promise<ConversationFlow> {
  const existing = await getActiveFlow()
  if (existing) {
    const [updated] = await db
      .update(conversationFlows)
      .set({ nodes, edges, updatedAt: new Date() })
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
    .values({ nodes, edges })
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

export function flowToToolFields(flow: ConversationFlow): {
  properties: Record<string, { type: string; description: string; enum?: string[] }>
  required: string[]
} {
  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {}
  const requiredSet = new Set<string>()
  for (const node of getFieldNodes(flow)) {
    const name = node.data.fieldName!
    if (properties[name]) continue
    const prop: { type: string; description: string; enum?: string[] } = {
      type: 'STRING',
      description: node.data.description || name,
    }
    if (node.data.fieldType === 'enum' && node.data.enumValues?.length) {
      prop.enum = node.data.enumValues
    }
    properties[name] = prop
    if (node.data.required) requiredSet.add(name)
  }
  return { properties, required: [...requiredSet] }
}

export function flowToPromptText(flow: ConversationFlow): string {
  if (flow.nodes.length === 0) return ''

  const lines: string[] = ['KONUŞMA AKIŞI:']
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

  // DFS keeps each branch together instead of interleaving
  function traverse(nodeId: string, indent: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return
    const prefix = '  '.repeat(indent)

    switch (node.type) {
      case 'START':
        lines.push(`${prefix}${step}. Karşılama mesajını söyle`)
        step++
        break
      case 'FIELD':
        lines.push(`${prefix}${step}. "${node.data.fieldName}" alanını sor${node.data.required ? ' (zorunlu)' : ''}: "${node.data.description}"`)
        step++
        break
      case 'CONDITION': {
        const field = node.data.conditionField
        const op = node.data.operator === 'equals' ? '==' : node.data.operator === 'contains' ? 'içeriyorsa' : 'boş değilse'
        const val = node.data.conditionValue || ''
        lines.push(`${prefix}${step}. KOŞUL: "${field}" ${op} "${val}" ise:`)
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
      case 'ACTION':
        lines.push(`${prefix}${step}. Tüm bilgileri topladıktan sonra randevuOlustur çağır`)
        step++
        break
      case 'END':
        return
    }

    const edges = edgeMap.get(nodeId) || []
    for (const e of edges) {
      if (!visited.has(e.target)) {
        traverse(e.target, indent)
      }
    }
  }

  traverse(startNode.id, 0)
  
  // Ayrıca START düğümüne bağlı olmayan (bağımsız) akış parçalarını da işle
  const unvisitedRoots = flow.nodes.filter(n => !visited.has(n.id) && !flow.edges.some(e => e.target === n.id))
  for (const root of unvisitedRoots) {
    if (root.type !== 'END') { // END düğümleri tek başına anlam ifade etmez
      lines.push(`\nBAĞIMSIZ AKIŞ KURALI (Şartlar sağlanırsa çalıştır):`)
      traverse(root.id, 0)
    }
  }

  return lines.join('\n')
}
