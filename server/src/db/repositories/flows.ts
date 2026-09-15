import { and, eq, sql as drizzleSql } from 'drizzle-orm'
import { db } from '../client'
import { conversationFlows } from '../schema'
import { requireClinicId } from '../../tenancy/context'

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

export async function getActiveFlow(direction: string = 'inbound'): Promise<ConversationFlow | null> {
  const clinicId = requireClinicId()
  const rows = await db
    .select()
    .from(conversationFlows)
    .where(and(eq(conversationFlows.clinicId, clinicId), eq(conversationFlows.isActive, true), eq(conversationFlows.direction, direction)))
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

export async function saveFlow(nodes: FlowNode[], edges: FlowEdge[], direction: string = 'inbound'): Promise<ConversationFlow> {
  const clinicId = requireClinicId()
  const existing = await getActiveFlow(direction)
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

/**
 * Akış yalnızca karşılama ve bitişten oluşuyorsa modelin randevu akışını
 * kendiliğinden başlatmasına izin verilmez. Bu, Flow Builder'daki minimal
 * akışın varsayılan randevu prompt'ları tarafından ezilmesini önler.
 */
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

  // DFS keeps each branch together instead of interleaving
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
      case 'ACTION': {
        const act = (node.data as Record<string, unknown>).action
        const target = (node.data as Record<string, unknown>).transferNumber || ''
        const keywords = (node.data as Record<string, unknown>).triggerKeywords || ''
        if (act === 'transfer_call') {
          lines.push(`${prefix}${step}. ARAMAYI AKTAR: ŞU AN aramaAktar aracını çağır ve "hedef" parametresine "${target}" değerini yaz.${keywords ? ` Müşteri "${keywords}" kelimelerini söylerse de derhal aktar.` : ''}`)
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
        } else {
          lines.push(`${prefix}${step}. Randevu bilgilerini toplayıp randevuOlustur aracını çağır.`)
        }
        step++
        break
      }
      case 'END':
        lines.push(`${prefix}${step}. Görüşmeyi nazikçe tamamla ve veda et.`)
        step++
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
  
  // ── Global Tetikleyiciler (Bağımsız veya Bağlı Kalan Tüm Aksiyonlar) ──
  const globalActions = flow.nodes.filter(n => n.type === 'ACTION' && (n.data as any).triggerKeywords)
  if (globalActions.length > 0) {
    lines.push('\n⚡ GLOBAL TETİKLEYİCİLER (Görüşmenin HERHANGİ bir anında geçerlidir):')
    for (const node of globalActions) {
      const act = (node.data as Record<string, unknown>).action
      const target = (node.data as Record<string, unknown>).transferNumber || ''
      const keywords = (node.data as Record<string, unknown>).triggerKeywords || ''
      
      if (act === 'transfer_call') {
        lines.push(`- Eğer müşteri "${keywords}" ifadelerini kullanır veya ima ederse, akışı derhal kesip aramaAktar aracını çağır ve "hedef" parametresini "${target}" yap.`)
      } else if (act === 'send_wa_location') {
        lines.push(`- Eğer müşteri "${keywords}" ifadelerini kullanır veya konum/adres/yol tarifi isterse, akışı derhal kesip whatsappKonumGonder aracını çağır. Başarılı sonuçtan sonra konumu WhatsApp'tan gönderdiğini söyle.`)
      } else if (act === 'end_call') {
        const msg = (node.data as Record<string, unknown>).message || ''
        lines.push(`- Eğer müşteri "${keywords}" ifadelerini kullanırsa, akışı derhal kesip cagriySonlandir() aracını çağır. ${msg ? `Öncesinde "${msg}" de.` : ''}`)
      }
    }
  }

  // Ayrıca START düğümüne bağlı olmayan (bağımsız) akış parçalarını da işle
  const unvisitedRoots = flow.nodes.filter(n => !visited.has(n.id) && !flow.edges.some(e => e.target === n.id))
  for (const root of unvisitedRoots) {
    if (root.type !== 'END') {
      lines.push(`\nBAĞIMSIZ AKIŞ KURALI:`)
      traverse(root.id, 0)
    }
  }

  // Minimal karşılama → bitiş akışı, varsayılan randevu sorularını başlatmaz.
  if (isMinimalGreetingEndFlow(flow)) {
    lines.push(`\nMİNİMAL AKIŞ KURALI:\nKarşılama mesajını yalnızca bir kez söyle. Sonra karşı tarafın konuşmasını bekle; kendiliğinden randevu, şikayet, tarih, saat veya başka soru sorma. Karşı taraf bir soru sorarsa yalnızca o soruya kısa cevap ver ve yeni konu başlatma. Akışta başka adım olmadığı için görüşmeyi kendi kendine uzatma.`)
  // Eğer akışta sadece START düğümü varsa veya akış bittikten sonra:
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
