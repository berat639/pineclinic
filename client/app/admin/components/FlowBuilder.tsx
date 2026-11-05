'use client'
// @ts-nocheck — xyflow generics conflict with strict mode, pre-existing
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
   type ReactFlowInstance,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { PhoneMaskedInput } from '@/lib/phone-mask'
import NodeInfoBadge from './flow/NodeInfoBadge'
import SimulatorVoicePanel from './flow/SimulatorVoicePanel'
import {
  summarizeFlow,
  flowGraphHash,
  describeCondition,
  type NodeSummary,
} from '@/lib/flow-path-summary'
import {
  FIELD_LABELS,
  LOGIC_LABELS,
  operatorOptions,
  actionLabel,
} from '@/lib/ui-glossary'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FlowIssue {
  nodeId?: string
  level: 'error' | 'warning'
  message: string
}

interface BaseNodeTransient {
  _issue?: FlowIssue
  _simStatus?: 'active' | 'visited'
  _onDuplicate?: (id: string) => void
  _onDelete?: (id: string) => void
  _canDelete?: boolean
  _summary?: NodeSummary
  _explain?: (nodeId: string) => Promise<string | null>
}

interface FieldData extends BaseNodeTransient {
  [key: string]: unknown
  label: string
  fieldName: string
  description: string
  required: boolean
  fieldType: 'text' | 'date' | 'time' | 'enum' | 'user'
  enumValues?: string[]
}

interface ConditionData extends BaseNodeTransient {
  [key: string]: unknown
  label: string
  conditionField: string
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'regex'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'in'
    | 'isEmpty'
    | 'notEmpty'
    | 'intent'
  conditionValue: string
  conditionValueTo?: string
  conditionLogic?: 'AND' | 'OR'
  rules?: Array<{ field: string; operator: string; value?: string; valueTo?: string }>
}

interface ActionData extends BaseNodeTransient {
  [key: string]: unknown
  label: string
  action: string
  message?: string
  variableName?: string
  variableValue?: string
  promptInstruction?: string
  eventTrigger?: string
  transferNumber?: string
  triggerKeywords?: string
  requireConfirmation?: boolean
  confirmationQuestion?: string
}

interface StartData extends BaseNodeTransient {
  [key: string]: unknown
  label: string
}

interface EndData extends BaseNodeTransient {
  [key: string]: unknown
  label: string
  message?: string
}

// ── Preset Fields ─────────────────────────────────────────────────────────────
const PRESET_FIELDS: Array<{
  value: string
  label: string
  type: 'text' | 'date' | 'time' | 'enum' | 'user'
  desc: string
  group: 'inbound' | 'outbound'
  samples: string[]
}> = [
  { value: 'musteri_adi', label: 'Hasta Adı ve Soyadı', type: 'text', desc: 'Adınızı ve soyadınızı alabilir miyim?', group: 'inbound', samples: ['Ahmet Yılmaz', 'Zeynep Kaya'] },
  { value: 'telefon', label: 'Telefon Numarası', type: 'text', desc: 'Size ulaşabileceğimiz telefon numaranızı alabilir miyim?', group: 'inbound', samples: ['05321234567', '05449876543'] },
  { value: 'sikayet', label: 'Hasta Şikâyeti / Talebi', type: 'text', desc: 'Şikâyetiniz veya randevu talebiniz nedir?', group: 'inbound', samples: ['Diş ağrısı ve kontrol', 'İmplant muayenesi', 'Diş taşı temizliği'] },
  { value: 'tarih', label: 'Randevu Tarihi', type: 'date', desc: 'Hangi tarihe randevu oluşturmak istersiniz?', group: 'inbound', samples: ['2026-11-05', '2026-11-10'] },
  { value: 'saat', label: 'Randevu Saati', type: 'time', desc: 'Saat kaç için randevu istersiniz?', group: 'inbound', samples: ['10:30', '14:00', '16:30'] },
  { value: 'doktor_id', label: 'Doktor Seçimi', type: 'user', desc: 'Hangi doktora gelmek istersiniz?', group: 'inbound', samples: ['Dr. Emre Bey', 'Farketmez'] },
  { value: 'islem_turu', label: 'İşlem Türü', type: 'text', desc: 'Hangi işlem için randevu almak istiyorsunuz?', group: 'inbound', samples: ['Kanal tedavisi', 'Muayene'] },
  { value: 'memnuniyet', label: 'Memnuniyet Durumu (Anket)', type: 'text', desc: 'Son kliniğimize ziyaretinizden ve tedavinizden memnun kaldınız mı?', group: 'outbound', samples: ['Evet, çok memnun kaldım', 'Biraz ağrım devam ediyor'] },
  { value: 'puan', label: 'Değerlendirme Puanı (1-10)', type: 'text', desc: 'Hizmetimizi 1 ile 10 arasında değerlendirecek olsanız kaç puan verirsiniz?', group: 'outbound', samples: ['10', '9', '7'] },
  { value: 'hastaNotu', label: 'Hasta Notu / Önerisi', type: 'text', desc: 'Bizlere iletmek istediğiniz özel bir notunuz veya öneriniz var mı?', group: 'outbound', samples: ['Teşekkür ederim, her şey çok iyiydi', 'Kontrol randevusu rica ediyorum'] },
]

const ACTION_LABELS: Record<string, string> = {
  save_appointment_pending: '📝 Randevu Talebi Oluştur (Onay Bekler)',
  randevuOlustur: '📝 Randevu Oluştur',
  save_patient_note: '🗒️ Hastadan Not Al (Bankoya İlet)',
  notBirak: '🗒️ Anket / Hasta Notu Kaydet',
  set_variable: `🔧 ${actionLabel('set_variable')}`,
  send_sms: `💬 ${actionLabel('send_sms')}`,
  wait_reprompt: `⏳ ${actionLabel('wait_reprompt')}`,
  wait: `⏳ ${actionLabel('wait_reprompt')}`,
  switch_prompt: `🔄 ${actionLabel('switch_prompt')}`,
  end_call: '👋 Bilgi Ver ve Görüşmeyi Bitir',
  transfer_call: '📞 Aramayı Yetkiliye Aktar',
  transfer: '📞 Canlı Desteğe Aktar',
  send_wa_location: '📍 WhatsApp’tan Konum Gönder',
  send_wa_message: '📱 WhatsApp Mesajı Gönder',
  save_record: '💾 Veritabanına Kaydet',
}

/** Eski akışlardan kalan, artık desteklenmeyen dış bağlantı adımı. */
const LEGACY_WEBHOOK_MESSAGE = 'Bu adım artık desteklenmiyor, silin.'

// ── Client-Side Validation & Prompt Builder ───────────────────────────────────
const EXECUTABLE_ACTIONS = new Set([
  'save_appointment_pending', 'randevuOlustur', 'save_patient_note', 'notBirak',
  'transfer_call', 'transfer', 'end_call', 'send_wa_message', 'send_wa_location', 'save_record',
  'set_variable', 'send_sms', 'wait_reprompt', 'wait', 'switch_prompt',
])

function validateFlowClient(nodes: Node[], edges: Edge[]): FlowIssue[] {
  const issues: FlowIssue[] = []
  const ids = new Set<string>()
  const nodeMap = new Map<string, Node>()

  for (const node of nodes) {
    if (!node.id || ids.has(node.id)) {
      issues.push({ nodeId: node.id, level: 'error', message: 'Her adımın farklı bir kimliği olmalıdır.' })
    }
    ids.add(node.id)
    nodeMap.set(node.id, node)
  }

  const starts = nodes.filter(n => n.type === 'startNode')
  if (starts.length !== 1) {
    issues.push({ level: 'error', message: starts.length === 0 ? 'Görüşmenin başlayacağı bir karşılama adımı seçin.' : 'Yalnızca bir karşılama adımı kullanın.' })
  }

  const outgoing = new Map<string, Edge[]>()
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      issues.push({ nodeId: edge.source, level: 'error', message: 'Bu bağlantının bağlı olduğu adım bulunamadı.' })
      continue
    }
    const list = outgoing.get(edge.source) || []
    list.push(edge)
    outgoing.set(edge.source, list)
  }

  for (const node of nodes) {
    const next = outgoing.get(node.id) || []
    const d = (node.data || {}) as Record<string, any>

    if (node.type === 'fieldNode') {
      if (!d.fieldName || !String(d.fieldName).trim()) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Bu adımda istenecek bilgi alanını seçin.' })
      }
      if (next.length === 0) {
        issues.push({ nodeId: node.id, level: 'warning', message: 'Bu bilgi adımından sonra gidilecek bir adım bağlanmadı.' })
      }
    }

    if (node.type === 'conditionNode') {
      if (!d.conditionField || !d.operator) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Yönlendirme için kontrol edilecek bilgiyi seçin.' })
      } else if ((d.conditionField === 'user_intent' || d.operator === 'intent') && !String(d.conditionValue || '').trim()) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Yapay zekanın algılayacağı niyeti veya isteği açıklayın.' })
      }
      if (next.filter(e => e.sourceHandle === 'true').length !== 1 || next.filter(e => e.sourceHandle === 'false').length !== 1) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Koşul sağlanırsa (Evet) ve sağlanmazsa (Hayır) gidilecek birer adım bağlayın.' })
      }
    } else if (node.type !== 'endNode' && next.length > 1) {
      issues.push({ nodeId: node.id, level: 'error', message: 'Bu adımdan sonra yalnızca bir devam yolu bağlayın.' })
    }

    if (node.type === 'actionNode') {
      if (d.action === 'webhook') {
        issues.push({ nodeId: node.id, level: 'error', message: LEGACY_WEBHOOK_MESSAGE })
      } else if (!d.action || !EXECUTABLE_ACTIONS.has(String(d.action))) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Bu işlem için geçerli bir işlem tipi seçin.' })
      }
    }
  }

  if (starts.length === 1) {
    const reached = new Set<string>()
    const stack = [starts[0].id]
    while (stack.length) {
      const id = stack.pop()!
      if (reached.has(id)) continue
      reached.add(id)
      for (const edge of outgoing.get(id) || []) stack.push(edge.target)
    }
    for (const node of nodes) {
      const d = (node.data || {}) as Record<string, any>
      if (!(node.type === 'actionNode' && (d.triggerKeywords || d.eventTrigger)) && !reached.has(node.id)) {
        issues.push({ nodeId: node.id, level: 'warning', message: 'Bu adım karşılama adımından sonra hiçbir yola bağlı değil.' })
      }
    }
  }

  return issues
}

function buildPromptPreview(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return 'Akışta henüz düğüm bulunmuyor.'
  const lines: string[] = [
    'KONUŞMA AKIŞI VE TALİMATLARI:',
    '⚠️ SIRA VE BEKLEME KURALI: Her adımda yalnızca TEK BİR soru sor. Her sorudan sonra DUR ve müşterinin konuşmasını/cevabını bekle; müşteri yanıt vermeden KESİNLİKLE bir sonraki adıma geçme.',
    '⚡ HIZLI GEÇİŞ VE TEKRARSIZ SORU KURALI (SUNUM & CANLI GÖRÜŞME OPTİMİZASYONU): Müşteri konuşmasında aşağıdaki adımlardaki bilgilerden birini veya birkaçını (ör. işlem/şikayet, gün/tarih, saat, ad-soyad veya telefon) ZATEN söylediyse o adımı KESİNLİKLE tekrar sorma; bilinen adımları atlayıp yalnızca eksik kalan ilk bilgiyi sor. "tarih" ve "saat" peş peşe geliyorsa ve ikisi de bilinmiyorsa ayrı ayrı sormak yerine tek cümlede ("Hangi gün ve saat için randevu oluşturmamı istersiniz?") birlikte sor.',
    '',
  ]
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edgeMap = new Map<string, Edge[]>()
  for (const e of edges) {
    const list = edgeMap.get(e.source) || []
    list.push(e)
    edgeMap.set(e.source, list)
  }

  const startNode = nodes.find(n => n.type === 'startNode')
  if (!startNode) return 'Karşılama (Başlangıç) adımı bulunamadı.'

  let step = 1

  function traverse(nodeId: string, indent: number, pathVisited: Set<string> = new Set()) {
    if (step > 80) return
    const node = nodeMap.get(nodeId)
    if (!node) return
    const d = (node.data || {}) as Record<string, any>
    const prefix = '  '.repeat(indent)

    if (pathVisited.has(nodeId)) {
      lines.push(`${prefix}${step}. Döngü: "${d.fieldName || d.label || nodeId}" adımına geri dön ve müşterinin konuşmasını bekle.`)
      step++
      return
    }
    const nextPath = new Set(pathVisited)
    nextPath.add(nodeId)

    switch (node.type) {
      case 'startNode':
        lines.push(`${prefix}${step}. Karşılama mesajını söyleyerek söze başla.`)
        lines.push(`${prefix}   ↳ Müşterinin konuşmasını bekle ve ne söylediğini dinle.`)
        step++
        break
      case 'fieldNode':
        lines.push(`${prefix}${step}. "${d.fieldName || 'alan'}" bilgisini sor${d.required ? ' (zorunlu)' : ''}: "${d.description || ''}"`)
        lines.push(`${prefix}   ↳ Müşterinin konuşmasını ve cevabını bekle; cevap almadan sıradaki adıma geçme.`)
        step++
        break
      case 'conditionNode': {
        const field = d.conditionField || ''
        const val = d.conditionValue || ''
        if (field === 'user_intent' || d.operator === 'intent') {
          lines.push(`${prefix}${step}. KOŞUL (KULLANICI NİYETİ): Kullanıcının ifadesi "${val}" niyetini taşıyorsa:`)
        } else {
          lines.push(`${prefix}${step}. KOŞUL: ${describeCondition(d)} ise:`)
        }
        step++
        const nextEdges = edgeMap.get(nodeId) || []
        const trueEdge = nextEdges.find(e => e.sourceHandle === 'true')
        const falseEdge = nextEdges.find(e => e.sourceHandle === 'false')
        if (trueEdge) {
          lines.push(`${prefix}  - Evet (Yeşil Yol):`)
          traverse(trueEdge.target, indent + 2, nextPath)
        }
        if (falseEdge) {
          lines.push(`${prefix}  - Hayır (Kırmızı Yol):`)
          traverse(falseEdge.target, indent + 2, nextPath)
        }
        return
      }
      case 'actionNode': {
        const act = d.action
        if (act === 'transfer_call') {
          lines.push(`${prefix}${step}. ARAMAYI AKTAR: Hedef "${d.transferNumber || 'resepsiyon'}" (${d.requireConfirmation !== false ? 'Önce onay iste ve müşterinin cevabını bekle' : 'Doğrudan aktar'}).`)
        } else if (act === 'send_wa_location') {
          lines.push(`${prefix}${step}. WHATSAPP KONUM GÖNDER: whatsappKonumGonder aracını çağır.`)
        } else if (act === 'send_wa_message') {
          lines.push(`${prefix}${step}. WHATSAPP MESAJI GÖNDER: "${d.message || ''}"`)
        } else if (act === 'save_patient_note' || act === 'notBirak') {
          lines.push(`${prefix}${step}. HASTADAN NOT AL: hastaNotKaydet aracını çağırarak notu kaydet.`)
        } else if (act === 'end_call') {
          lines.push(`${prefix}${step}. BİLGİ VER VE BİTİR: ${d.message ? `"${d.message}" diyerek ` : ''}cagriySonlandir aracını çağır.`)
        } else if (act === 'wait_reprompt' || act === 'wait') {
          lines.push(`${prefix}${step}. BEKLE / YENİDEN SOR: "${d.message || 'Sizi dinliyorum, nasıl yardımcı olabilirim?'}"`)
          lines.push(`${prefix}   ↳ Müşterinin konuşmasını ve cevabını bekle.`)
        } else if (act === 'webhook') {
          break
        } else {
          lines.push(`${prefix}${step}. RANDEVU OLUŞTUR: Toplanan bilgilerle randevuOlustur aracını çağır.`)
        }
        step++
        break
      }
      case 'endNode':
        lines.push(`${prefix}${step}. ${d.message ? `"${d.message}" diyerek görüşmeyi` : 'Görüşmeyi'} nazikçe tamamla ve veda et.`)
        step++
        return
    }

    for (const e of edgeMap.get(nodeId) || []) {
      traverse(e.target, indent, nextPath)
    }
  }

  traverse(startNode.id, 0)

  const globalActions = nodes.filter(n => n.type === 'actionNode' && (n.data as any)?.triggerKeywords)
  if (globalActions.length > 0) {
    lines.push('\n⚡ GLOBAL TETİKLEYİCİLER (Görüşmenin herhangi bir anında geçerlidir):')
    for (const n of globalActions) {
      const d = n.data as ActionData
      lines.push(`- Müşteri "${d.triggerKeywords}" ifadelerinden birini söylerse → ${ACTION_LABELS[d.action] || d.action}`)
    }
  }

  return lines.join('\n')
}

// ── Edge Enricher (Auto-style & label Condition branches) ─────────────────────
function decorateEdges(rawEdges: Edge[], nodes: Node[], activeSimEdgeIds?: Set<string>): Edge[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  return rawEdges.map(edge => {
    const sourceNode = nodeMap.get(edge.source)
    const isSimActive = activeSimEdgeIds?.has(edge.id)
    if (sourceNode?.type === 'conditionNode') {
      const isTrue = edge.sourceHandle === 'true'
      const isFalse = edge.sourceHandle === 'false'
      const branchColor = isTrue ? '#16a34a' : isFalse ? '#dc2626' : '#64748b'
      const defaultLabel = isTrue ? 'Evet' : isFalse ? 'Hayır' : edge.label
      return {
        ...edge,
        label: edge.label ?? defaultLabel,
        animated: Boolean(isSimActive),
        style: {
          ...edge.style,
          stroke: isSimActive ? '#2563eb' : branchColor,
          strokeWidth: isSimActive ? 3.2 : 2.2,
        },
        labelStyle: { fill: isTrue ? '#15803d' : isFalse ? '#b91c1c' : 'var(--foreground)', fontWeight: 700, fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isSimActive ? '#2563eb' : branchColor },
      }
    }
    return {
      ...edge,
      animated: Boolean(isSimActive),
      style: {
        ...edge.style,
        stroke: isSimActive ? '#2563eb' : '#64748b',
        strokeWidth: isSimActive ? 3.2 : 2,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: isSimActive ? '#2563eb' : '#64748b' },
    }
  })
}

// ── Auto Layout (Dagre + Global Trigger Side Column) ──────────────────────────
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const connectedIds = new Set<string>()
  for (const e of edges) {
    connectedIds.add(e.source)
    connectedIds.add(e.target)
  }

  // Global trigger action nodes without incoming/outgoing edges go into a clean right column
  const standaloneTriggers = nodes.filter(
    n => n.type === 'actionNode' && (n.data as any)?.triggerKeywords && !connectedIds.has(n.id)
  )
  const standaloneSet = new Set(standaloneTriggers.map(n => n.id))
  const mainNodes = nodes.filter(n => !standaloneSet.has(n.id))

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 75, ranksep: 95, marginx: 30, marginy: 30 })

  for (const n of mainNodes) {
    const height = n.type === 'startNode' || n.type === 'endNode' ? 54 : n.type === 'conditionNode' ? 104 : 96
    const width = n.type === 'startNode' || n.type === 'endNode' ? 200 : 264
    g.setNode(n.id, { width, height })
  }
  for (const e of edges) {
    if (!standaloneSet.has(e.source) && !standaloneSet.has(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }
  dagre.layout(g)

  let maxRight = 400
  const positionedMain = mainNodes.map(n => {
    const pos = g.node(n.id)
    const width = n.type === 'startNode' || n.type === 'endNode' ? 200 : 264
    const height = n.type === 'startNode' || n.type === 'endNode' ? 54 : n.type === 'conditionNode' ? 104 : 96
    const x = Math.round((pos?.x ?? 200) - width / 2)
    const y = Math.round((pos?.y ?? 100) - height / 2)
    if (x + width > maxRight) maxRight = x + width
    return { ...n, position: { x, y } }
  })

  const positionedStandalone = standaloneTriggers.map((n, idx) => ({
    ...n,
    position: { x: maxRight + 80, y: 40 + idx * 120 },
  }))

  return [...positionedMain, ...positionedStandalone]
}

// ── Shared Node Wrapper Helper ────────────────────────────────────────────────
function NodeQuickActions({
  id,
  selected,
  issue,
  simStatus,
  canDuplicate,
  canDelete,
  onDuplicate,
  onDelete,
}: {
  id: string
  selected?: boolean
  issue?: FlowIssue
  simStatus?: 'active' | 'visited'
  canDuplicate?: boolean
  canDelete?: boolean
  onDuplicate?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <>
      {/* Validation Issue Badge */}
      {issue && (
        <div
          title={issue.message}
          style={{
            position: 'absolute',
            top: -10,
            left: 10,
            zIndex: 5,
            padding: '2px 7px',
            borderRadius: 10,
            fontSize: 9,
            fontWeight: 800,
            background: issue.level === 'error' ? '#dc2626' : '#d97706',
            color: '#ffffff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span style={{ color: '#ffffff' }}>{issue.level === 'error' ? '✕ Hata' : '⚠ Uyarı'}</span>
        </div>
      )}

      {/* Simulation Active Badge */}
      {simStatus === 'active' && (
        <div
          style={{
            position: 'absolute',
            top: -11,
            right: 10,
            zIndex: 6,
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 9,
            fontWeight: 800,
            background: '#16a34a',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(22,163,74,0.45)',
          }}
        >
          <span style={{ color: '#ffffff' }}>● Aktif Adım</span>
        </div>
      )}

      {/* Floating Quick Toolbar when selected */}
      {selected && (canDuplicate || canDelete) && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: -32,
            right: 0,
            zIndex: 10,
            display: 'flex',
            gap: 4,
            background: 'var(--card-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: 8,
            padding: '3px 5px',
            boxShadow: 'var(--pc-neo-card)',
          }}
        >
          {canDuplicate && onDuplicate && (
            <button
              type="button"
              onClick={() => onDuplicate(id)}
              title="Düğümü Kopyala"
              style={{
                padding: '2px 7px',
                borderRadius: 5,
                border: '1px solid var(--input-border)',
                background: 'var(--card-inner)',
                color: 'var(--foreground)',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⧉ Kopyala
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(id)}
              title="Düğümü Sil"
              style={{
                padding: '2px 7px',
                borderRadius: 5,
                border: '1px solid #dc2626',
                background: 'var(--flow-danger-bg)',
                color: '#dc2626',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🗑️ Sil
            </button>
          )}
        </div>
      )}
    </>
  )
}

const HANDLE_BASE_STYLE: React.CSSProperties = {
  width: 12,
  height: 12,
  border: '2px solid var(--card-bg)',
}

// ── Custom Nodes ──────────────────────────────────────────────────────────────
function StartNode({ id, data, selected }: { id: string; data: StartData; selected?: boolean }) {
  const isSim = data._simStatus === 'active'
  return (
    <div
      style={{
        position: 'relative',
        padding: '11px 22px',
        borderRadius: 24,
        background: '#16a34a',
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'center',
        minWidth: 190,
        border: selected ? '2.5px solid #2563eb' : isSim ? '2.5px solid #ffffff' : '2px solid #15803d',
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,0.32), var(--pc-neo-card)'
          : isSim
          ? '0 0 0 5px rgba(22,163,74,0.45)'
          : 'var(--pc-neo-card)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <NodeQuickActions id={id} selected={selected} issue={data._issue} simStatus={data._simStatus} />
      <NodeInfoBadge nodeId={id} summary={data._summary} explain={data._explain} />
      <span style={{ color: '#ffffff' }}>▶ {data.label || 'Karşılama Mesajı'}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ ...HANDLE_BASE_STYLE, background: '#16a34a', bottom: -7 }}
      />
    </div>
  )
}

function FieldNode({ id, data, selected }: { id: string; data: FieldData; selected?: boolean }) {
  const fieldInfo = PRESET_FIELDS.find(f => f.value === data.fieldName)
  const displayLabel = fieldInfo ? fieldInfo.label : (data.fieldName ? `${data.fieldName} (Özel)` : 'Alan Seçilmedi')
  const isSim = data._simStatus === 'active'
  const isVisited = data._simStatus === 'visited'

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--flow-node-field)',
        border: selected
          ? '2px solid #2563eb'
          : isSim
          ? '2px solid #16a34a'
          : data._issue?.level === 'error'
          ? '2px solid #dc2626'
          : '1.5px solid var(--flow-node-field-border)',
        minWidth: 244,
        maxWidth: 270,
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,0.25), var(--pc-neo-card)'
          : isSim
          ? '0 0 0 4px rgba(22,163,74,0.35), var(--pc-neo-card)'
          : 'var(--pc-neo-card)',
        opacity: isVisited && !isSim ? 0.92 : 1,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <NodeQuickActions
        id={id}
        selected={selected}
        issue={data._issue}
        simStatus={data._simStatus}
        canDuplicate
        canDelete
        onDuplicate={data._onDuplicate}
        onDelete={data._onDelete}
      />
      <NodeInfoBadge nodeId={id} summary={data._summary} explain={data._explain} />
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...HANDLE_BASE_STYLE, background: 'var(--flow-node-field-border)', top: -7 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--flow-node-field-text)',
            background: 'var(--card-bg)',
            border: '1px solid var(--flow-node-field-border)',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          📥 {displayLabel}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {data.required && (
            <span style={{ fontSize: 9, padding: '2px 6px', background: '#ea580c', borderRadius: 8, color: '#ffffff', fontWeight: 700 }}>
              <span style={{ color: '#ffffff' }}>zorunlu</span>
            </span>
          )}
          {data.fieldType && data.fieldType !== 'text' && (
            <span style={{ fontSize: 9, padding: '2px 6px', background: '#2563eb', borderRadius: 8, color: '#ffffff', fontWeight: 700 }}>
              <span style={{ color: '#ffffff' }}>{{ date: 'Tarih', time: 'Saat', enum: 'Seçenek', user: 'Hekim' }[data.fieldType] || data.fieldType}</span>
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--foreground)',
          lineHeight: 1.4,
          background: 'var(--card-bg)',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--input-border)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {data.description || 'Soru metni girilmedi...'}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ ...HANDLE_BASE_STYLE, background: 'var(--flow-node-field-border)', bottom: -7 }}
      />
    </div>
  )
}

// ── Koşul Kuralları Editörü (ve / veya bağlaç çipli) ──────────────────────────
const BOOLEAN_CONDITION_FIELDS = new Set(['kayitli', 'caller.isKnownPatient', 'caller.isVip', 'caller.hasUpcomingAppointment', 'clinic.isOpen'])
const EXTRA_OPERATORS: Array<{ value: string; label: string }> = [
  { value: 'contains', label: 'şu ifadeyi içeriyorsa' },
  { value: 'notContains', label: 'şu ifadeyi içermiyorsa' },
]
type ConditionRule = { field: string; operator: string; value?: string; valueTo?: string }

function ChipListInput({ value, onChange, style }: { value: string; onChange: (v: string) => void; style: React.CSSProperties }) {
  const [draft, setDraft] = useState('')
  const items = String(value || '').split(',').map(s => s.trim()).filter(Boolean)
  const commit = (raw: string) => {
    const t = raw.trim()
    if (!t || items.includes(t)) { setDraft(''); return }
    onChange([...items, t].join(','))
    setDraft('')
  }
  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {items.map(it => (
            <span key={it} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'var(--pc-tint)', border: '1px solid var(--pc-border)', boxShadow: 'var(--pc-clay-pale)', fontSize: 11, fontWeight: 700, color: 'var(--pc-tint-fg)' }}>
              {it}
              <button type="button" aria-label={`${it} değerini sil`} onClick={() => onChange(items.filter(x => x !== it).join(','))} style={{ border: 'none', background: 'var(--pc-tint)', color: 'var(--pc-tint-fg)', cursor: 'pointer', fontWeight: 800, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(draft) } }}
        onBlur={() => commit(draft)}
        placeholder="Bir değer yazıp Enter’a basın"
        style={style}
      />
    </div>
  )
}

function ConditionRulesEditor({
  data,
  update,
  inputStyle,
  customFieldNames,
  direction = 'inbound',
}: {
  data: ConditionData
  update: (u: Record<string, any>) => void
  inputStyle: React.CSSProperties
  customFieldNames: string[]
  direction?: 'inbound' | 'outbound' | 'web' | 'whatsapp'
}) {
  const logic: 'AND' | 'OR' = data.conditionLogic === 'OR' ? 'OR' : 'AND'
  const rules: ConditionRule[] = Array.isArray(data.rules) && data.rules.length > 0
    ? (data.rules as ConditionRule[])
    : [{ field: data.conditionField || '', operator: data.operator || 'equals', value: data.conditionValue, valueTo: data.conditionValueTo }]
  const isIntent = rules.length === 1 && (rules[0].field === 'user_intent' || rules[0].operator === 'intent')

  const commit = (next: ConditionRule[], nextLogic: 'AND' | 'OR' = logic) => {
    const first = next[0] || { field: '', operator: 'equals' }
    update({
      rules: next.length > 1 ? next : undefined,
      conditionLogic: next.length > 1 ? nextLogic : undefined,
      conditionField: first.field,
      operator: first.operator,
      conditionValue: first.value ?? '',
      conditionValueTo: first.valueTo,
    })
  }
  const patch = (i: number, p: Partial<ConditionRule>) => commit(rules.map((r, idx) => (idx === i ? { ...r, ...p } : r)))

  const operators = [
    ...operatorOptions().filter(o => o.value !== 'between' || true),
    ...EXTRA_OPERATORS,
  ]

  const renderField = (r: ConditionRule, i: number) => (
    <select
      value={r.field || ''}
      onChange={e => {
        const val = e.target.value
        if (val === 'user_intent') { commit([{ field: val, operator: 'intent', value: '' }]); return }
        const isBool = BOOLEAN_CONDITION_FIELDS.has(val)
        patch(i, {
          field: val,
          operator: r.operator === 'intent' ? 'equals' : (r.operator || 'equals'),
          ...(isBool && r.value !== 'true' && r.value !== 'false' ? { value: 'true' } : {}),
        })
      }}
      style={inputStyle}
    >
      <option value="">Bir bilgi seçin…</option>
      {i === 0 && rules.length === 1 && <option value="user_intent">🎯 Hastanın isteği (yapay zeka algılar)</option>}
      <option value="kayitli">👤 Kayıtlı hasta mı?</option>
      <optgroup label="Görüşme durumu">
        {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>)
          .filter(k => k !== 'caller.isKnownPatient' || r.field === k)
          .map(k => <option key={k} value={k}>{FIELD_LABELS[k]}</option>)}
      </optgroup>
      <optgroup label="Hazır bilgiler">
        {PRESET_FIELDS
          .filter(f => f.group === (direction === 'outbound' ? 'outbound' : 'inbound') || f.value === r.field)
          .map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </optgroup>
      {customFieldNames.length > 0 && (
        <optgroup label="Akıştaki özel bilgiler">
          {customFieldNames.map(name => <option key={name} value={name}>{name}</option>)}
        </optgroup>
      )}
    </select>
  )

  const renderValue = (r: ConditionRule, i: number) => {
    if (r.operator === 'isEmpty' || r.operator === 'notEmpty') return null
    if (BOOLEAN_CONDITION_FIELDS.has(r.field) && (r.operator === 'equals' || r.operator === 'notEquals')) {
      return (
        <select value={r.value === 'false' ? 'false' : 'true'} onChange={e => patch(i, { value: e.target.value })} style={inputStyle}>
          <option value="true">Evet</option>
          <option value="false">Hayır</option>
        </select>
      )
    }
    if (r.operator === 'between') {
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" value={r.value ?? ''} onChange={e => patch(i, { value: e.target.value })} placeholder="En az" style={inputStyle} />
          <span style={{ color: 'var(--foreground-2)', fontWeight: 700 }}>ile</span>
          <input type="number" value={r.valueTo ?? ''} onChange={e => patch(i, { valueTo: e.target.value })} placeholder="En çok" style={inputStyle} />
        </div>
      )
    }
    if (r.operator === 'in') return <ChipListInput value={r.value || ''} onChange={v => patch(i, { value: v })} style={inputStyle} />
    const numeric = ['gt', 'gte', 'lt', 'lte'].includes(r.operator)
    return (
      <input
        type={numeric ? 'number' : 'text'}
        value={r.value ?? ''}
        onChange={e => patch(i, { value: e.target.value })}
        placeholder={numeric ? 'Bir sayı yazın' : 'Örn: ağrı, implant, acil'}
        style={inputStyle}
      />
    )
  }

  if (isIntent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Kontrol edilecek bilgi</label>
          {renderField(rules[0], 0)}
        </div>
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--flow-info-bg)', border: '1px solid var(--flow-info-border)' }}>
          <label style={{ fontSize: 11, color: 'var(--flow-info-text)', display: 'block', marginBottom: 6, fontWeight: 700 }}>
            🧠 Yapay zeka hangi isteği algılasın?
          </label>
          <textarea
            value={rules[0].value || ''}
            onChange={e => commit([{ field: 'user_intent', operator: 'intent', value: e.target.value }])}
            placeholder="Örn: Arayan kişi fiyat bilgisi soruyor veya yetkili biriyle görüşmek istediğini söylüyor."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div style={{ fontSize: 10, color: 'var(--flow-info-text)', marginTop: 8, lineHeight: 1.4 }}>
            İstek algılanırsa <strong>✓ Evet</strong>, algılanmazsa <strong>✕ Hayır</strong> yoluna gidilir.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules.map((r, i) => (
        <div key={i}>
          {i > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0 8px' }}>
              <button
                type="button"
                title="Tıklayarak ve / veya arasında değiştirin"
                onClick={() => commit(rules, logic === 'AND' ? 'OR' : 'AND')}
                style={{
                  padding: '3px 16px', borderRadius: 999, border: '1.5px solid #1d4ed8', cursor: 'pointer',
                  background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: 'var(--pc-clay-primary)',
                  fontSize: 11, fontWeight: 800,
                }}
              >
                <span style={{ color: '#ffffff' }}>{LOGIC_LABELS[logic]}</span>
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--card-inner)', border: '1px solid var(--input-border)', boxShadow: 'var(--pc-neo-subcard)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)' }}>{i === 0 ? 'Eğer' : 'Koşul ' + (i + 1)}</span>
              {rules.length > 1 && (
                <button type="button" onClick={() => commit(rules.filter((_, idx) => idx !== i))} aria-label="Bu koşulu sil" style={{ border: '1px solid var(--input-border)', background: 'var(--pc-surface)', boxShadow: 'var(--pc-clay-btn)', color: 'var(--danger)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>Sil</button>
              )}
            </div>
            {renderField(r, i)}
            <select
              value={r.operator || 'equals'}
              onChange={e => patch(i, { operator: e.target.value })}
              style={inputStyle}
            >
              {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              {r.operator === 'regex' && <option value="regex">desene uyuyorsa (eski)</option>}
            </select>
            {renderValue(r, i)}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => commit([...rules, { field: '', operator: 'equals', value: '' }])}
        style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 10, border: '1.5px solid #93c5fd', background: 'var(--pc-surface)', boxShadow: 'var(--pc-clay-btn)', color: 'var(--pc-tint-fg)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
      >
        + Koşul ekle ({LOGIC_LABELS[logic]})
      </button>
      <div style={{ fontSize: 11, color: 'var(--foreground-2)', lineHeight: 1.5 }}>
        <strong>Yönlendirme:</strong> {describeCondition(data)} <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Evet</span> yoluna, aksi halde <span style={{ color: '#dc2626', fontWeight: 700 }}>✕ Hayır</span> yoluna gidilir.
      </div>
    </div>
  )
}

interface GeocodeSuggestion {
  title: string
  address: string
  lat: string
  lng: string
  locationUrl: string
}

function WhatsAppLocationAddressPicker({
  nodeData,
  updateSelectedNode,
  inputStyle,
}: {
  nodeData: Record<string, any>
  updateSelectedNode: (patch: Record<string, any>) => void
  inputStyle: Record<string, any>
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [searchError, setSearchError] = useState('')
  const [savingClinicLoc, setSavingClinicLoc] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const loadedClinicLocRef = useRef(false)

  useEffect(() => {
    if (loadedClinicLocRef.current) return
    loadedClinicLocRef.current = true
    fetch('/api/admin/settings/whatsapp-location')
      .then(r => (r.ok ? r.json() : null))
      .then(saved => {
        if (!saved) return
        const patch: Record<string, any> = {}
        if (!nodeData.locationAddress && saved.address) patch.locationAddress = saved.address
        if (!nodeData.locationTitle && saved.title) patch.locationTitle = saved.title
        if (!nodeData.locationLat && saved.lat) patch.locationLat = saved.lat
        if (!nodeData.locationLng && saved.lng) patch.locationLng = saved.lng
        if (!nodeData.locationUrl && saved.locationUrl) patch.locationUrl = saved.locationUrl
        if (!nodeData.locationMessage && saved.locationMessage) patch.locationMessage = saved.locationMessage
        if (Object.keys(patch).length > 0) {
          updateSelectedNode(patch)
        }
      })
      .catch(() => {})
  }, [nodeData, updateSelectedNode])

  const persistClinicLocation = async (payload: {
    address: string
    title: string
    lat: string
    lng: string
    locationUrl: string
    locationMessage: string
  }) => {
    setSavingClinicLoc(true)
    setSaveNotice('')
    try {
      const res = await fetch('/api/admin/settings/whatsapp-location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        if (data.locationUrl && data.locationUrl !== payload.locationUrl) {
          updateSelectedNode({ locationUrl: data.locationUrl })
        }
        setSaveNotice('Klinik konumu kaydedildi.')
        setTimeout(() => setSaveNotice(''), 3500)
      }
    } catch {
      // ignore
    } finally {
      setSavingClinicLoc(false)
    }
  }

  const handleAddressSearch = async () => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchError('Lütfen aranacak mahalle, cadde, ilçe veya klinik adresini yazın.')
      return
    }
    setSearching(true)
    setSearchError('')
    setSuggestions([])
    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => ({ results: [] }))
      let list: GeocodeSuggestion[] = Array.isArray(data?.results) ? data.results : []

      if (list.length === 0) {
        const fallbackRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=tr&q=${encodeURIComponent(q)}`,
        )
        const raw = await fallbackRes.json().catch(() => [])
        if (Array.isArray(raw)) {
          list = raw.map((item: any) => {
            const lat = String(item.lat ?? '')
            const lng = String(item.lon ?? '')
            const displayName = String(item.display_name ?? '')
            const shortTitle = String(item.name || displayName.split(',')[0] || 'Klinik Konumu').trim()
            return {
              title: shortTitle,
              address: displayName,
              lat,
              lng,
              locationUrl:
                lat && lng
                  ? `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}`,
            }
          })
        }
      }

      if (list.length === 0) {
        setSearchError('Eşleşen adres bulunamadı. İlçe veya cadde adını daha açık yazarak tekrar deneyin.')
      } else {
        setSuggestions(list)
      }
    } catch {
      setSearchError('Adres araması sırasında bağlantı hatası oluştu.')
    } finally {
      setSearching(false)
    }
  }

  const selectSuggestion = (item: GeocodeSuggestion) => {
    const nextTitle = (nodeData.locationTitle as string) || item.title || 'Klinik Konumu'
    const nextMsg =
      (nodeData.locationMessage as string) || '📍 Kliniğimizin konumu ve açık adres bilgileri:'
    const patch = {
      locationTitle: nextTitle,
      locationAddress: item.address,
      locationLat: item.lat,
      locationLng: item.lng,
      locationUrl: item.locationUrl,
      locationMessage: nextMsg,
    }
    updateSelectedNode(patch)
    setSuggestions([])
    void persistClinicLocation({
      title: nextTitle,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      locationUrl: item.locationUrl,
      locationMessage: nextMsg,
    })
  }

  const latNum = Number(nodeData.locationLat)
  const lngNum = Number(nodeData.locationLng)
  const hasValidCoords =
    Boolean(nodeData.locationLat && nodeData.locationLng) &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        background: 'var(--card-inner)',
        border: '1.5px solid var(--input-border)',
        borderRadius: 12,
        boxShadow: 'var(--pc-neo-subcard)',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          background: 'var(--flow-success-bg)',
          border: '1px solid #16a34a',
          borderRadius: 8,
          fontSize: 11,
          color: '#15803d',
          fontWeight: 700,
          lineHeight: 1.45,
        }}
      >
        📍 Arayan numaraya kayıtlı klinik konumu WhatsApp mesajı ve harita pini olarak gönderilir.
      </div>

      {/* Adresten Konum Arama */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)', display: 'block', marginBottom: 5 }}>
          🔍 Adresten Konum Ara ve Seç
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAddressSearch()
              }
            }}
            placeholder="Mahalle, cadde, bina no, ilçe / il yazın..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            disabled={searching}
            onClick={() => void handleAddressSearch()}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #1d4ed8',
              background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: 11,
              cursor: searching ? 'wait' : 'pointer',
              boxShadow: 'var(--pc-clay-primary)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: '#ffffff' }}>{searching ? 'Aranıyor...' : 'Adres Ara'}</span>
          </button>
        </div>
        {searchError && (
          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 5, fontWeight: 600 }}>
            {searchError}
          </div>
        )}
      </div>

      {/* Arama Sonuçları Listesi */}
      {suggestions.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 210,
            overflowY: 'auto',
            padding: 8,
            background: 'var(--card-bg)',
            border: '1.5px solid var(--input-border)',
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--foreground-2)' }}>
            Bulunan Adresler (Seçmek için tıklayın):
          </div>
          {suggestions.map((item, idx) => (
            <button
              key={`${item.lat}-${item.lng}-${idx}`}
              type="button"
              onClick={() => selectSuggestion(item)}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--input-border)',
                background: 'var(--card-inner)',
                color: 'var(--foreground)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                boxShadow: 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--foreground)' }}>
                📍 {item.title}
              </span>
              <span style={{ fontSize: 10, color: 'var(--foreground-2)', lineHeight: 1.35 }}>
                {item.address}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Seçilen Konum Detayları */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
          Konum Başlığı / Klinik Adı
        </label>
        <input
          value={(nodeData.locationTitle as string) || ''}
          onChange={e => updateSelectedNode({ locationTitle: e.target.value })}
          placeholder="Örn: Özel Ağız ve Diş Sağlığı Polikliniği"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
          Açık Adres
        </label>
        <textarea
          rows={2}
          value={(nodeData.locationAddress as string) || ''}
          onChange={e => {
            const addr = e.target.value
            const nextPatch: Record<string, any> = { locationAddress: addr }
            if (!nodeData.locationLat && !nodeData.locationLng && addr.trim()) {
              nextPatch.locationUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.trim())}`
            }
            updateSelectedNode(nextPatch)
          }}
          placeholder="Yukarıdan adres arayarak seçin veya açık adresi buraya yazın"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
            Enlem (Koordinat)
          </label>
          <input
            value={(nodeData.locationLat as string) || ''}
            onChange={e => {
              const lat = e.target.value
              const lng = (nodeData.locationLng as string) || ''
              updateSelectedNode({
                locationLat: lat,
                ...(lat && lng ? { locationUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}` } : {}),
              })
            }}
            placeholder="41.0082"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
            Boylam (Koordinat)
          </label>
          <input
            value={(nodeData.locationLng as string) || ''}
            onChange={e => {
              const lng = e.target.value
              const lat = (nodeData.locationLat as string) || ''
              updateSelectedNode({
                locationLng: lng,
                ...(lat && lng ? { locationUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}` } : {}),
              })
            }}
            placeholder="28.9784"
            style={inputStyle}
          />
        </div>
      </div>

      {hasValidCoords && (
        <div
          style={{
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--input-border)',
            background: 'var(--card-bg)',
          }}
        >
          <iframe
            title="Seçilen Klinik Konumu Harita Önizlemesi"
            width="100%"
            height="140"
            style={{ border: 0, display: 'block' }}
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lngNum - 0.004}%2C${latNum - 0.0025}%2C${lngNum + 0.004}%2C${latNum + 0.0025}&layer=mapnik&marker=${latNum}%2C${lngNum}`}
          />
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)' }}>
            Harita Bağlantısı
          </label>
          {nodeData.locationUrl && (
            <a
              href={String(nodeData.locationUrl)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 800, color: '#2563eb', textDecoration: 'none' }}
            >
              Haritada Aç ↗
            </a>
          )}
        </div>
        <input
          value={(nodeData.locationUrl as string) || ''}
          onChange={e => updateSelectedNode({ locationUrl: e.target.value })}
          placeholder="https://www.google.com/maps?q=..."
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
          WhatsApp Konum Mesajı
        </label>
        <input
          value={(nodeData.locationMessage as string) || ''}
          onChange={e => updateSelectedNode({ locationMessage: e.target.value })}
          placeholder="📍 Kliniğimizin konumu ve açık adres bilgileri:"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 4 }}>
          Global Tetikleyici İfadeler
        </label>
        <input
          value={(nodeData.triggerKeywords as string) || ''}
          onChange={e => updateSelectedNode({ triggerKeywords: e.target.value })}
          placeholder="konum, adres, yol tarifi, nasıl gelebilirim"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
        {saveNotice ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>✓ {saveNotice}</span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--foreground-2)' }}>
            Seçilen adres klinik konumu olarak kaydedilir.
          </span>
        )}
        <button
          type="button"
          disabled={savingClinicLoc}
          onClick={() =>
            void persistClinicLocation({
              title: String(nodeData.locationTitle || ''),
              address: String(nodeData.locationAddress || ''),
              lat: String(nodeData.locationLat || ''),
              lng: String(nodeData.locationLng || ''),
              locationUrl: String(nodeData.locationUrl || ''),
              locationMessage: String(
                nodeData.locationMessage || '📍 Kliniğimizin konumu ve açık adres bilgileri:',
              ),
            })
          }
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1.5px solid #1d4ed8',
            background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: 11,
            cursor: savingClinicLoc ? 'wait' : 'pointer',
            boxShadow: 'var(--pc-clay-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#ffffff' }}>
            {savingClinicLoc ? 'Kaydediliyor...' : 'Konumu Kaydet'}
          </span>
        </button>
      </div>
    </div>
  )
}

function ConditionNode({ id, data, selected }: { id: string; data: ConditionData; selected?: boolean }) {
  const isSim = data._simStatus === 'active'
  const ruleCount = Array.isArray(data.rules) && data.rules.length > 1 ? data.rules.length : 1
  const presetField = PRESET_FIELDS.find(f => f.value === data.conditionField)
  const glossaryField = (FIELD_LABELS as Record<string, string>)[data.conditionField === 'kayitli' ? 'caller.isKnownPatient' : data.conditionField]
  const humanLabel = ruleCount > 1
    ? `${ruleCount} koşul birlikte`
    : data.conditionField === 'user_intent'
    ? 'Hastanın isteği'
    : glossaryField || presetField?.label || data.conditionField || 'Koşul seçilmedi'
  const summaryText = useMemo(() => {
    if (!data.conditionField && !(Array.isArray(data.rules) && data.rules.length)) return 'Koşul seçilmedi'
    return `Eğer ${describeCondition(data)}`
  }, [data])

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 14px 20px',
        borderRadius: 12,
        background: 'var(--flow-node-cond)',
        border: selected
          ? '2px solid #2563eb'
          : isSim
          ? '2px solid #16a34a'
          : data._issue?.level === 'error'
          ? '2px solid #dc2626'
          : '1.5px solid var(--flow-node-cond-border)',
        minWidth: 250,
        maxWidth: 274,
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,0.25), var(--pc-neo-card)'
          : isSim
          ? '0 0 0 4px rgba(22,163,74,0.35), var(--pc-neo-card)'
          : 'var(--pc-neo-card)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <NodeQuickActions
        id={id}
        selected={selected}
        issue={data._issue}
        simStatus={data._simStatus}
        canDuplicate
        canDelete
        onDuplicate={data._onDuplicate}
        onDelete={data._onDelete}
      />
      <NodeInfoBadge nodeId={id} summary={data._summary} explain={data._explain} />
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...HANDLE_BASE_STYLE, background: 'var(--flow-node-cond-border)', top: -7 }}
      />
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--flow-node-cond-text)', textAlign: 'center', marginBottom: 5 }}>
        🔀 {humanLabel}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--foreground)',
          background: 'var(--card-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: 6,
          padding: '4px 8px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {summaryText}
      </div>

      {/* Aligned Branch Labels directly above 30% and 70% handles */}
      <div style={{ position: 'relative', height: 18, marginTop: 6 }}>
        <span
          style={{
            position: 'absolute',
            left: '30%',
            transform: 'translateX(-50%)',
            fontSize: 9,
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: 8,
            background: '#16a34a',
            color: '#ffffff',
          }}
        >
          <span style={{ color: '#ffffff' }}>✓ Evet</span>
        </span>
        <span
          style={{
            position: 'absolute',
            left: '70%',
            transform: 'translateX(-50%)',
            fontSize: 9,
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: 8,
            background: '#dc2626',
            color: '#ffffff',
          }}
        >
          <span style={{ color: '#ffffff' }}>✕ Hayır</span>
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        style={{ ...HANDLE_BASE_STYLE, background: '#16a34a', left: '30%', bottom: -7 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        style={{ ...HANDLE_BASE_STYLE, background: '#dc2626', left: '70%', bottom: -7 }}
      />
    </div>
  )
}

function ActionNode({ id, data, selected }: { id: string; data: ActionData; selected?: boolean }) {
  const displayLabel = data.action === 'webhook' ? '⛔ Desteklenmeyen adım' : (ACTION_LABELS[data.action] || data.label || '⚡ İşlem Seçilmedi')
  const isSim = data._simStatus === 'active'

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--flow-node-action)',
        border: selected
          ? '2px solid #2563eb'
          : isSim
          ? '2px solid #16a34a'
          : data._issue?.level === 'error'
          ? '2px solid #dc2626'
          : '1.5px solid var(--flow-node-action-border)',
        minWidth: 230,
        maxWidth: 270,
        textAlign: 'center',
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,0.25), var(--pc-neo-card)'
          : isSim
          ? '0 0 0 4px rgba(22,163,74,0.35), var(--pc-neo-card)'
          : 'var(--pc-neo-card)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <NodeQuickActions
        id={id}
        selected={selected}
        issue={data._issue}
        simStatus={data._simStatus}
        canDuplicate
        canDelete
        onDuplicate={data._onDuplicate}
        onDelete={data._onDelete}
      />
      <NodeInfoBadge nodeId={id} summary={data._summary} explain={data._explain} />
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...HANDLE_BASE_STYLE, background: 'var(--flow-node-action-border)', top: -7 }}
      />
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--flow-node-action-text)' }}>{displayLabel}</div>

      {data.action === 'transfer_call' && (
        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--foreground)', background: 'var(--card-bg)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--input-border)' }}>
          Hedef: <strong>{data.transferNumber || 'Belirtilmedi'}</strong> ({data.requireConfirmation !== false ? 'Onaylı' : 'Doğrudan'})
        </div>
      )}
      {data.action === 'webhook' && (
        <div style={{ marginTop: 6, fontSize: 10, fontWeight: 800, color: '#ffffff', background: '#dc2626', padding: '3px 8px', borderRadius: 6, border: '1px solid #b91c1c' }}>
          <span style={{ color: '#ffffff' }}>⛔ {LEGACY_WEBHOOK_MESSAGE}</span>
        </div>
      )}
      {data.triggerKeywords && (
        <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: '#15803d', background: 'var(--flow-success-bg)', padding: '2px 7px', borderRadius: 6, border: '1px solid #16a34a' }}>
          ⚡ Tetikleyici: {data.triggerKeywords}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ ...HANDLE_BASE_STYLE, background: 'var(--flow-node-action-border)', bottom: -7 }}
      />
    </div>
  )
}

function EndNode({ id, data, selected }: { id: string; data: EndData; selected?: boolean }) {
  const isSim = data._simStatus === 'active'
  return (
    <div
      style={{
        position: 'relative',
        padding: '10px 20px',
        borderRadius: 24,
        background: 'var(--card-bg)',
        color: 'var(--foreground)',
        fontSize: 11,
        fontWeight: 700,
        textAlign: 'center',
        minWidth: 160,
        border: selected ? '2.5px solid #2563eb' : isSim ? '2.5px solid #16a34a' : '1.5px solid var(--input-border)',
        boxShadow: selected
          ? '0 0 0 4px rgba(37,99,235,0.25), var(--pc-neo-card)'
          : isSim
          ? '0 0 0 4px rgba(22,163,74,0.35), var(--pc-neo-card)'
          : 'var(--pc-neo-card)',
      }}
    >
      <NodeQuickActions
        id={id}
        selected={selected}
        issue={data._issue}
        simStatus={data._simStatus}
        canDelete={data._canDelete}
        onDelete={data._onDelete}
      />
      <NodeInfoBadge nodeId={id} summary={data._summary} explain={data._explain} />
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...HANDLE_BASE_STYLE, background: '#64748b', top: -7 }}
      />
      <div>⏹️ {data.label || 'Görüşmeyi Bitir'}</div>
      {data.message && (
        <div style={{ fontSize: 9, color: 'var(--foreground-3)', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          &ldquo;{data.message}&rdquo;
        </div>
      )}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  startNode: StartNode,
  fieldNode: FieldNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
  endNode: EndNode,
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FlowBuilder({ direction = 'inbound' }: { direction?: 'inbound' | 'outbound' | 'web' | 'whatsapp' }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as any)
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [phonebook, setPhonebook] = useState<Array<{ label: string; number: string }>>([])
  const [serverIssues, setServerIssues] = useState<FlowIssue[]>([])
  const [runtimeMode, setRuntimeMode] = useState<'legacy' | 'observe' | 'active'>('legacy')

  // Right Inspector Tabs: 'props' | 'simulator' | 'prompt'
  const [rightTab, setRightTab] = useState<'props' | 'simulator' | 'prompt'>('props')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [customFieldMode, setCustomFieldMode] = useState(false)

  // Undo / Redo History
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const skipHistoryRef = useRef(false)

  // Interactive Flow Simulator State
  const [simActive, setSimActive] = useState(false)
  const [simLoading, setSimLoading] = useState(false)
  const [simAiPowered, setSimAiPowered] = useState(false)
  const [simCurrentNodeId, setSimCurrentNodeId] = useState<string | null>(null)
  const [simVisitedNodeIds, setSimVisitedNodeIds] = useState<string[]>([])
  const [simVisitedEdgeIds, setSimVisitedEdgeIds] = useState<string[]>([])
  const [simFields, setSimFields] = useState<Record<string, string>>({ kayitli: 'false' })
  const [simInput, setSimInput] = useState('')
  const [simMode, setSimMode] = useState<'text' | 'voice'>('text')
  const [simGlobalPhrase, setSimGlobalPhrase] = useState('')
  const [simLog, setSimLog] = useState<Array<{ role: 'system' | 'ai' | 'user' | 'action'; text: string }>>([])

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const pushHistory = useCallback((nextNodes: Node[], nextEdges: Edge[], markDirty = true) => {
    if (skipHistoryRef.current) return
    const cleanNodes = nextNodes.map(n => {
      const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, _summary, _explain, ...restData } = (n.data || {}) as any
      return { ...n, data: restData }
    })
    const snapshot = { nodes: structuredClone(cleanNodes), edges: structuredClone(nextEdges) }
    const sliced = historyRef.current.slice(0, historyIndex + 1)
    sliced.push(snapshot)
    if (sliced.length > 30) sliced.shift()
    historyRef.current = sliced
    setHistoryIndex(sliced.length - 1)
    if (markDirty) setIsDirty(true)
  }, [historyIndex])

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return
    skipHistoryRef.current = true
    const target = historyRef.current[historyIndex - 1]
    setNodes(structuredClone(target.nodes))
    setEdges(decorateEdges(structuredClone(target.edges), target.nodes))
    setHistoryIndex(historyIndex - 1)
    setIsDirty(true)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [historyIndex, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    if (historyIndex >= historyRef.current.length - 1) return
    skipHistoryRef.current = true
    const target = historyRef.current[historyIndex + 1]
    setNodes(structuredClone(target.nodes))
    setEdges(decorateEdges(structuredClone(target.edges), target.nodes))
    setHistoryIndex(historyIndex + 1)
    setIsDirty(true)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [historyIndex, setNodes, setEdges])

  // Load phonebook & runtime mode
  useEffect(() => {
    fetch('/api/admin/settings/transfer-phonebook')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPhonebook(data) })
      .catch(() => {})

    fetch('/api/admin/flow/runtime')
      .then(r => r.json())
      .then(data => {
        if (data.mode === 'observe' || data.mode === 'active' || data.mode === 'legacy') setRuntimeMode(data.mode)
      })
      .catch(() => {})
  }, [])

  const updateRuntimeMode = async (mode: 'legacy' | 'observe' | 'active') => {
    const prev = runtimeMode
    setRuntimeMode(mode)
    try {
      const response = await fetch('/api/admin/flow/runtime', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) throw new Error()
      showToast('✅ Görüşme çalışma biçimi güncellendi')
    } catch {
      setRuntimeMode(prev)
      showToast('Çalışma biçimi güncellenemedi', 'error')
    }
  }

  // Load flow for current direction
  useEffect(() => {
    setLoaded(false)
    fetch(`/api/admin/flow?direction=${direction}`)
      .then(r => r.json())
      .then(data => {
        let initialNodes: Node[] = []
        let initialEdges: Edge[] = []
        if (data.nodes?.length > 0) {
          const TYPE_MAP: Record<string, string> = {
            START: 'startNode',
            FIELD: 'fieldNode',
            CONDITION: 'conditionNode',
            ACTION: 'actionNode',
            END: 'endNode',
          }
          initialNodes = data.nodes.map((n: any) => ({
            ...n,
            type: TYPE_MAP[n.type] || n.type,
            data: {
              ...n.data,
              label: n.data.label || n.data.fieldName || n.data.action || n.type,
            },
          }))
          initialEdges = decorateEdges(data.edges || [], initialNodes)
        } else {
          initialNodes = [
            { id: 'start', type: 'startNode', position: { x: 240, y: 30 }, data: { label: 'Karşılama Mesajı' } },
            { id: 'end', type: 'endNode', position: { x: 260, y: 200 }, data: { label: 'Görüşmeyi Bitir' } },
          ]
          initialEdges = decorateEdges(
            [{ id: 'start-end', source: 'start', target: 'end' }],
            initialNodes
          )
        }
        setNodes(initialNodes)
        setEdges(initialEdges)
        historyRef.current = [{ nodes: structuredClone(initialNodes), edges: structuredClone(initialEdges) }]
        setHistoryIndex(0)
        setIsDirty(false)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [setNodes, setEdges, direction])

  // Live validation issues
  const liveIssues = useMemo(() => {
    const clientIssues = validateFlowClient(nodes, edges)
    return clientIssues.length > 0 ? clientIssues : serverIssues
  }, [nodes, edges, serverIssues])

  // Delete & Duplicate node callbacks
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(nds => {
      const target = nds.find(n => n.id === nodeId)
      if (!target || target.type === 'startNode') return nds
      if (target.type === 'endNode' && nds.filter(n => n.type === 'endNode').length <= 1) return nds
      const nextNodes = nds.filter(n => n.id !== nodeId)
      setEdges(eds => {
        const nextEdges = eds.filter(e => e.source !== nodeId && e.target !== nodeId)
        pushHistory(nextNodes, nextEdges)
        return nextEdges
      })
      return nextNodes
    })
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [setNodes, setEdges, selectedNodeId, pushHistory])

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes(nds => {
      const orig = nds.find(n => n.id === nodeId)
      if (!orig || orig.type === 'startNode') return nds
      const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, _summary, _explain, ...cleanData } = (orig.data || {}) as any
      const newId = `node_${Date.now()}`
      const copy: Node = {
        id: newId,
        type: orig.type,
        position: { x: orig.position.x + 40, y: orig.position.y + 50 },
        data: structuredClone(cleanData),
      }
      const nextNodes = [...nds, copy]
      pushHistory(nextNodes, edges)
      setSelectedNodeId(newId)
      setRightTab('props')
      return nextNodes
    })
  }, [setNodes, edges, pushHistory])

  // Enrich nodes with transient UI props (issues, simulation status, quick action handlers)
  const endNodeCount = useMemo(() => nodes.filter(n => n.type === 'endNode').length, [nodes])
  const simVisitedNodeSet = useMemo(() => new Set(simVisitedNodeIds), [simVisitedNodeIds])
  const simVisitedEdgeSet = useMemo(() => new Set(simVisitedEdgeIds), [simVisitedEdgeIds])

  // Yol özetleri: yalnızca akışın yapısı değişince yeniden hesaplanır.
  const graphHash = useMemo(() => flowGraphHash(nodes, edges), [nodes, edges])
  const nodeSummaries = useMemo(() => summarizeFlow(nodes, edges), [graphHash]) // eslint-disable-line react-hooks/exhaustive-deps
  const explainCacheRef = useRef<Map<string, string | null>>(new Map())
  const explainNode = useCallback(async (nodeId: string): Promise<string | null> => {
    const key = `${direction}:${graphHash}:${nodeId}`
    if (explainCacheRef.current.has(key)) return explainCacheRef.current.get(key) ?? null
    const summary = nodeSummaries[nodeId]
    if (!summary) return null
    let text: string | null = null
    try {
      // Yalnızca akışın yapısından üretilen özet gönderilir; hasta verisi gönderilmez.
      const res = await fetch('/api/admin/flow/explain-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphHash,
          nodeId,
          summary: { does: summary.does, when: summary.when, next: summary.next, warnings: summary.warnings },
        }),
      })
      if (res.ok) {
        const json = await res.json()
        text = json?.source && json.source !== 'local' && typeof json.text === 'string' ? json.text : null
      }
    } catch {
      text = null
    }
    explainCacheRef.current.set(key, text)
    return text
  }, [direction, graphHash, nodeSummaries])

  const displayNodes = useMemo(() => {
    return nodes.map(n => {
      const nodeIssue = liveIssues.find(i => i.nodeId === n.id && i.level === 'error') || liveIssues.find(i => i.nodeId === n.id)
      const simStatus = simActive
        ? simCurrentNodeId === n.id
          ? 'active'
          : simVisitedNodeSet.has(n.id)
          ? 'visited'
          : undefined
        : undefined
      return {
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          _issue: nodeIssue,
          _simStatus: simStatus,
          _onDuplicate: duplicateNode,
          _onDelete: deleteNode,
          _canDelete: n.type !== 'startNode' && (n.type !== 'endNode' || endNodeCount > 1),
          _summary: nodeSummaries[n.id],
          _explain: explainNode,
        },
      }
    })
  }, [nodes, liveIssues, simActive, simCurrentNodeId, simVisitedNodeSet, selectedNodeId, duplicateNode, deleteNode, endNodeCount, nodeSummaries, explainNode])

  const displayEdges = useMemo(() => {
    return decorateEdges(edges, nodes, simActive ? simVisitedEdgeSet : undefined)
  }, [edges, nodes, simActive, simVisitedEdgeSet])

  // Connect edges with automatic Evet/Hayır labels for ConditionNode
  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => {
      // Replace existing outgoing edge on the same handle (or non-condition node) to prevent invalid multi-edges
      const filtered = eds.filter(e => {
        if (e.source !== params.source) return true
        return (e.sourceHandle || null) !== (params.sourceHandle || null)
      })
      const added = addEdge({ ...params, id: `e_${params.source}_${params.sourceHandle || 'out'}_${params.target}_${Date.now()}` }, filtered)
      const decorated = decorateEdges(added, nodes)
      pushHistory(nodes, decorated)
      return decorated
    })
  }, [setEdges, nodes, pushHistory])

  // Keyboard Delete / Backspace support (safe when not typing in inputs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const activeEl = document.activeElement
      if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || (activeEl as HTMLElement).isContentEditable)) {
        return
      }
      if (selectedNodeId) {
        e.preventDefault()
        deleteNode(selectedNodeId)
      } else if (selectedEdgeId) {
        e.preventDefault()
        setEdges(eds => {
          const next = eds.filter(edge => edge.id !== selectedEdgeId)
          pushHistory(nodes, next)
          return next
        })
        setSelectedEdgeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeId, selectedEdgeId, deleteNode, setEdges, nodes, pushHistory])

  const autoLayout = useCallback(() => {
    setNodes(nds => {
      const layouted = layoutNodes(nds, edges)
      pushHistory(layouted, edges)
      return layouted
    })
    setTimeout(() => {
      rfInstance?.fitView({ padding: 0.18, duration: 350 })
    }, 60)
  }, [edges, setNodes, rfInstance, pushHistory])

  // Sample flows with non-crossing condition branches (Evet on left, Hayır on right)
  const loadSampleFlow = (presetKey?: string) => {
    const selectedPreset = presetKey || (
      direction === 'outbound'
        ? 'fast_survey'
        : direction === 'whatsapp'
        ? 'fast_wa'
        : direction === 'web'
        ? 'fast_web'
        : 'fast_phone'
    )

    if (selectedPreset === 'fast_survey') {
      if (!window.confirm('⚡ 2 soruluk hızlı hasta memnuniyet anket akışını yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const surveyNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 250, y: 20 }, data: { label: 'Giden Arama Başladı' } },
        { id: 'field_memnuniyet', type: 'fieldNode', position: { x: 250, y: 150 }, data: { label: 'Memnuniyet Durumu (Anket)', fieldName: 'memnuniyet', fieldType: 'text', description: 'Son kliniğimize ziyaretinizden memnun kaldınız mı, 1 ile 10 arasında kaç puan verirsiniz?', required: true } },
        { id: 'field_oneri', type: 'fieldNode', position: { x: 250, y: 290 }, data: { label: 'Hasta Notu / Önerisi', fieldName: 'hastaNotu', fieldType: 'text', description: 'Ekibimize iletmek istediğiniz kısa bir notunuz var mı?', required: false } },
        { id: 'action_not', type: 'actionNode', position: { x: 250, y: 430 }, data: { action: 'save_patient_note', label: '🗒️ Hastadan Not Al (Bankoya İlet)' } },
        { id: 'end', type: 'endNode', position: { x: 250, y: 570 }, data: { label: 'Teşekkür Et ve Bitir', message: 'Değerli geri bildiriminiz için teşekkür eder, sağlıklı günler dileriz.' } },
      ]
      const surveyEdges = decorateEdges([
        { id: 'e1', source: 'start', target: 'field_memnuniyet' },
        { id: 'e2', source: 'field_memnuniyet', target: 'field_oneri' },
        { id: 'e4', source: 'field_oneri', target: 'action_not' },
        { id: 'e5', source: 'action_not', target: 'end' },
      ], surveyNodes)

      const layouted = layoutNodes(surveyNodes, surveyEdges)
      setNodes(layouted)
      setEdges(surveyEdges)
      pushHistory(layouted, surveyEdges)
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
      showToast('⚡ Hızlı giden arama anket akışı (2 soru) yüklendi')
      return
    }

    if (selectedPreset === 'fast_wa') {
      if (!window.confirm('⚡ Hızlı WhatsApp randevu akışını yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const waNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'WhatsApp Mesajı Geldi' } },
        { id: 'cond_kayitli', type: 'conditionNode', position: { x: 260, y: 130 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true', label: 'Hasta Kayıtlı mı?' } },
        // Hayır (Sağ)
        { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 440, y: 280 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Adınızı ve soyadınızı öğrenebilir miyim?', required: true } },
        // Ortak: Şikâyet + Gün ve Saat
        { id: 'field_sikayet', type: 'fieldNode', position: { x: 260, y: 400 }, data: { label: 'Hasta Şikâyeti / Talebi', fieldName: 'sikayet', fieldType: 'text', description: 'Şikâyetiniz veya randevu talebiniz nedir?', required: false } },
        { id: 'field_tarih', type: 'fieldNode', position: { x: 260, y: 530 }, data: { label: 'Randevu Tarihi', fieldName: 'tarih', fieldType: 'date', description: 'Hangi gün ve saat için randevu oluşturmamı istersiniz?', required: true } },
        { id: 'field_saat', type: 'fieldNode', position: { x: 260, y: 660 }, data: { label: 'Randevu Saati', fieldName: 'saat', fieldType: 'time', description: 'Saat kaç sizin için uygundur?', required: true } },
        { id: 'action_randevu', type: 'actionNode', position: { x: 260, y: 790 }, data: { action: 'save_appointment_pending', label: '📝 Randevu Talebi Oluştur (Onay Bekler)' } },
        { id: 'end', type: 'endNode', position: { x: 260, y: 920 }, data: { label: 'Talebi Onayla ve Bitir', message: 'Randevu talebiniz alınmıştır, sağlıklı günler dileriz.' } },
      ]
      const waEdges = decorateEdges([
        { id: 'e_s_c', source: 'start', target: 'cond_kayitli' },
        { id: 'e_c_true', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
        { id: 'e_c_false', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_musteri_adi' },
        { id: 'e_ad_sik', source: 'field_musteri_adi', target: 'field_sikayet' },
        { id: 'e_sik_tar', source: 'field_sikayet', target: 'field_tarih' },
        { id: 'e_tar_saat', source: 'field_tarih', target: 'field_saat' },
        { id: 'e_saat_act', source: 'field_saat', target: 'action_randevu' },
        { id: 'e_act_end', source: 'action_randevu', target: 'end' },
      ], waNodes)

      const layouted = layoutNodes(waNodes, waEdges)
      setNodes(layouted)
      setEdges(waEdges)
      pushHistory(layouted, waEdges)
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
      showToast('⚡ Hızlı WhatsApp randevu akışı yüklendi')
      return
    }

    if (selectedPreset === 'fast_web') {
      if (!window.confirm('⚡ Sunum Dostu Hızlı Web Randevu Akışını (Maks. 2 Soru) yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const webNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'Web Karşılama Mesajı' } },
        { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 260, y: 140 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Randevunuz için adınızı, soyadınızı ve telefon numaranızı alabilir miyim?', required: true } },
        { id: 'field_tel', type: 'fieldNode', position: { x: 260, y: 270 }, data: { label: 'Telefon Numarası', fieldName: 'telefon', fieldType: 'text', description: 'Size ulaşabileceğimiz telefon numaranızı alabilir miyim?', required: true } },
        { id: 'field_sikayet', type: 'fieldNode', position: { x: 260, y: 400 }, data: { label: 'Hasta Şikâyeti / Talebi', fieldName: 'sikayet', fieldType: 'text', description: 'Şikâyetiniz veya randevu talebiniz nedir?', required: false } },
        { id: 'field_tarih', type: 'fieldNode', position: { x: 260, y: 530 }, data: { label: 'Randevu Tarihi', fieldName: 'tarih', fieldType: 'date', description: 'Hangi gün ve saat için randevu oluşturmamı istersiniz?', required: true } },
        { id: 'field_saat', type: 'fieldNode', position: { x: 260, y: 660 }, data: { label: 'Randevu Saati', fieldName: 'saat', fieldType: 'time', description: 'Saat kaç sizin için uygundur?', required: true } },
        { id: 'action_randevu', type: 'actionNode', position: { x: 260, y: 790 }, data: { action: 'save_appointment_pending', label: '📝 Randevu Talebi Oluştur (Onay Bekler)' } },
        { id: 'end', type: 'endNode', position: { x: 260, y: 920 }, data: { label: 'Görüşmeyi Bitir', message: 'Randevu talebiniz alındı, sağlıklı günler dileriz.' } },
      ]
      const webEdges = decorateEdges([
        { id: 'e_s_ad', source: 'start', target: 'field_musteri_adi' },
        { id: 'e_ad_tel', source: 'field_musteri_adi', target: 'field_tel' },
        { id: 'e_tel_sik', source: 'field_tel', target: 'field_sikayet' },
        { id: 'e_sik_tar', source: 'field_sikayet', target: 'field_tarih' },
        { id: 'e_tar_saat', source: 'field_tarih', target: 'field_saat' },
        { id: 'e_saat_act', source: 'field_saat', target: 'action_randevu' },
        { id: 'e_act_end', source: 'action_randevu', target: 'end' },
      ], webNodes)

      const layouted = layoutNodes(webNodes, webEdges)
      setNodes(layouted)
      setEdges(webEdges)
      pushHistory(layouted, webEdges)
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
      showToast('⚡ Hızlı Web Randevu Akışı (Maks. 2 Soru) yüklendi')
      return
    }

    if (selectedPreset === 'quick_note') {
      if (!window.confirm('🗒️ Hızlı Geri Arama / Bankoya Not Bırakma şablonunu yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const noteNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'Karşılama Mesajı' } },
        { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 260, y: 150 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Adınızı, soyadınızı ve iletmek istediğiniz notu alabilir miyim?', required: true } },
        { id: 'field_oneri', type: 'fieldNode', position: { x: 260, y: 280 }, data: { label: 'Hasta Notu / Önerisi', fieldName: 'hastaNotu', fieldType: 'text', description: 'Bankomuza iletmek istediğiniz mesajınız nedir?', required: true } },
        { id: 'action_not', type: 'actionNode', position: { x: 260, y: 410 }, data: { action: 'save_patient_note', label: '🗒️ Hastadan Not Al (Bankoya İlet)' } },
        { id: 'end', type: 'endNode', position: { x: 260, y: 540 }, data: { label: 'Görüşmeyi Bitir', message: 'Notunuz bankomuza iletildi, en kısa sürede size dönüş yapılacaktır. Sağlıklı günler dileriz.' } },
      ]
      const noteEdges = decorateEdges([
        { id: 'e_s_ad', source: 'start', target: 'field_musteri_adi' },
        { id: 'e_ad_not', source: 'field_musteri_adi', target: 'field_oneri' },
        { id: 'e_not_act', source: 'field_oneri', target: 'action_not' },
        { id: 'e_act_end', source: 'action_not', target: 'end' },
      ], noteNodes)

      const layouted = layoutNodes(noteNodes, noteEdges)
      setNodes(layouted)
      setEdges(noteEdges)
      pushHistory(layouted, noteEdges)
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
      showToast('🗒️ Hızlı Not Bırakma şablonu yüklendi')
      return
    }

    if (!window.confirm('⚡ Sunum Dostu Hızlı Telefon Randevu Akışını (CallerID otomatik, Maks. 1-2 Soru) yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

    // fast_phone veya full_asterisk:
    // Asterisk Gelen Aramada telefon numarası (CallerID) zaten bilindiği için tekrar telefon sorulmaz!
    // Kayıtlı hasta ise doğrudan şikâyet ve gün/saat sorulur; yeni hasta ise Ad Soyad + Şikâyet + Gün/Saat sorulur.
    const sampleNodes: Node[] = [
      { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'Karşılama Mesajı' } },
      { id: 'cond_kayitli', type: 'conditionNode', position: { x: 260, y: 130 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true', label: 'Arayan Numara (CallerID) Kayıtlı mı?' } },
      // Hayır dalı (Yeni Hasta — yalnızca Ad Soyad sorulur, numara CallerID'den otomatik alınır!)
      { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 440, y: 270 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Adınızı ve soyadınızı alabilir miyim?', required: true } },
      // Ortak devam (Şikâyet/Talep + Gün ve Saat)
      { id: 'field_sikayet', type: 'fieldNode', position: { x: 260, y: 400 }, data: { label: 'Hasta Şikâyeti / Talebi', fieldName: 'sikayet', fieldType: 'text', description: 'Şikâyetiniz veya randevu talebiniz nedir?', required: false } },
      { id: 'field_tarih', type: 'fieldNode', position: { x: 260, y: 530 }, data: { label: 'Randevu Tarihi', fieldName: 'tarih', fieldType: 'date', description: 'Hangi gün ve saat için randevu oluşturmamı istersiniz?', required: true } },
      { id: 'field_saat', type: 'fieldNode', position: { x: 260, y: 660 }, data: { label: 'Randevu Saati', fieldName: 'saat', fieldType: 'time', description: 'Saat kaç için randevu istersiniz?', required: true } },
      { id: 'action_randevu', type: 'actionNode', position: { x: 260, y: 790 }, data: { action: 'save_appointment_pending', label: '📝 Randevu Talebi Oluştur (Onay Bekler)' } },
      { id: 'end', type: 'endNode', position: { x: 260, y: 920 }, data: { label: 'Görüşmeyi Bitir', message: 'Randevu talebiniz alındı, sağlıklı günler dileriz.' } },
      ...(selectedPreset === 'full_asterisk'
        ? [
            {
              id: 'action_transfer_global',
              type: 'actionNode',
              position: { x: 640, y: 80 },
              data: {
                action: 'transfer_call',
                label: '📞 Santrale / Resepsiyona Aktar',
                transferNumber: 'resepsiyon',
                triggerKeywords: 'resepsiyon, operatör, sekreter, yetkili, canlı destek',
                requireConfirmation: true,
              },
            },
            {
              id: 'action_wa_loc_global',
              type: 'actionNode',
              position: { x: 640, y: 220 },
              data: {
                action: 'send_wa_location',
                label: '📍 WhatsApp’tan Konum Gönder',
                triggerKeywords: 'konum, adres, yol tarifi, nerede',
              },
            },
          ]
        : []),
    ]

    const sampleEdges = decorateEdges([
      { id: 'e_s_c', source: 'start', target: 'cond_kayitli' },
      { id: 'e_c_true', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
      { id: 'e_c_false', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_musteri_adi' },
      { id: 'e_ad_sik', source: 'field_musteri_adi', target: 'field_sikayet' },
      { id: 'e_sik_tar', source: 'field_sikayet', target: 'field_tarih' },
      { id: 'e_tar_sa', source: 'field_tarih', target: 'field_saat' },
      { id: 'e_sa_act', source: 'field_saat', target: 'action_randevu' },
      { id: 'e_act_end', source: 'action_randevu', target: 'end' },
    ], sampleNodes)

    const layouted = layoutNodes(sampleNodes, sampleEdges)
    setNodes(layouted)
    setEdges(sampleEdges)
    pushHistory(layouted, sampleEdges)
    setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
    showToast(selectedPreset === 'full_asterisk' ? '🏥 Klinik Randevu + Asterisk Santral şablonu yüklendi' : '⚡ Hızlı Telefon Randevu Akışı (1-2 Soru) yüklendi')
  }

  const saveFlow = async () => {
    if (saving) return
    setSaving(true)
    try {
      const serverNodes = nodes.map(n => {
        const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, _summary, _explain, ...cleanData } = (n.data || {}) as any
        return {
          id: n.id,
          type: n.type === 'startNode' ? 'START' : n.type === 'fieldNode' ? 'FIELD' : n.type === 'conditionNode' ? 'CONDITION' : n.type === 'actionNode' ? 'ACTION' : 'END',
          position: n.position,
          data: cleanData,
        }
      })
      const cleanEdges = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(typeof e.label === 'string' ? { label: e.label } : {}),
      }))
      const response = await fetch(`/api/admin/flow?direction=${direction}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: serverNodes, edges: cleanEdges }),
      })
      if (!response.ok) throw new Error('Kayıt başarısız')
      const result = await response.json()
      const issues: FlowIssue[] = Array.isArray(result.issues) ? result.issues : []
      setServerIssues(issues)
      setIsDirty(false)
      const errCount = issues.filter(i => i.level === 'error').length
      if (errCount > 0) {
        showToast(`⚠️ Akış kaydedildi ancak ${errCount} düzeltilmesi gereken adım var`, 'error')
      } else {
        showToast('✅ Konuşma akışı başarıyla kaydedildi')
      }
    } catch {
      showToast('❌ Akış kaydedilirken bir hata oluştu', 'error')
    }
    setSaving(false)
  }

  const addNode = (type: 'field' | 'condition' | 'action' | 'end') => {
    const id = `node_${Date.now()}`
    const anchorNode = nodes.find(n => n.id === selectedNodeId) || nodes[nodes.length - 1]
    const baseX = anchorNode ? anchorNode.position.x : 220
    const baseY = anchorNode ? anchorNode.position.y + 135 : nodes.length * 95 + 40

    let newNode: Node
    if (type === 'field') {
      const usedFields = new Set(nodes.filter(n => n.type === 'fieldNode').map(n => (n.data as FieldData).fieldName))
      const defaultGroup = direction === 'outbound' ? 'outbound' : 'inbound'
      const candidate = PRESET_FIELDS.find(f => f.group === defaultGroup && !usedFields.has(f.value)) || PRESET_FIELDS[0]
      newNode = {
        id,
        type: 'fieldNode',
        position: { x: baseX, y: baseY },
        data: {
          label: candidate.label,
          fieldName: candidate.value,
          description: candidate.desc,
          required: true,
          fieldType: candidate.type,
        } as FieldData,
      }
    } else if (type === 'condition') {
      newNode = {
        id,
        type: 'conditionNode',
        position: { x: baseX, y: baseY },
        data: {
          label: 'Hasta Kayıtlı mı?',
          conditionField: 'kayitli',
          operator: 'equals',
          conditionValue: 'true',
        } as ConditionData,
      }
    } else if (type === 'action') {
      const defaultAction = direction === 'outbound' ? 'save_patient_note' : direction === 'whatsapp' ? 'send_wa_message' : 'save_appointment_pending'
      newNode = {
        id,
        type: 'actionNode',
        position: { x: baseX, y: baseY },
        data: {
          label: ACTION_LABELS[defaultAction],
          action: defaultAction,
        } as ActionData,
      }
    } else {
      newNode = {
        id,
        type: 'endNode',
        position: { x: baseX, y: baseY },
        data: {
          label: 'Görüşmeyi Bitir',
        } as EndData,
      }
    }

    const nextNodes = [...nodes, newNode]
    let nextEdges = edges

    // Smart auto-connect if the selected node is a single-output node with no outgoing edge yet
    if (
      selectedNodeId &&
      anchorNode &&
      ['startNode', 'fieldNode', 'actionNode'].includes(anchorNode.type || '') &&
      !edges.some(e => e.source === selectedNodeId)
    ) {
      nextEdges = decorateEdges(
        [...edges, { id: `e_${selectedNodeId}_${id}`, source: selectedNodeId, target: id }],
        nextNodes
      )
      setEdges(nextEdges)
    }

    setNodes(nextNodes)
    pushHistory(nextNodes, nextEdges)
    setSelectedNodeId(id)
    setSelectedEdgeId(null)
    setRightTab('props')
  }

  const updateSelectedNode = (updates: Record<string, any>) => {
    if (!selectedNodeId) return
    setNodes(nds => {
      const next = nds.map(n => {
        if (n.id !== selectedNodeId) return n
        const newData = { ...n.data, ...updates }
        if (n.type === 'fieldNode' && updates.fieldName !== undefined) {
          const safeName = String(updates.fieldName).replace(/[^a-zA-Z0-9_]/g, '_')
          newData.fieldName = safeName
          const preset = PRESET_FIELDS.find(p => p.value === safeName)
          newData.label = preset ? preset.label : safeName
        }
        return { ...n, data: newData }
      })
      setIsDirty(true)
      return next
    })
  }

  // Dynamic field names present in the canvas for ConditionNode selector
  const customCanvasFieldNames = useMemo(() => {
    const presetSet = new Set(PRESET_FIELDS.map(p => p.value))
    const names = nodes
      .filter(n => n.type === 'fieldNode')
      .map(n => String((n.data as FieldData).fieldName || '').trim())
      .filter(name => name && !presetSet.has(name))
    return [...new Set(names)]
  }, [nodes])

  // ── Interactive Flow Simulator Logic ────────────────────────────────────────
  const stepSimulationFrom = useCallback((nodeId: string, currentFields: Record<string, string>, visitedNodes: string[], visitedEdges: string[]) => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    let currId: string | undefined = nodeId
    const nextVisitedNodes = [...visitedNodes]
    const nextVisitedEdges = [...visitedEdges]
    const newLogs: Array<{ role: 'system' | 'ai' | 'user' | 'action'; text: string }> = []

    for (let guard = 0; guard < nodes.length + 3; guard++) {
      if (!currId) break
      const node = nodeMap.get(currId)
      if (!node) break
      if (!nextVisitedNodes.includes(node.id)) nextVisitedNodes.push(node.id)
      const d = (node.data || {}) as Record<string, any>

      if (node.type === 'startNode') {
        newLogs.push({ role: 'ai', text: `▶ [${d.label || 'Karşılama'}]: Merhaba, kliniğimize hoş geldiniz. Size nasıl yardımcı olabilirim?` })
        const outEdge = edges.find(e => e.source === node.id)
        if (!outEdge) {
          newLogs.push({ role: 'system', text: '⚠️ Karşılama adımından sonra bağlı bir adım yok.' })
          break
        }
        nextVisitedEdges.push(outEdge.id)
        currId = outEdge.target
        continue
      }

      if (node.type === 'fieldNode') {
        const fieldName = String(d.fieldName || '')
        const existingVal = currentFields[fieldName]
        if (!existingVal) {
          newLogs.push({ role: 'ai', text: `🤖 AI Sorusu (${fieldName}): "${d.description || `${fieldName} bilgisini paylaşır mısınız?`}"` })
          setSimCurrentNodeId(node.id)
          setSimVisitedNodeIds(nextVisitedNodes)
          setSimVisitedEdgeIds(nextVisitedEdges)
          setSimLog(prev => [...prev, ...newLogs])
          return
        }
        const outEdge = edges.find(e => e.source === node.id)
        if (!outEdge) {
          setSimCurrentNodeId(node.id)
          break
        }
        nextVisitedEdges.push(outEdge.id)
        currId = outEdge.target
        continue
      }

      if (node.type === 'conditionNode') {
        const field = String(d.conditionField || '')
        const actual = String(currentFields[field] ?? '').trim()
        const expected = String(d.conditionValue || '').trim()

        // If user_intent and not yet answered, pause at condition node so user can pick Evet/Hayır or type phrase
        if ((field === 'user_intent' || d.operator === 'intent') && currentFields['user_intent'] === undefined) {
          newLogs.push({ role: 'system', text: `🔀 Niyet Kontrolü: "${expected}" — Aşağıdan Evet veya Hayır dalını seçerek test edin.` })
          setSimCurrentNodeId(node.id)
          setSimVisitedNodeIds(nextVisitedNodes)
          setSimVisitedEdgeIds(nextVisitedEdges)
          setSimLog(prev => [...prev, ...newLogs])
          return
        }

        let matched = false
        if (d.operator === 'notEmpty') matched = actual.length > 0
        else if (d.operator === 'contains') matched = actual.toLocaleLowerCase('tr-TR').includes(expected.toLocaleLowerCase('tr-TR'))
        else {
          const aLow = actual.toLocaleLowerCase('tr-TR')
          const eLow = expected.toLocaleLowerCase('tr-TR')
          if (eLow === 'true') matched = ['true', 'evet', '1'].includes(aLow)
          else if (eLow === 'false') matched = ['false', 'hayır', 'hayir', '0'].includes(aLow)
          else matched = aLow === eLow
        }

        const branchHandle = matched ? 'true' : 'false'
        newLogs.push({
          role: 'system',
          text: `🔀 Koşul (${field} = "${actual || 'boş'}") → ${matched ? '✅ EVET (Yeşil Yol)' : '❌ HAYIR (Kırmızı Yol)'} seçildi.`,
        })
        const outEdge = edges.find(e => e.source === node.id && e.sourceHandle === branchHandle)
        if (!outEdge) {
          newLogs.push({ role: 'system', text: `⚠️ Koşulun "${matched ? 'Evet' : 'Hayır'}" çıkışı hiçbir adıma bağlı değil!` })
          setSimCurrentNodeId(node.id)
          break
        }
        nextVisitedEdges.push(outEdge.id)
        currId = outEdge.target
        continue
      }

      if (node.type === 'actionNode') {
        const actionTitle = ACTION_LABELS[d.action] || d.label || d.action
        newLogs.push({
          role: 'action',
          text: `⚡ İŞLEM ÇALIŞTIRILDI: ${actionTitle}\nVeriler: ${JSON.stringify(currentFields)}`,
        })
        const outEdge = edges.find(e => e.source === node.id)
        if (!outEdge) {
          setSimCurrentNodeId(node.id)
          break
        }
        nextVisitedEdges.push(outEdge.id)
        currId = outEdge.target
        continue
      }

      if (node.type === 'endNode') {
        newLogs.push({
          role: 'ai',
          text: `⏹️ [${d.label || 'Görüşme Tamamlandı'}]: ${d.message || 'Görüşme nazikçe sonlandırıldı.'}`,
        })
        setSimCurrentNodeId(node.id)
        break
      }
    }

    setSimVisitedNodeIds(nextVisitedNodes)
    setSimVisitedEdgeIds(nextVisitedEdges)
    setSimLog(prev => [...prev, ...newLogs])
  }, [nodes, edges])

  const callBackendAiSimulation = useCallback(async (params: {
    targetNodeId: string | null
    currentFields: Record<string, string>
    visitedNodes: string[]
    visitedEdges: string[]
    userMessage?: string
    manualBranch?: 'true' | 'false'
    priorLogs?: Array<{ role: 'system' | 'ai' | 'user' | 'action'; text: string }>
  }) => {
    setSimLoading(true)
    try {
      const serverNodes = nodes.map(n => {
        const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, _summary, _explain, ...cleanData } = (n.data || {}) as any
        return {
          id: n.id,
          type: n.type === 'startNode' ? 'START' : n.type === 'fieldNode' ? 'FIELD' : n.type === 'conditionNode' ? 'CONDITION' : n.type === 'actionNode' ? 'ACTION' : 'END',
          position: n.position,
          data: cleanData,
        }
      })
      const cleanEdges = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
        ...(typeof e.label === 'string' ? { label: e.label } : {}),
      }))
      const historyForAi = (params.priorLogs || simLog)
        .filter(item => item.role === 'ai' || item.role === 'user')
        .map(item => ({
          role: item.role === 'ai' ? ('model' as const) : ('user' as const),
          text: item.text.replace(/^(🤖 AI[^:]*:|👤 Hasta[^:]*:|▶[^:]*:)\s*/i, ''),
        }))

      const res = await fetch('/api/admin/flow/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction,
          nodes: serverNodes,
          edges: cleanEdges,
          currentNodeId: params.targetNodeId,
          fields: params.currentFields,
          visitedNodeIds: params.visitedNodes,
          visitedEdgeIds: params.visitedEdges,
          history: historyForAi,
          userMessage: params.userMessage,
          manualBranch: params.manualBranch,
        }),
      })
      if (!res.ok) throw new Error('Simülasyon yanıtı alınamadı')
      const data = await res.json()
      setSimAiPowered(Boolean(data.aiPowered))
      if (data.fields) setSimFields(data.fields)
      setSimCurrentNodeId(data.currentNodeId ?? null)
      if (Array.isArray(data.visitedNodeIds)) setSimVisitedNodeIds(data.visitedNodeIds)
      if (Array.isArray(data.visitedEdgeIds)) setSimVisitedEdgeIds(data.visitedEdgeIds)

      const extraLogs: Array<{ role: 'system' | 'ai' | 'user' | 'action'; text: string }> = []
      if (data.extractedFields && Object.keys(data.extractedFields).length > 0) {
        const pairs = Object.entries(data.extractedFields).map(([k, v]) => `${k}="${v}"`).join(', ')
        extraLogs.push({ role: 'system', text: `🧠 AI Alan Çıkarımı: ${pairs}` })
      }
      if (Array.isArray(data.usedKnowledgeTitles) && data.usedKnowledgeTitles.length > 0) {
        extraLogs.push({ role: 'system', text: `📚 Bilgi Bankası (RAG) Kullanıldı: ${data.usedKnowledgeTitles.join(', ')}` })
      }
      if (Array.isArray(data.logs)) {
        extraLogs.push(...data.logs)
      }
      setSimLog(prev => [...prev, ...extraLogs])
    } catch {
      // Offline / local fallback
      if (params.targetNodeId) {
        stepSimulationFrom(params.targetNodeId, params.currentFields, params.visitedNodes, params.visitedEdges)
      }
    } finally {
      setSimLoading(false)
    }
  }, [nodes, edges, direction, simLog, stepSimulationFrom])

  const startSimulation = useCallback((initialRegistered?: string) => {
    const start = nodes.find(n => n.type === 'startNode')
    if (!start) {
      showToast('Başlangıç (Karşılama) düğümü bulunamadı', 'error')
      return
    }
    const regVal = initialRegistered ?? simFields.kayitli ?? 'false'
    const initFields: Record<string, string> = { kayitli: regVal }
    const initLog = [{ role: 'system' as const, text: `🧪 Test başlatıldı (Kayıtlı hasta mı: ${regVal === 'true' ? 'Evet' : 'Hayır'})` }]
    setSimActive(true)
    setSimFields(initFields)
    setSimInput('')
    setSimVisitedNodeIds([start.id])
    setSimVisitedEdgeIds([])
    setSimLog(initLog)
    setRightTab('simulator')
    void callBackendAiSimulation({
      targetNodeId: start.id,
      currentFields: initFields,
      visitedNodes: [start.id],
      visitedEdges: [],
      priorLogs: initLog,
    })
  }, [nodes, simFields.kayitli, showToast, callBackendAiSimulation])

  const submitSimulationField = (valueToSubmit?: string) => {
    const val = (valueToSubmit ?? simInput).trim()
    if (!val || simLoading) return
    setSimInput('')
    const userLogItem = { role: 'user' as const, text: `👤 Hasta: "${val}"` }
    const nextLogs = [...simLog, userLogItem]
    setSimLog(nextLogs)
    void callBackendAiSimulation({
      targetNodeId: simCurrentNodeId,
      currentFields: simFields,
      visitedNodes: simVisitedNodeIds,
      visitedEdges: simVisitedEdgeIds,
      userMessage: val,
      priorLogs: nextLogs,
    })
  }

  const chooseConditionBranchInSim = (branch: 'true' | 'false') => {
    if (simLoading) return
    const currentNode = nodes.find(n => n.id === simCurrentNodeId)
    if (!currentNode || currentNode.type !== 'conditionNode') return
    const nextLogs = [
      ...simLog,
      { role: 'user' as const, text: `👤 Test Seçimi: ${branch === 'true' ? '✅ Evet (Niyet Eşleşti)' : '❌ Hayır (Eşleşmedi)'}` },
    ]
    setSimLog(nextLogs)
    void callBackendAiSimulation({
      targetNodeId: currentNode.id,
      currentFields: simFields,
      visitedNodes: simVisitedNodeIds,
      visitedEdges: simVisitedEdgeIds,
      manualBranch: branch,
      priorLogs: nextLogs,
    })
  }

  const triggerGlobalKeywordInSim = () => {
    const phrase = simGlobalPhrase.trim()
    if (!phrase || simLoading) return
    setSimGlobalPhrase('')
    setSimActive(true)
    const nextLogs = [...simLog, { role: 'user' as const, text: `👤 Hasta (Ara Söz): "${phrase}"` }]
    setSimLog(nextLogs)
    void callBackendAiSimulation({
      targetNodeId: simCurrentNodeId || nodes.find(n => n.type === 'startNode')?.id || null,
      currentFields: simFields,
      visitedNodes: simVisitedNodeIds,
      visitedEdges: simVisitedEdgeIds,
      userMessage: phrase,
      priorLogs: nextLogs,
    })
  }

  if (!loaded) {
    return <div style={{ padding: 28, color: 'var(--foreground-3)', textAlign: 'center', fontWeight: 600 }}>⏳ Akış diyagramı yükleniyor...</div>
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 11px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: 8,
    color: 'var(--foreground)',
    fontSize: 12,
    outline: 'none',
    boxShadow: 'var(--pc-neo-inset)',
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId)
  const selectedSimNode = nodes.find(n => n.id === simCurrentNodeId)
  const errorCount = liveIssues.filter(i => i.level === 'error').length
  const warningCount = liveIssues.filter(i => i.level === 'warning').length

  const containerStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'var(--card-bg)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'hidden',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }

  return (
    <div style={containerStyle}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 2200,
            background: 'var(--card-bg)',
            border: `1.5px solid ${toast.type === 'success' ? '#16a34a' : '#dc2626'}`,
            color: toast.type === 'success' ? '#15803d' : '#dc2626',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: '0.84rem',
            fontWeight: 700,
            boxShadow: 'var(--pc-modal-shadow)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Top Toolbar */}
      <div
        style={{
          background: 'var(--card-inner)',
          border: '1px solid var(--input-border)',
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          boxShadow: 'var(--pc-neo-subcard)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)' }}>🔀 Akış Tasarımcısı</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 12,
              background: 'var(--pc-tint)',
              border: '1px solid var(--pc-border)',
              color: 'var(--pc-tint-fg)',
              boxShadow: 'var(--pc-clay-pale)',
            }}
          >
            {direction === 'inbound'
              ? '📞 Santral (Asterisk Gelen)'
              : direction === 'outbound'
              ? '📤 Santral (Asterisk Giden)'
              : direction === 'web'
              ? '🌐 Web Tarayıcı (Paralel)'
              : '💬 WhatsApp Kanalı'}
          </span>
          {/* Validation Status Pill */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 12,
              background: errorCount > 0 ? 'var(--flow-danger-bg)' : 'var(--flow-success-bg)',
              border: `1px solid ${errorCount > 0 ? '#dc2626' : '#16a34a'}`,
              color: errorCount > 0 ? '#dc2626' : '#15803d',
            }}
          >
            {errorCount > 0 ? `✕ ${errorCount} Hata` : warningCount > 0 ? `⚠ ${warningCount} Uyarı` : '✓ Akış Geçerli'}
          </span>
          {isDirty && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                background: 'var(--flow-info-bg)',
                border: '1px solid var(--flow-info-border)',
                color: 'var(--flow-info-text)',
              }}
            >
              ● Kaydedilmemiş değişiklik
            </span>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--foreground-2)' }}>
          Çalışma Modu:
          <select
            value={runtimeMode}
            onChange={e => updateRuntimeMode(e.target.value as 'legacy' | 'observe' | 'active')}
            style={{ ...inputStyle, width: 'auto', padding: '5px 9px', fontSize: 11, fontWeight: 600 }}
          >
            <option value="legacy">Talimat Tabanlı (Esnek Yapay Zeka)</option>
            <option value="observe">Gözlem Modu (Deneme / Kayıt)</option>
            <option value="active">Sıkı Akış Motoru (Adım Adım)</option>
          </select>
        </label>

        <div style={{ flex: 1 }} />

        {/* Undo / Redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            title="Geri Al"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--card-bg)',
              border: '1px solid var(--input-border)',
              color: 'var(--foreground)',
              fontSize: 11,
              fontWeight: 700,
              cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer',
              opacity: historyIndex <= 0 ? 0.45 : 1,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            ↩ Geri
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyIndex >= historyRef.current.length - 1}
            title="İleri Al"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'var(--card-bg)',
              border: '1px solid var(--input-border)',
              color: 'var(--foreground)',
              fontSize: 11,
              fontWeight: 700,
              cursor: historyIndex >= historyRef.current.length - 1 ? 'not-allowed' : 'pointer',
              opacity: historyIndex >= historyRef.current.length - 1 ? 0.45 : 1,
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            ↪ İleri
          </button>
        </div>

        <button
          type="button"
          onClick={autoLayout}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: 'var(--card-bg)',
            border: '1px solid var(--flow-node-field-border)',
            color: 'var(--flow-node-field-text)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--pc-clay-btn)',
          }}
        >
          📐 Otomatik Hizala
        </button>

        <button
          type="button"
          onClick={() => startSimulation()}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: simActive ? '#16a34a' : 'var(--card-bg)',
            border: `1px solid ${simActive ? '#15803d' : '#16a34a'}`,
            color: simActive ? '#ffffff' : '#15803d',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: simActive ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
          }}
        >
          <span style={{ color: simActive ? '#ffffff' : 'inherit' }}>🧪 {simActive ? 'Simülasyon Açık' : 'Akışı Test Et'}</span>
        </button>

        <select
          aria-label="Hazır şablon yükle"
          value=""
          onChange={e => {
            if (e.target.value) loadSampleFlow(e.target.value)
          }}
          style={{
            ...inputStyle,
            width: 'auto',
            padding: '6px 11px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            background: 'var(--card-bg)',
            boxShadow: 'var(--pc-clay-btn)',
          }}
        >
          <option value="">🌟 Hazır Şablon Yükle…</option>
          {direction === 'inbound' && (
            <>
              <option value="fast_phone">⚡ Hızlı Telefon Randevusu (Sunum Dostu · 1-2 Soru)</option>
              <option value="full_asterisk">🏥 Klinik Randevu + Santral Aktarımı &amp; Konum</option>
              <option value="quick_note">🗒️ Hızlı Not Bırakma (1 Soru)</option>
            </>
          )}
          {direction === 'web' && (
            <>
              <option value="fast_web">⚡ Hızlı Web Randevusu (Sunum Dostu · 2 Soru)</option>
              <option value="quick_note">🗒️ Web Geri Arama / Mesaj Notu</option>
            </>
          )}
          {direction === 'outbound' && (
            <option value="fast_survey">⚡ Hızlı Memnuniyet Anketi (2 Soru)</option>
          )}
          {direction === 'whatsapp' && (
            <option value="fast_wa">⚡ Hızlı WhatsApp Randevu (1-2 Soru)</option>
          )}
        </select>

        <button
          type="button"
          onClick={() => setIsFullscreen(f => !f)}
          style={{
            padding: '6px 11px',
            borderRadius: 8,
            background: 'var(--card-bg)',
            border: '1px solid var(--input-border)',
            color: 'var(--foreground)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: 'var(--pc-clay-btn)',
          }}
        >
          {isFullscreen ? '✕ Küçült' : '⛶ Tam Ekran'}
        </button>

        <button
          type="button"
          onClick={saveFlow}
          disabled={saving}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            background: '#2563eb',
            border: '1px solid #1d4ed8',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            boxShadow: 'var(--pc-clay-primary)',
            opacity: saving ? 0.65 : 1,
          }}
        >
          <span style={{ color: '#ffffff' }}>{saving ? '⏳ Kaydediliyor...' : '💾 Değişiklikleri Kaydet'}</span>
        </button>
      </div>

      {/* Clickable Validation Issues Bar */}
      {liveIssues.length > 0 && (
        <div
          style={{
            background: 'var(--card-inner)',
            border: '1px solid var(--input-border)',
            padding: '8px 12px',
            borderRadius: 10,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)' }}>Kontrol Listesi:</span>
          {liveIssues.map((issue, idx) => (
            <button
              key={`${issue.nodeId || 'flow'}-${idx}`}
              type="button"
              onClick={() => {
                if (issue.nodeId) {
                  setSelectedNodeId(issue.nodeId)
                  setSelectedEdgeId(null)
                  setRightTab('props')
                  const targetNode = nodes.find(n => n.id === issue.nodeId)
                  if (targetNode && rfInstance) {
                    rfInstance.setCenter(targetNode.position.x + 120, targetNode.position.y + 40, { zoom: 1.05, duration: 300 })
                  }
                }
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: issue.nodeId ? 'pointer' : 'default',
                background: issue.level === 'error' ? 'var(--flow-danger-bg)' : 'var(--card-bg)',
                border: `1px solid ${issue.level === 'error' ? '#dc2626' : '#d97706'}`,
                color: issue.level === 'error' ? '#dc2626' : '#d97706',
              }}
            >
              {issue.level === 'error' ? '✕ ' : '⚠ '}
              {issue.message}
              {issue.nodeId ? ' (Git →)' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Main Split Workspace: Canvas (Left, Flex 1) + Inspector/Simulator (Right, 380px) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          flex: 1,
          minHeight: isFullscreen ? 'calc(100vh - 160px)' : 650,
        }}
      >
        {/* ReactFlow Canvas Container */}
        <div
          style={{
            background: 'var(--flow-panel-bg)',
            border: '1.5px solid var(--flow-panel-border)',
            flex: '1 1 580px',
            height: isFullscreen ? 'calc(100vh - 160px)' : 650,
            borderRadius: 12,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'var(--pc-neo-card)',
          }}
        >
          {/* Floating Node Add Palette */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 10,
              display: 'flex',
              gap: 6,
              background: 'var(--card-bg)',
              padding: '7px 9px',
              borderRadius: 10,
              border: '1px solid var(--input-border)',
              flexWrap: 'wrap',
              boxShadow: 'var(--pc-neo-card)',
            }}
          >
            <button
              type="button"
              onClick={() => addNode('field')}
              style={{
                padding: '6px 11px',
                background: 'var(--flow-node-field)',
                color: 'var(--flow-node-field-text)',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid var(--flow-node-field-border)',
                cursor: 'pointer',
              }}
            >
              + Bilgi Al (Soru)
            </button>
            <button
              type="button"
              onClick={() => addNode('condition')}
              style={{
                padding: '6px 11px',
                background: 'var(--flow-node-cond)',
                color: 'var(--flow-node-cond-text)',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid var(--flow-node-cond-border)',
                cursor: 'pointer',
              }}
            >
              + Koşul (Evet/Hayır)
            </button>
            <button
              type="button"
              onClick={() => addNode('action')}
              style={{
                padding: '6px 11px',
                background: 'var(--flow-node-action)',
                color: 'var(--flow-node-action-text)',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid var(--flow-node-action-border)',
                cursor: 'pointer',
              }}
            >
              + İşlem Yap
            </button>
            <button
              type="button"
              onClick={() => addNode('end')}
              style={{
                padding: '6px 11px',
                background: 'var(--card-inner)',
                color: 'var(--foreground)',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                border: '1px solid var(--input-border)',
                cursor: 'pointer',
              }}
            >
              + Bitiş Adımı
            </button>
          </div>

          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onInit={setRfInstance}
            onNodesChange={changes => {
              onNodesChange(changes)
              if (changes.some(c => c.type === 'position' && (c as any).dragging === false)) {
                setIsDirty(true)
              }
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => {
              setSelectedNodeId(node.id)
              setSelectedEdgeId(null)
              setCustomFieldMode(false)
              if (rightTab === 'prompt') setRightTab('props')
            }}
            onNodeDoubleClick={(_e, node) => {
              setSelectedNodeId(node.id)
              setSelectedEdgeId(null)
              setRightTab('props')
            }}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id)
              setSelectedNodeId(null)
              setRightTab('props')
            }}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
            }}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            deleteKeyCode={null}
            style={{ width: '100%', height: '100%', background: 'var(--flow-bg)' }}
          >
            <Background color="var(--flow-grid)" gap={20} />
            <Controls style={{ background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--input-border)' }} />
          </ReactFlow>
        </div>

        {/* Right Multi-Tab Inspector / Simulator / Prompt Panel */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1.5px solid var(--input-border)',
            borderRadius: 12,
            flex: '0 0 380px',
            maxWidth: '100%',
            height: isFullscreen ? 'calc(100vh - 160px)' : 650,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'var(--pc-neo-card)',
          }}
        >
          {/* Segmented Tab Bar */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 6,
              background: 'var(--card-inner)',
              borderBottom: '1px solid var(--input-border)',
            }}
          >
            <button
              type="button"
              onClick={() => setRightTab('props')}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: 8,
                border: '1px solid',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: rightTab === 'props' ? '#2563eb' : 'var(--card-bg)',
                borderColor: rightTab === 'props' ? '#1d4ed8' : 'var(--input-border)',
                color: rightTab === 'props' ? '#ffffff' : 'var(--foreground)',
                boxShadow: rightTab === 'props' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: rightTab === 'props' ? '#ffffff' : 'inherit' }}>⚙️ Özellikler</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRightTab('simulator')
                if (!simActive) startSimulation()
              }}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: 8,
                border: '1px solid',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: rightTab === 'simulator' ? '#2563eb' : 'var(--card-bg)',
                borderColor: rightTab === 'simulator' ? '#1d4ed8' : 'var(--input-border)',
                color: rightTab === 'simulator' ? '#ffffff' : 'var(--foreground)',
                boxShadow: rightTab === 'simulator' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: rightTab === 'simulator' ? '#ffffff' : 'inherit' }}>🧪 Canlı Test</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('prompt')}
              style={{
                flex: 1,
                padding: '7px 8px',
                borderRadius: 8,
                border: '1px solid',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: rightTab === 'prompt' ? '#2563eb' : 'var(--card-bg)',
                borderColor: rightTab === 'prompt' ? '#1d4ed8' : 'var(--input-border)',
                color: rightTab === 'prompt' ? '#ffffff' : 'var(--foreground)',
                boxShadow: rightTab === 'prompt' ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
              }}
            >
              <span style={{ color: rightTab === 'prompt' ? '#ffffff' : 'inherit' }}>📋 Yapay Zeka Talimatı</span>
            </button>
          </div>

          {/* Tab Body */}
          <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* ── TAB 1: NODE & EDGE PROPERTIES ── */}
            {rightTab === 'props' && (
              <>
                {!selectedNode && !selectedEdgeId && (
                  <div style={{ color: 'var(--foreground-3)', fontSize: 12, textAlign: 'center', marginTop: 32, lineHeight: 1.6, padding: 16, background: 'var(--card-inner)', borderRadius: 10, border: '1px solid var(--input-border)' }}>
                    <div style={{ fontSize: 26, marginBottom: 8 }}>🖱️</div>
                    <div style={{ fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>Bir Düğüm veya Bağlantı Seçin</div>
                    Tuval üzerindeki herhangi bir adıma tıklayarak soruları, koşulları ve aksiyonları buradan düzenleyebilirsiniz.
                  </div>
                )}

                {/* Edge Inspector */}
                {selectedEdgeId && (() => {
                  const edge = edges.find(e => e.id === selectedEdgeId)
                  if (!edge) return null
                  const srcNode = nodes.find(n => n.id === edge.source)
                  const tgtNode = nodes.find(n => n.id === edge.target)
                  const isCondEdge = srcNode?.type === 'conditionNode'

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ padding: 12, background: 'var(--card-inner)', border: '1px solid var(--input-border)', borderRadius: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>🔗 Bağlantı Çizgisi Özellikleri</div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-2)', lineHeight: 1.5 }}>
                          Başlangıç: <strong>{(srcNode?.data as any)?.label || edge.source}</strong>
                          <br />
                          Hedef: <strong>{(tgtNode?.data as any)?.label || edge.target}</strong>
                        </div>
                      </div>

                      {isCondEdge && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>
                            Koşul Çıkış Yönü (Evet / Hayır)
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEdges(eds => {
                                  const updated = decorateEdges(
                                    eds.map(e => (e.id === edge.id ? { ...e, sourceHandle: 'true', label: 'Evet' } : e)),
                                    nodes
                                  )
                                  pushHistory(nodes, updated)
                                  return updated
                                })
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: 8,
                                border: '1px solid #16a34a',
                                background: edge.sourceHandle === 'true' ? '#16a34a' : 'var(--card-bg)',
                                color: edge.sourceHandle === 'true' ? '#ffffff' : '#15803d',
                                fontWeight: 700,
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ color: edge.sourceHandle === 'true' ? '#ffffff' : 'inherit' }}>✓ Evet (Yeşil Dal)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEdges(eds => {
                                  const updated = decorateEdges(
                                    eds.map(e => (e.id === edge.id ? { ...e, sourceHandle: 'false', label: 'Hayır' } : e)),
                                    nodes
                                  )
                                  pushHistory(nodes, updated)
                                  return updated
                                })
                              }}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: 8,
                                border: '1px solid #dc2626',
                                background: edge.sourceHandle === 'false' ? '#dc2626' : 'var(--card-bg)',
                                color: edge.sourceHandle === 'false' ? '#ffffff' : '#dc2626',
                                fontWeight: 700,
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ color: edge.sourceHandle === 'false' ? '#ffffff' : 'inherit' }}>✕ Hayır (Kırmızı Dal)</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEdges(eds => {
                            const next = eds.filter(e => e.id !== edge.id)
                            pushHistory(nodes, next)
                            return next
                          })
                          setSelectedEdgeId(null)
                        }}
                        style={{
                          width: '100%',
                          padding: '9px',
                          background: 'var(--flow-danger-bg)',
                          color: '#dc2626',
                          border: '1px solid #dc2626',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🗑️ Bağlantıyı Sil
                      </button>
                    </div>
                  )
                })()}

                {/* StartNode Inspector */}
                {selectedNode?.type === 'startNode' && (() => {
                  const d = selectedNode.data as StartData
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ padding: 12, background: 'var(--flow-success-bg)', border: '1px solid #16a34a', borderRadius: 10, fontSize: 11, color: '#15803d', lineHeight: 1.5, fontWeight: 600 }}>
                        ▶ Bu düğüm görüşmenin başlangıç noktasıdır. Yapay zeka görüşmeyi açarken Bilgi Tabanı &gt; Karşılama Mesajları kartında tanımladığınız açılış cümlesini okur ve ardından bu düğüme bağlı ilk adıma geçer.
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Başlangıç Etiketi</label>
                        <input
                          value={d.label || ''}
                          onChange={e => updateSelectedNode({ label: e.target.value })}
                          placeholder="Karşılama Mesajı"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )
                })()}

                {/* EndNode Inspector */}
                {selectedNode?.type === 'endNode' && (() => {
                  const d = selectedNode.data as EndData
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Bitiş Adımı Başlığı</label>
                        <input
                          value={d.label || ''}
                          onChange={e => updateSelectedNode({ label: e.target.value })}
                          placeholder="Görüşmeyi Bitir"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>
                          Özel Kapanış Cümlesi (Opsiyonel)
                        </label>
                        <textarea
                          value={d.message || ''}
                          onChange={e => updateSelectedNode({ message: e.target.value })}
                          placeholder="Örn: Sağlıklı günler dileriz, hoşça kalın."
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  )
                })()}

                {/* FieldNode Inspector */}
                {selectedNode?.type === 'fieldNode' && (() => {
                  const d = selectedNode.data as FieldData
                  const isCustom = customFieldMode || (Boolean(d.fieldName) && !PRESET_FIELDS.some(f => f.value === d.fieldName))

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)' }}>İstenecek Bilgi (Alan Adı)</label>
                          <button
                            type="button"
                            onClick={() => setCustomFieldMode(!isCustom)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#2563eb',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {isCustom ? '📋 Hazır Listeden Seç' : '+ Özel Alan Yaz'}
                          </button>
                        </div>

                        {isCustom ? (
                          <input
                            value={d.fieldName || ''}
                            onChange={e => updateSelectedNode({ fieldName: e.target.value })}
                            placeholder="Örn: tc_kimlik, dogum_tarihi, sigorta"
                            style={inputStyle}
                          />
                        ) : (
                          <select
                            value={d.fieldName || ''}
                            onChange={e => {
                              const val = e.target.value
                              const sel = PRESET_FIELDS.find(p => p.value === val)
                              if (sel) {
                                // Replace description automatically if empty or if it matches any preset's default question
                                const isDefaultDesc = !d.description || PRESET_FIELDS.some(p => p.desc === d.description)
                                updateSelectedNode({
                                  fieldName: sel.value,
                                  label: sel.label,
                                  fieldType: sel.type,
                                  description: isDefaultDesc ? sel.desc : d.description,
                                })
                              } else {
                                updateSelectedNode({ fieldName: val })
                              }
                            }}
                            style={inputStyle}
                          >
                            <option value="">Bir alan seçin...</option>
                            {PRESET_FIELDS
                              .filter(f => f.group === (direction === 'outbound' ? 'outbound' : 'inbound') || f.value === d.fieldName)
                              .map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                          </select>
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)' }}>AI Sorusu (Hastaya Sorulacak Cümle)</label>
                          {PRESET_FIELDS.some(p => p.value === d.fieldName) && (
                            <button
                              type="button"
                              onClick={() => {
                                const preset = PRESET_FIELDS.find(p => p.value === d.fieldName)
                                if (preset) updateSelectedNode({ description: preset.desc })
                              }}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                            >
                              Varsayılan Soruyu Yükle
                            </button>
                          )}
                        </div>
                        <textarea
                          value={d.description || ''}
                          onChange={e => updateSelectedNode({ description: e.target.value })}
                          placeholder="Adınızı ve soyadınızı öğrenebilir miyim?"
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Veri Tipi ve Doğrulama</label>
                        <select value={d.fieldType || 'text'} onChange={e => updateSelectedNode({ fieldType: e.target.value as any })} style={inputStyle}>
                          <option value="text">Metin (Serbest Yanıt)</option>
                          <option value="date">Tarih (GG.AA.YYYY)</option>
                          <option value="time">Saat (SS:DD)</option>
                          <option value="enum">Seçenekli Liste</option>
                          <option value="user">Sistem Kullanıcısı (Hekim / Personel)</option>
                        </select>
                      </div>

                      {d.fieldType === 'enum' && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Seçenekler (Virgülle ayırın)</label>
                          <input
                            value={d.enumValues ? d.enumValues.join(', ') : ''}
                            onChange={e => updateSelectedNode({ enumValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            placeholder="Örn: muayene, kanal tedavisi, temizlik"
                            style={inputStyle}
                          />
                        </div>
                      )}

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          background: 'var(--card-inner)',
                          border: '1px solid var(--input-border)',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--foreground)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(d.required)}
                          onChange={e => updateSelectedNode({ required: e.target.checked })}
                          style={{ accentColor: '#2563eb', width: 16, height: 16 }}
                        />
                        Bu bilginin alınması zorunlu olsun
                      </label>
                    </div>
                  )
                })()}

                {/* ConditionNode Inspector */}
                {selectedNode?.type === 'conditionNode' && (() => {
                  const d = selectedNode.data as ConditionData
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <ConditionRulesEditor data={d} update={updateSelectedNode} inputStyle={inputStyle} customFieldNames={customCanvasFieldNames} direction={direction} />
                    </div>
                  )
                })()}

                {/* ActionNode Inspector */}
                {selectedNode?.type === 'actionNode' && (() => {
                  const d = selectedNode.data as ActionData
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Yapılacak İşlem Tipi</label>
                        <select
                          value={d.action || ''}
                          onChange={e => {
                            const action = e.target.value
                            updateSelectedNode({
                              action,
                              label: ACTION_LABELS[action] || e.target.options[e.target.selectedIndex].text,
                              ...(action === 'send_wa_location' && !d.triggerKeywords ? { triggerKeywords: 'konum, adres, yol tarifi, nasıl gelebilirim' } : {}),
                              ...(action === 'transfer_call' && d.requireConfirmation === undefined ? { requireConfirmation: true } : {}),
                            })
                          }}
                          style={inputStyle}
                        >
                          <option value="">Bir işlem seçin...</option>
                          <option value="save_appointment_pending">📝 Randevu Talebi Oluştur (Onay Bekler)</option>
                          <option value="save_patient_note">🗒️ Hastadan Not Al (Bankoya İlet)</option>
                          <option value="set_variable">{ACTION_LABELS.set_variable}</option>
                          <option value="send_sms">{ACTION_LABELS.send_sms}</option>
                          <option value="wait_reprompt">{ACTION_LABELS.wait_reprompt}</option>
                          <option value="switch_prompt">{ACTION_LABELS.switch_prompt}</option>
                          {direction === 'whatsapp' ? (
                            <option value="send_wa_message">📱 WhatsApp Mesajı Gönder</option>
                          ) : direction === 'web' ? (
                            <option value="end_call">👋 Bilgi Ver ve Görüşmeyi Tamamla</option>
                          ) : (
                            <>
                              <option value="end_call">📴 Bilgi Ver ve Telefon Hattını Kapat (Santral)</option>
                              <option value="transfer_call">📞 Santrale / Dahiliye Aktar (Asterisk)</option>
                              <option value="send_wa_location">📍 Arayan Numaraya WhatsApp Konum Gönder (Santral)</option>
                            </>
                          )}
                          {d.action === 'randevuOlustur' && <option value="randevuOlustur">📝 Randevu Oluştur</option>}
                          {d.action === 'notBirak' && <option value="notBirak">🗒️ Anket / Hasta Notu Kaydet</option>}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>
                          ⚡ Olay Tetikleyici (Opsiyonel)
                        </label>
                        <select
                          value={(d.eventTrigger as string) || ''}
                          onChange={e => updateSelectedNode({ eventTrigger: e.target.value || undefined })}
                          style={inputStyle}
                        >
                          <option value="">Normal Akış Adımı (Olay Yok)</option>
                          <option value="on_silence">🤫 Sessiz Kalındığında</option>
                          <option value="on_no_match">❓ Cevap Anlaşılamadığında</option>
                          {(direction === 'inbound' || direction === 'outbound') && (
                            <option value="on_transfer_fail">📵 Santral Aktarımı Başarısız Olduğunda</option>
                          )}
                          <option value="on_call_end">📴 Görüşme Kapandığında</option>
                          {direction === 'whatsapp' && (
                            <option value="on_whatsapp_message">💬 WhatsApp Mesajı Geldiğinde</option>
                          )}
                        </select>
                      </div>

                      {d.action === 'webhook' && (
                        <div style={{ padding: 12, borderRadius: 10, background: '#dc2626', border: '1px solid #b91c1c', fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: '#ffffff' }}>⛔ {LEGACY_WEBHOOK_MESSAGE} Görüşme sırasında bu adım atlanır; üstteki çöp kutusuyla silebilirsiniz.</span>
                        </div>
                      )}

                      {d.action === 'set_variable' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Değişken Adı</label>
                            <input
                              value={(d.variableName as string) || ''}
                              onChange={e => updateSelectedNode({ variableName: e.target.value })}
                              placeholder="Örn: oncelik, etiket, islem_turu"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Atanacak Değer</label>
                            <input
                              value={(d.variableValue as string) || ''}
                              onChange={e => updateSelectedNode({ variableValue: e.target.value })}
                              placeholder="Örn: acil_hasta"
                              style={inputStyle}
                            />
                          </div>
                        </div>
                      )}

                      {(d.action === 'send_sms' || d.action === 'wait_reprompt' || d.action === 'wait' || d.action === 'switch_prompt') && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>
                            {d.action === 'send_sms' ? 'SMS Mesaj Metni' : d.action === 'switch_prompt' ? 'Yeni Konuşma Talimatı' : 'Yeniden Sorulacak Mesaj'}
                          </label>
                          <textarea
                            value={(d.promptInstruction as string) || (d.message as string) || ''}
                            onChange={e => updateSelectedNode({ message: e.target.value, promptInstruction: e.target.value })}
                            placeholder="Mesaj veya talimat metnini girin..."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                        </div>
                      )}

                      {d.action === 'send_wa_message' && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Gönderilecek WhatsApp Yanıtı</label>
                          <textarea
                            value={(d.message as string) || ''}
                            onChange={e => updateSelectedNode({ message: e.target.value })}
                            placeholder="Talebiniz alınmıştır, en kısa sürede dönüş yapacağız."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                        </div>
                      )}

                      {d.action === 'end_call' && (
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Kapanış Mesajı (Yapay Zeka Okur)</label>
                          <textarea
                            value={d.message || ''}
                            onChange={e => updateSelectedNode({ message: e.target.value })}
                            placeholder="Bilgileriniz alındı, sağlıklı günler dileriz."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                        </div>
                      )}

                      {d.action === 'send_wa_location' && (
                        <WhatsAppLocationAddressPicker
                          nodeData={d}
                          updateSelectedNode={updateSelectedNode}
                          inputStyle={inputStyle}
                        />
                      )}

                      {d.action === 'transfer_call' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Aktarılacak Hedef (Rehber veya Numara)</label>
                            <PhoneMaskedInput
                              mode="phoneOrLabel"
                              list="phonebook-options"
                              value={d.transferNumber || ''}
                              onValueChange={transferNumber => updateSelectedNode({ transferNumber })}
                              placeholder="Örn: resepsiyon, banko veya 0 (532) 000 00 00"
                              style={inputStyle}
                            />
                            <datalist id="phonebook-options">
                              {phonebook.map(p => (
                                <option key={p.label} value={p.number || p.label}>{p.label}</option>
                              ))}
                              {phonebook.length === 0 && (
                                <>
                                  <option value="resepsiyon">Resepsiyon</option>
                                  <option value="banko">Banko</option>
                                  <option value="acil">Acil Hat</option>
                                </>
                              )}
                            </datalist>
                          </div>

                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Global Tetikleyici Anahtar Kelimeler (Opsiyonel)</label>
                            <input
                              value={(d.triggerKeywords as string) || ''}
                              onChange={e => updateSelectedNode({ triggerKeywords: e.target.value })}
                              placeholder="Örn: yetkili, yönetici, operatör, bağla"
                              style={inputStyle}
                            />
                          </div>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: 'var(--card-inner)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={d.requireConfirmation !== false}
                              onChange={e => updateSelectedNode({ requireConfirmation: e.target.checked })}
                              style={{ width: 16, height: 16, accentColor: '#2563eb' }}
                            />
                            Aktarmadan önce kullanıcıdan sesli onay iste
                          </label>

                          {d.requireConfirmation !== false && (
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Onay Sorusu (Opsiyonel)</label>
                              <input
                                value={d.confirmationQuestion || ''}
                                onChange={e => updateSelectedNode({ confirmationQuestion: e.target.value })}
                                placeholder="Örn: Sizi müşteri temsilcimize aktarmamı ister misiniz?"
                                style={inputStyle}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Delete & Duplicate Footer Buttons */}
                {selectedNode && selectedNode.type !== 'startNode' && (
                  <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--input-border)', display: 'flex', gap: 8 }}>
                    {selectedNode.type !== 'endNode' && (
                      <button
                        type="button"
                        onClick={() => duplicateNode(selectedNode.id)}
                        style={{
                          flex: 1,
                          padding: '9px',
                          background: 'var(--card-inner)',
                          color: 'var(--foreground)',
                          border: '1px solid var(--input-border)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 11,
                          boxShadow: 'var(--pc-clay-btn)',
                        }}
                      >
                        ⧉ Düğümü Kopyala
                      </button>
                    )}
                    {(selectedNode.type !== 'endNode' || endNodeCount > 1) && (
                      <button
                        type="button"
                        onClick={() => deleteNode(selectedNode.id)}
                        style={{
                          flex: 1,
                          padding: '9px',
                          background: 'var(--flow-danger-bg)',
                          color: '#dc2626',
                          border: '1px solid #dc2626',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        🗑️ Düğümü Sil
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── TAB 2: LIVE INTERACTIVE SIMULATOR ── */}
            {rightTab === 'simulator' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {/* Simulator Header & Caller State Toggle */}
                <div style={{ padding: 12, background: 'var(--card-inner)', border: '1px solid var(--input-border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)' }}>🧪 Canlı Test</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 10,
                          background: simAiPowered ? '#16a34a' : '#2563eb',
                          color: '#ffffff',
                        }}
                      >
                        <span style={{ color: '#ffffff' }}>{simAiPowered ? '🤖 Yapay zeka ve bilgi bankası etkin' : '🤖 Yapay zeka bağlantılı'}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={simLoading}
                      onClick={() => startSimulation(simFields.kayitli)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: simLoading ? 'wait' : 'pointer',
                      }}
                    >
                      <span style={{ color: '#ffffff' }}>{simLoading ? '⏳ İşleniyor...' : '🔄 Baştan Başlat'}</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <span style={{ color: 'var(--foreground-2)', fontWeight: 600 }}>Arayan Hasta Durumu:</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => startSimulation('true')}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 6,
                          border: '1px solid',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: simFields.kayitli === 'true' ? '#16a34a' : 'var(--card-bg)',
                          borderColor: simFields.kayitli === 'true' ? '#15803d' : 'var(--input-border)',
                          color: simFields.kayitli === 'true' ? '#ffffff' : 'var(--foreground)',
                        }}
                      >
                        <span style={{ color: simFields.kayitli === 'true' ? '#ffffff' : 'inherit' }}>✓ Kayıtlı Hasta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startSimulation('false')}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 6,
                          border: '1px solid',
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: simFields.kayitli === 'false' ? '#2563eb' : 'var(--card-bg)',
                          borderColor: simFields.kayitli === 'false' ? '#1d4ed8' : 'var(--input-border)',
                          color: simFields.kayitli === 'false' ? '#ffffff' : 'var(--foreground)',
                        }}
                      >
                        <span style={{ color: simFields.kayitli === 'false' ? '#ffffff' : 'inherit' }}>👤 Yeni Hasta</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Yazılı / Sesli anahtarı */}
                <div role="tablist" aria-label="Test şekli" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--input-bg)', border: '1.5px solid var(--input-border)', boxShadow: 'var(--pc-neo-inset)' }}>
                  {([['text', '⌨️ Yazılı'], ['voice', '🎙️ Sesli']] as const).map(([mode, label]) => {
                    const active = simMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setSimMode(mode)}
                        style={{
                          flex: 1, padding: '7px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          border: active ? '1.5px solid #1d4ed8' : '1.5px solid var(--input-border)',
                          background: active ? 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)' : 'var(--pc-surface)',
                          boxShadow: active ? 'var(--pc-clay-primary)' : 'var(--pc-clay-btn)',
                        }}
                      >
                        <span style={{ color: active ? '#ffffff' : 'var(--foreground)' }}>{label}</span>
                      </button>
                    )
                  })}
                </div>

                {simMode === 'voice' && (
                  <SimulatorVoicePanel
                    direction={direction === 'outbound' ? 'outbound' : 'inbound'}
                    nodes={nodes}
                    edges={edges}
                    callerProfile={{ kayitli: simFields.kayitli === 'true' ? 'true' : 'false' }}
                    onTranscript={e => setSimLog(prev => [...prev, { role: e.role === 'assistant' ? 'ai' : 'user', text: e.text }])}
                    onNodeVisited={id => {
                      setSimActive(true)
                      setSimCurrentNodeId(id)
                      setSimVisitedNodeIds(prev => (prev.includes(id) ? prev : [...prev, id]))
                    }}
                    onFieldsChanged={f => setSimFields(prev => ({ ...prev, ...f }))}
                  />
                )}

                {/* Conversation Log */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 180,
                    maxHeight: 260,
                    overflowY: 'auto',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: 10,
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    boxShadow: 'var(--pc-neo-inset)',
                  }}
                >
                  {simLog.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 8,
                        fontSize: 11,
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        background:
                          item.role === 'ai'
                            ? 'var(--flow-info-bg)'
                            : item.role === 'user'
                            ? 'var(--card-inner)'
                            : item.role === 'action'
                            ? 'var(--flow-success-bg)'
                            : 'var(--card-bg)',
                        border: `1px solid ${
                          item.role === 'ai'
                            ? 'var(--flow-info-border)'
                            : item.role === 'action'
                            ? '#16a34a'
                            : 'var(--input-border)'
                        }`,
                        color: item.role === 'action' ? '#15803d' : 'var(--foreground)',
                        fontWeight: item.role === 'action' ? 700 : 500,
                      }}
                    >
                      {item.text}
                    </div>
                  ))}
                </div>

                {/* Yazılı mod: seçili adım için mesaj girişi */}
                {simMode === 'text' && (() => {
                  const d = (selectedSimNode?.data || {}) as FieldData
                  const preset = PRESET_FIELDS.find(p => p.value === d.fieldName)
                  const samples =
                    selectedSimNode?.type === 'fieldNode'
                      ? d.fieldType === 'enum' && d.enumValues?.length
                        ? d.enumValues
                        : preset?.samples || ['Örnek Yanıt']
                      : ['Yarın saat 14:30 için diş ağrısı randevusu almak istiyorum', 'Muayene ücretiniz ne kadar?', 'Konum gönderebilir misiniz?']

                  return (
                    <div style={{ padding: 12, background: 'var(--card-inner)', border: '1.5px solid #2563eb', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>✍️ Yapay zeka asistana mesaj yazın:</span>
                        {simLoading && <span style={{ fontSize: 10, color: '#2563eb' }}>🤖 Yanıt hazırlanıyor…</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={simInput}
                          disabled={simLoading}
                          onChange={e => setSimInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitSimulationField() } }}
                          placeholder="Doğal bir cümle yazın; bilgiler otomatik ayıklanır…"
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                          type="button"
                          disabled={simLoading || !simInput.trim()}
                          onClick={() => submitSimulationField()}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            background: '#2563eb',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: simLoading || !simInput.trim() ? 'not-allowed' : 'pointer',
                            opacity: simLoading || !simInput.trim() ? 0.6 : 1,
                          }}
                        >
                          <span style={{ color: '#ffffff' }}>{simLoading ? '...' : 'Gönder →'}</span>
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {samples.map(sample => (
                          <button
                            key={sample}
                            type="button"
                            disabled={simLoading}
                            onClick={() => submitSimulationField(sample)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'var(--card-bg)',
                              border: '1px solid var(--input-border)',
                              color: 'var(--foreground-2)',
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: simLoading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            ⚡ {sample}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Condition Branch Manual Selector for user_intent */}
                {selectedSimNode?.type === 'conditionNode' && (
                  <div style={{ padding: 12, background: 'var(--card-inner)', border: '1.5px solid #d97706', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                      🔀 Koşul Dalını Test Edin:
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => chooseConditionBranchInSim('true')}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#16a34a', border: 'none', color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <span style={{ color: '#ffffff' }}>✓ Evet Dalına Git</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => chooseConditionBranchInSim('false')}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#dc2626', border: 'none', color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        <span style={{ color: '#ffffff' }}>✕ Hayır Dalına Git</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Global Keyword Trigger Test Box */}
                <div style={{ padding: 10, background: 'var(--card-inner)', border: '1px solid var(--input-border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground-2)' }}>
                    ⚡ Global Anahtar Kelime Tetikleyici Testi (Örn: konum, yetkili):
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={simGlobalPhrase}
                      onChange={e => setSimGlobalPhrase(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); triggerGlobalKeywordInSim() } }}
                      placeholder="Örn: konum atar mısınız, yetkiliye bağla"
                      style={{ ...inputStyle, padding: '6px 9px', fontSize: 11 }}
                    />
                    <button
                      type="button"
                      onClick={triggerGlobalKeywordInSim}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 7,
                        background: 'var(--card-bg)',
                        border: '1px solid var(--input-border)',
                        color: 'var(--foreground)',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Tetikle
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: AI SYSTEM PROMPT PREVIEW ── */}
            {rightTab === 'prompt' && (() => {
              const previewText = buildPromptPreview(nodes, edges)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>📋 Üretilen AI Talimat Metni</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(previewText)
                        showToast('📋 AI talimat metni panoya kopyalandı')
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: 'var(--card-inner)',
                        border: '1px solid var(--input-border)',
                        color: 'var(--foreground)',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      📋 Kopyala
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-3)', lineHeight: 1.45 }}>
                    Tasarladığınız diyagram yapay zeka asistanına aşağıdaki adım adım talimat seti olarak iletilir:
                  </div>
                  <pre
                    style={{
                      flex: 1,
                      margin: 0,
                      padding: 12,
                      borderRadius: 10,
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      color: 'var(--foreground)',
                      fontSize: 11,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowY: 'auto',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      boxShadow: 'var(--pc-neo-inset)',
                    }}
                  >
                    {previewText}
                  </pre>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Bottom Interactive Guide Bar */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--flow-info-bg)',
          border: '1px solid var(--flow-info-border)',
          fontSize: 11,
          color: 'var(--flow-info-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <strong>💡 Kısa İpuçları:</strong> Düğümleri sürükleyerek taşıyın • Yuvarlak bağlantı noktalarından (●) sürükleyerek ok çizin • Seçili düğümü veya oku <strong>Silme</strong> tuşuyla kaldırabilirsiniz.
        </div>
        {simActive && (
          <button
            type="button"
            onClick={() => {
              setSimActive(false)
              setSimCurrentNodeId(null)
              setSimVisitedNodeIds([])
              setSimVisitedEdgeIds([])
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--card-bg)',
              border: '1px solid var(--flow-info-border)',
              color: 'var(--foreground)',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Simülasyon Vurgusunu Kapat
          </button>
        )}
      </div>
    </div>
  )
}
