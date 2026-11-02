import { expect, test } from 'bun:test'
import { validateConversationFlow } from '../../services/flow-validation'
import type { FlowEdge, FlowNode } from './flows'

const start: FlowNode = { id: 'start', type: 'START', position: { x: 0, y: 0 }, data: {} }
const end: FlowNode = { id: 'end', type: 'END', position: { x: 0, y: 1 }, data: {} }

test('akış doğrulaması eksik koşul yolunu kullanıcıya anlaşılır biçimde bildirir', () => {
  const condition: FlowNode = { id: 'kosul', type: 'CONDITION', position: { x: 0, y: 1 }, data: { conditionField: 'telefon', operator: 'notEmpty' } }
  const edges: FlowEdge[] = [
    { id: 'a', source: 'start', target: 'kosul' },
    { id: 'b', source: 'kosul', target: 'end', sourceHandle: 'true' },
  ]
  expect(validateConversationFlow([start, condition, end], edges)).toContainEqual(expect.objectContaining({ nodeId: 'kosul', level: 'error' }))
})

test('bağımsız aktarım tetikleyicisi kullanılmayan adım uyarısı oluşturmaz', () => {
  const transfer: FlowNode = { id: 'aktar', type: 'ACTION', position: { x: 1, y: 1 }, data: { action: 'transfer_call', triggerKeywords: 'yetkili' } }
  const issues = validateConversationFlow([start, end, transfer], [{ id: 'a', source: 'start', target: 'end' }])
  expect(issues.some(issue => issue.nodeId === 'aktar' && issue.level === 'warning')).toBe(false)
})

test('user_intent koşulu ve webhook aksiyonu doğrulama ve prompt üretiminde desteklenir', () => {
  const intentCond: FlowNode = {
    id: 'intent_node',
    type: 'CONDITION',
    position: { x: 0, y: 1 },
    data: { conditionField: 'user_intent', operator: 'intent', conditionValue: 'Yetkiliyle görüşmek istiyor' },
  }
  const webhookAction: FlowNode = {
    id: 'webhook_node',
    type: 'ACTION',
    position: { x: 0, y: 2 },
    data: { action: 'webhook' },
  }
  const edges: FlowEdge[] = [
    { id: 'e1', source: 'start', target: 'intent_node' },
    { id: 'e2', source: 'intent_node', target: 'webhook_node', sourceHandle: 'true' },
    { id: 'e3', source: 'intent_node', target: 'end', sourceHandle: 'false' },
    { id: 'e4', source: 'webhook_node', target: 'end' },
  ]
  // Eski webhook node'u yayını engellemez; yalnızca uyarı üretir.
  const issues = validateConversationFlow([start, intentCond, webhookAction, end], edges)
  expect(issues.filter(i => i.level === 'error')).toHaveLength(0)
  expect(issues).toContainEqual(expect.objectContaining({ nodeId: 'webhook_node', level: 'warning' }))
})
