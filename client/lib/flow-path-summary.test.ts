import { describe, expect, it } from 'vitest'
import {
  MAX_PATHS,
  describeCondition,
  flowGraphHash,
  simplifyPaths,
  summarizeFlow,
  type FlowEdgeLike,
  type FlowNodeLike,
} from './flow-path-summary'

const cond = (id: string, data: Record<string, any>): FlowNodeLike => ({ id, type: 'conditionNode', data })
const act = (id: string, data: Record<string, any> = { action: 'end_call' }): FlowNodeLike => ({ id, type: 'actionNode', data })
const edge = (source: string, target: string, sourceHandle?: string): FlowEdgeLike => ({ source, target, sourceHandle })
const start: FlowNodeLike = { id: 's', type: 'startNode', data: { label: 'Başla' } }

describe('flow-path-summary', () => {
  it('kayıtlı / kayıtsız dalını Türkçe anlatır', () => {
    const nodes = [start, cond('c', { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true' }), act('a1'), act('a2', { action: 'transfer_call' })]
    const edges = [edge('s', 'c'), edge('c', 'a1', 'true'), edge('c', 'a2', 'false')]
    const sum = summarizeFlow(nodes, edges)
    expect(sum.a1.when[0]).toContain('Kayıtlı hasta mı? Evet')
    expect(sum.a2.when[0]).toContain('Kayıtlı hasta mı? Hayır')
    expect(sum.c.next).toHaveLength(2)
    expect(JSON.stringify(sum)).not.toMatch(/==|!=|AND|OR\b|caller\./)
  })

  it('saat aralığını anlatır', () => {
    const text = describeCondition({ conditionField: 'time.hour', operator: 'between', conditionValue: '9', conditionValueTo: '18' })
    expect(text).toBe('Saat 09–18 arasındaysa')
  })

  it('ulaşılamayan adımı uyarıyla işaretler', () => {
    const nodes = [start, act('a1'), act('orphan')]
    const sum = summarizeFlow(nodes, [edge('s', 'a1')])
    expect(sum.orphan.reachable).toBe(false)
    expect(sum.orphan.warnings.join(' ')).toContain('hiçbir yoldan gelinmiyor')
    expect(sum.a1.reachable).toBe(true)
  })

  it('döngüde sonsuza gitmez ve uyarı verir', () => {
    const nodes = [start, { id: 'f', type: 'fieldNode', data: { label: 'Ad', fieldName: 'musteri_adi' } }, cond('c', { conditionField: 'musteri_adi', operator: 'notEmpty' })]
    const edges = [edge('s', 'f'), edge('f', 'c'), edge('c', 'f', 'false')]
    const sum = summarizeFlow(nodes, edges)
    expect(sum.f.warnings.join(' ')).toContain('döngü')
    expect(sum.c.warnings.join(' ')).toContain('döngü')
  })

  it('tamamlayıcı yolları sadeleştirir (A ve B + A ve B değil → A)', () => {
    const nodes = [
      start,
      cond('c1', { conditionField: 'caller.isVip', operator: 'equals', conditionValue: 'true' }),
      cond('c2', { conditionField: 'clinic.isOpen', operator: 'equals', conditionValue: 'true' }),
      act('x'),
    ]
    const edges = [edge('s', 'c1'), edge('c1', 'c2', 'true'), edge('c2', 'x', 'true'), edge('c2', 'x', 'false')]
    const sum = summarizeFlow(nodes, edges)
    expect(sum.x.when).toHaveLength(1)
    expect(sum.x.when[0]).toContain('Özel hattan mı arıyor? Evet')
    expect(sum.x.when[0]).not.toContain('Klinik')
  })

  it('her koşulda gelinen adım için "Her durumda" yazar', () => {
    const nodes = [start, cond('c', { conditionField: 'caller.isVip', operator: 'equals', conditionValue: 'true' }), act('x')]
    const edges = [edge('s', 'c'), edge('c', 'x', 'true'), edge('c', 'x', 'false')]
    expect(summarizeFlow(nodes, edges).x.when).toEqual(['Her durumda'])
  })

  it('ve / veya bağlacını Türkçe yazar', () => {
    const data = {
      conditionLogic: 'OR',
      rules: [
        { field: 'caller.isVip', operator: 'equals', value: 'true' },
        { field: 'time.hour', operator: 'gte', value: '18' },
      ],
    }
    const text = describeCondition(data)
    expect(text).toContain(' veya ')
    expect(describeCondition({ ...data, conditionLogic: 'AND' })).toContain(' ve ')
  })

  it('olayla tetiklenen aksiyonu ulaşılabilir sayar', () => {
    const nodes = [start, act('ev', { action: 'send_sms', eventTrigger: 'on_silence' })]
    const sum = summarizeFlow(nodes, [])
    expect(sum.ev.reachable).toBe(true)
    expect(sum.ev.when[0]).toContain('Sessiz kalındığında')
  })

  it('eski webhook adımını desteklenmiyor diye işaretler', () => {
    const nodes = [start, act('w', { action: 'webhook', webhookUrl: 'x' })]
    const sum = summarizeFlow(nodes, [edge('s', 'w')])
    expect(sum.w.warnings.join(' ')).toContain('artık desteklenmiyor')
    expect(sum.w.does).not.toMatch(/webhook/i)
  })

  it('200 yol sınırını uygular', () => {
    // 9 ardışık koşul, iki dal da bir sonrakine → 2^9 yol; sınır devreye girmeli.
    const nodes: FlowNodeLike[] = [start]
    const edges: FlowEdgeLike[] = [edge('s', 'c0')]
    for (let i = 0; i < 10; i++) {
      nodes.push(cond(`c${i}`, { conditionField: 'time.hour', operator: 'gt', conditionValue: String(i) }))
      edges.push(edge(`c${i}`, `c${i + 1}`, 'true'), edge(`c${i}`, `c${i + 1}`, 'false'))
    }
    nodes.push(act('c10'))
    const sum = summarizeFlow(nodes, edges)
    expect(sum.c10.truncated).toBe(true)
    expect(sum.c10.warnings.join(' ')).toContain(String(MAX_PATHS))
  })

  it('çelişkili yolları atar ve yinelenenleri tekilleştirir', () => {
    const a = { id: 'k#0', positive: true, text: 'A' }
    const notA = { ...a, positive: false, text: 'A değil' }
    expect(simplifyPaths([[a, notA], [a], [a]])).toHaveLength(1)
  })

  it('yapı aynı kaldıkça parmak izi değişmez, konum ve geçici alanlar sayılmaz', () => {
    const n1 = [{ id: 'a', type: 'actionNode', data: { action: 'end_call', _issue: 1 } }]
    const n2 = [{ id: 'a', type: 'actionNode', data: { action: 'end_call' } }]
    expect(flowGraphHash(n1, [])).toBe(flowGraphHash(n2, []))
    expect(flowGraphHash(n1, [])).not.toBe(flowGraphHash([{ id: 'a', type: 'actionNode', data: { action: 'transfer_call' } }], []))
  })
})
