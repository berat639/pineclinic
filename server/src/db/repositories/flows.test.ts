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
