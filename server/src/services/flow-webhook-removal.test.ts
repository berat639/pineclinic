import { expect, test } from 'bun:test'
import { isRemovedWebhookAction, validateConversationFlow } from './flow-validation'
import type { FlowEdge, FlowNode } from '../db/repositories/flows'

test('eski webhook ACTION node\'u pas geçilecek olarak tanınır', () => {
  expect(isRemovedWebhookAction({ type: 'ACTION', data: { action: 'webhook' } })).toBe(true)
  expect(isRemovedWebhookAction({ type: 'ACTION', data: { action: 'set_variable' } })).toBe(false)
  expect(isRemovedWebhookAction({ type: 'END', data: {} })).toBe(false)
})

test('webhook node doğrulamada yalnız uyarı üretir, hata üretmez', () => {
  const start: FlowNode = { id: 's', type: 'START', position: { x: 0, y: 0 }, data: {} }
  const wh: FlowNode = { id: 'w', type: 'ACTION', position: { x: 0, y: 1 }, data: { action: 'webhook' } }
  const end: FlowNode = { id: 'e', type: 'END', position: { x: 0, y: 2 }, data: {} }
  const edges: FlowEdge[] = [
    { id: '1', source: 's', target: 'w' },
    { id: '2', source: 'w', target: 'e' },
  ]
  const issues = validateConversationFlow([start, wh, end], edges)
  expect(issues.filter(i => i.level === 'error')).toHaveLength(0)
  expect(issues).toContainEqual(expect.objectContaining({ nodeId: 'w', level: 'warning' }))
})
