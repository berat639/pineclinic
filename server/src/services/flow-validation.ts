import type { FlowEdge, FlowNode } from '../db/repositories/flows'

export type FlowValidationIssue = { nodeId?: string; level: 'error' | 'warning'; message: string }

const EXECUTABLE_ACTIONS = new Set([
  'save_appointment_pending', 'randevuOlustur', 'save_patient_note', 'notBirak',
  'transfer_call', 'transfer', 'end_call', 'send_wa_message', 'send_wa_location', 'save_record', 'webhook',
])

/** Pure graph validation. It reports issues and never mutates a saved flow. */
export function validateConversationFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = []; const ids = new Set<string>(); const nodeMap = new Map<string, FlowNode>()
  for (const node of nodes) { if (!node.id || ids.has(node.id)) issues.push({ nodeId: node.id, level: 'error', message: 'Her adımın farklı bir kimliği olmalıdır.' }); ids.add(node.id); nodeMap.set(node.id, node) }
  const starts = nodes.filter(node => node.type === 'START')
  if (starts.length !== 1) issues.push({ level: 'error', message: starts.length === 0 ? 'Görüşmenin başlayacağı bir karşılama adımı seçin.' : 'Yalnızca bir karşılama adımı kullanın.' })
  const outgoing = new Map<string, FlowEdge[]>()
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) { issues.push({ nodeId: edge.source, level: 'error', message: 'Bu bağlantının bağlı olduğu adım bulunamadı.' }); continue }
    const list = outgoing.get(edge.source) || []; list.push(edge); outgoing.set(edge.source, list)
  }
  for (const node of nodes) {
    const next = outgoing.get(node.id) || []
    if (node.type === 'FIELD') {
      if (!node.data.fieldName || !String(node.data.fieldName).trim()) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Bu adımda istenecek bilgi alanını seçin.' })
      }
    }
    if (node.type === 'CONDITION') {
      if (!node.data.conditionField || !node.data.operator) issues.push({ nodeId: node.id, level: 'error', message: 'Yönlendirme için kontrol edilecek bilgiyi seçin.' })
      else if ((node.data.conditionField === 'user_intent' || node.data.operator === 'intent') && !String(node.data.conditionValue || '').trim()) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Yapay zekanın algılayacağı niyeti veya isteği açıklayın.' })
      }
      if (next.filter(edge => edge.sourceHandle === 'true').length !== 1 || next.filter(edge => edge.sourceHandle === 'false').length !== 1) issues.push({ nodeId: node.id, level: 'error', message: 'Koşul sağlanırsa ve sağlanmazsa gidilecek birer adım bağlayın.' })
    } else if (node.type !== 'END' && next.length > 1) issues.push({ nodeId: node.id, level: 'error', message: 'Bu adımdan sonra yalnızca bir devam yolu bağlayın.' })
    if (node.type === 'ACTION') {
      if (!node.data.action || !EXECUTABLE_ACTIONS.has(node.data.action)) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Bu işlem için gerekli bağlantı henüz hazır değil.' })
      } else if (node.data.action === 'webhook') {
        const url = String(node.data.webhookUrl || '').trim()
        if (!url || !/^https?:\/\/.+/i.test(url)) {
          issues.push({ nodeId: node.id, level: 'error', message: 'Webhook işlemi için geçerli bir URL (https://...) girin.' })
        }
      }
    }
  }
  if (starts.length === 1) {
    const reached = new Set<string>(); const stack = [starts[0].id]
    while (stack.length) { const id = stack.pop()!; if (reached.has(id)) continue; reached.add(id); for (const edge of outgoing.get(id) || []) stack.push(edge.target) }
    for (const node of nodes) if (!(node.type === 'ACTION' && node.data.triggerKeywords) && !reached.has(node.id)) issues.push({ nodeId: node.id, level: 'warning', message: 'Bu adım karşılama adımından sonra kullanılmıyor.' })
  }
  return issues
}
