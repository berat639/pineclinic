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
  webhookUrl?: string
  webhookSecret?: string
  webhookBodyTemplate?: string
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
  { value: 'sikayet', label: 'Şikayet / Endikasyon', type: 'text', desc: 'Şikayetiniz veya yaptırmak istediğiniz işlem nedir?', group: 'inbound', samples: ['Diş ağrısı ve kontrol', 'İmplant muayenesi', 'Diş taşı temizliği'] },
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
  webhook: '🔗 Dış Sisteme Gönder (Webhook)',
  set_variable: '🔧 Değişken Ata',
  send_sms: '💬 SMS Gönder',
  wait_reprompt: '⏳ Bekle / Yeniden Sor',
  wait: '⏳ Bekle / Yeniden Sor',
  switch_prompt: '🔄 Prompt / Mod Değiştir',
  end_call: '👋 Bilgi Ver ve Görüşmeyi Bitir',
  transfer_call: '📞 Aramayı Yetkiliye Aktar',
  transfer: '📞 Canlı Desteğe Aktar',
  send_wa_location: '📍 WhatsApp’tan Konum Gönder',
  send_wa_message: '📱 WhatsApp Mesajı Gönder',
  save_record: '💾 Veritabanına Kaydet',
}

// ── Client-Side Validation & Prompt Builder ───────────────────────────────────
const EXECUTABLE_ACTIONS = new Set([
  'save_appointment_pending', 'randevuOlustur', 'save_patient_note', 'notBirak',
  'transfer_call', 'transfer', 'end_call', 'send_wa_message', 'send_wa_location', 'save_record', 'webhook',
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
      if (!d.action || !EXECUTABLE_ACTIONS.has(String(d.action))) {
        issues.push({ nodeId: node.id, level: 'error', message: 'Bu işlem için geçerli bir işlem tipi seçin.' })
      } else if (d.action === 'webhook') {
        const url = String(d.webhookUrl || '').trim()
        if (!url || !/^https?:\/\/.+/i.test(url)) {
          issues.push({ nodeId: node.id, level: 'error', message: 'Webhook işlemi için geçerli bir URL (https://...) girin.' })
        }
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
  const lines: string[] = ['KONUŞMA AKIŞI VE TALİMATLARI:']
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
  const visited = new Set<string>()

  function traverse(nodeId: string, indent: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return
    const d = (node.data || {}) as Record<string, any>
    const prefix = '  '.repeat(indent)

    switch (node.type) {
      case 'startNode':
        lines.push(`${prefix}${step}. Karşılama mesajını söyleyerek söze başla.`)
        step++
        break
      case 'fieldNode':
        lines.push(`${prefix}${step}. "${d.fieldName || 'alan'}" bilgisini sor${d.required ? ' (zorunlu)' : ''}: "${d.description || ''}"`)
        step++
        break
      case 'conditionNode': {
        const field = d.conditionField || ''
        const val = d.conditionValue || ''
        if (field === 'user_intent' || d.operator === 'intent') {
          lines.push(`${prefix}${step}. KOŞUL (KULLANICI NİYETİ): Kullanıcının ifadesi "${val}" niyetini taşıyorsa:`)
        } else if (field === 'kayitli') {
          const isReg = String(val).toLowerCase() !== 'false'
          lines.push(`${prefix}${step}. KOŞUL (HASTA KAYIT DURUMU): musteriSorgula sonucuna göre hasta ${isReg ? 'kayıtlı ise (kayitli=true)' : 'kayıtlı değilse (kayitli=false)'}:`)
        } else {
          const op = d.operator === 'equals' ? '==' : d.operator === 'contains' ? 'içeriyorsa' : 'boş değilse'
          lines.push(`${prefix}${step}. KOŞUL: "${field}" ${op} "${val}" ise:`)
        }
        step++
        const nextEdges = edgeMap.get(nodeId) || []
        const trueEdge = nextEdges.find(e => e.sourceHandle === 'true')
        const falseEdge = nextEdges.find(e => e.sourceHandle === 'false')
        if (trueEdge) {
          lines.push(`${prefix}  - Evet (Yeşil Yol):`)
          traverse(trueEdge.target, indent + 2)
        }
        if (falseEdge) {
          lines.push(`${prefix}  - Hayır (Kırmızı Yol):`)
          traverse(falseEdge.target, indent + 2)
        }
        return
      }
      case 'actionNode': {
        const act = d.action
        if (act === 'transfer_call') {
          lines.push(`${prefix}${step}. ARAMAYI AKTAR: Hedef "${d.transferNumber || 'resepsiyon'}" (${d.requireConfirmation !== false ? 'Önce onay iste' : 'Doğrudan aktar'}).`)
        } else if (act === 'send_wa_location') {
          lines.push(`${prefix}${step}. WHATSAPP KONUM GÖNDER: whatsappKonumGonder aracını çağır.`)
        } else if (act === 'send_wa_message') {
          lines.push(`${prefix}${step}. WHATSAPP MESAJI GÖNDER: "${d.message || ''}"`)
        } else if (act === 'save_patient_note' || act === 'notBirak') {
          lines.push(`${prefix}${step}. HASTADAN NOT AL: hastaNotKaydet aracını çağırarak notu kaydet.`)
        } else if (act === 'end_call') {
          lines.push(`${prefix}${step}. BİLGİ VER VE BİTİR: ${d.message ? `"${d.message}" diyerek ` : ''}cagriySonlandir aracını çağır.`)
        } else if (act === 'webhook') {
          lines.push(`${prefix}${step}. DIŞ SİSTEM (WEBHOOK): Toplanan bilgileri ${d.webhookUrl || 'Webhook URL'} adresine gönder.`)
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
      if (!visited.has(e.target)) traverse(e.target, indent)
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
              <span style={{ color: '#ffffff' }}>{data.fieldType}</span>
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

function ConditionNode({ id, data, selected }: { id: string; data: ConditionData; selected?: boolean }) {
  const labels: Record<string, string> = {
    kayitli: 'Hasta Kayıtlı mı?',
    user_intent: 'Kullanıcı Niyeti Algılama',
  }
  const presetField = PRESET_FIELDS.find(f => f.value === data.conditionField)
  const humanLabel = labels[data.conditionField] || presetField?.label || (data.conditionField ? `${data.conditionField} Kontrolü` : 'Koşul Seçilmedi')
  const isSim = data._simStatus === 'active'

  const summaryText = useMemo(() => {
    if (data.conditionField === 'user_intent' || data.operator === 'intent') {
      return data.conditionValue ? `🎯 "${data.conditionValue}"` : 'Niyet açıklaması girilmedi'
    }
    if (data.operator === 'notEmpty') return 'Boş değilse → Evet'
    if (data.conditionField === 'kayitli') {
      return data.conditionValue === 'false' ? 'Kayıtsız ise → Evet' : 'Kayıtlı ise → Evet'
    }
    const opLabel = data.operator === 'contains' ? 'içerir:' : 'eşit:'
    return `${opLabel} "${data.conditionValue || '...'}"`
  }, [data.conditionField, data.operator, data.conditionValue])

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
  const displayLabel = ACTION_LABELS[data.action] || data.label || '⚡ İşlem Seçilmedi'
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
      {data.action === 'webhook' && data.webhookUrl && (
        <div style={{ marginTop: 5, fontSize: 9, color: 'var(--foreground-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🔗 {data.webhookUrl}
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
export default function FlowBuilder({ direction = 'inbound' }: { direction?: 'inbound' | 'outbound' | 'whatsapp' }) {
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
  const [simGlobalPhrase, setSimGlobalPhrase] = useState('')
  const [simLog, setSimLog] = useState<Array<{ role: 'system' | 'ai' | 'user' | 'action'; text: string }>>([])

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const pushHistory = useCallback((nextNodes: Node[], nextEdges: Edge[], markDirty = true) => {
    if (skipHistoryRef.current) return
    const cleanNodes = nextNodes.map(n => {
      const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, ...restData } = (n.data || {}) as any
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
      const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, ...cleanData } = (orig.data || {}) as any
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
        },
      }
    })
  }, [nodes, liveIssues, simActive, simCurrentNodeId, simVisitedNodeSet, selectedNodeId, duplicateNode, deleteNode, endNodeCount])

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
  const loadSampleFlow = () => {
    if (direction === 'outbound') {
      if (!window.confirm('Örnek hasta memnuniyet anket akışını yüklemek mevcut giden arama akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const surveyNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 250, y: 20 }, data: { label: 'Giden Arama Başladı' } },
        { id: 'field_memnuniyet', type: 'fieldNode', position: { x: 250, y: 140 }, data: { label: 'Memnuniyet Durumu (Anket)', fieldName: 'memnuniyet', fieldType: 'text', description: 'Son kliniğimize ziyaretinizden ve tedavinizden memnun kaldınız mı?', required: true } },
        { id: 'field_puan', type: 'fieldNode', position: { x: 250, y: 280 }, data: { label: 'Değerlendirme Puanı (1-10)', fieldName: 'puan', fieldType: 'text', description: 'Hizmetimizi 1 ile 10 arasında değerlendirecek olsanız kaç puan verirsiniz?', required: false } },
        { id: 'field_oneri', type: 'fieldNode', position: { x: 250, y: 420 }, data: { label: 'Hasta Notu / Önerisi', fieldName: 'hastaNotu', fieldType: 'text', description: 'Bizlere iletmek istediğiniz özel bir notunuz veya öneriniz var mı?', required: false } },
        { id: 'action_not', type: 'actionNode', position: { x: 250, y: 560 }, data: { action: 'save_patient_note', label: '🗒️ Hastadan Not Al (Bankoya İlet)' } },
        { id: 'end', type: 'endNode', position: { x: 250, y: 700 }, data: { label: 'Teşekkür Et ve Bitir', message: 'Değerli geri bildiriminiz için teşekkür eder, sağlıklı günler dileriz.' } },
      ]
      const surveyEdges = decorateEdges([
        { id: 'e1', source: 'start', target: 'field_memnuniyet' },
        { id: 'e2', source: 'field_memnuniyet', target: 'field_puan' },
        { id: 'e3', source: 'field_puan', target: 'field_oneri' },
        { id: 'e4', source: 'field_oneri', target: 'action_not' },
        { id: 'e5', source: 'action_not', target: 'end' },
      ], surveyNodes)

      const layouted = layoutNodes(surveyNodes, surveyEdges)
      setNodes(layouted)
      setEdges(surveyEdges)
      pushHistory(layouted, surveyEdges)
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 350 }), 60)
      showToast('🌟 Örnek giden arama anket akışı yüklendi')
      return
    }

    if (direction === 'whatsapp') {
      if (!window.confirm('Örnek WhatsApp asistan akışını yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

      const waNodes: Node[] = [
        { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'WhatsApp Mesajı Geldi' } },
        { id: 'cond_kayitli', type: 'conditionNode', position: { x: 260, y: 130 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true', label: 'Hasta Kayıtlı mı?' } },
        // Evet (Sol - 30% handle)
        { id: 'field_sikayet', type: 'fieldNode', position: { x: 60, y: 280 }, data: { label: 'Şikayet / Endikasyon', fieldName: 'sikayet', fieldType: 'text', description: 'Size hangi işlem veya şikayetiniz için yardımcı olabilirim?', required: true } },
        // Hayır (Sağ - 70% handle)
        { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 440, y: 280 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Merhabalar, size nasıl hitap edebilirim? Adınızı ve soyadınızı öğrenebilir miyim?', required: true } },
        { id: 'field_tarih', type: 'fieldNode', position: { x: 260, y: 420 }, data: { label: 'Randevu Tarihi', fieldName: 'tarih', fieldType: 'date', description: 'Hangi gün için randevu oluşturmamı istersiniz?', required: true } },
        { id: 'field_saat', type: 'fieldNode', position: { x: 260, y: 550 }, data: { label: 'Randevu Saati', fieldName: 'saat', fieldType: 'time', description: 'Saat kaç sizin için uygundur?', required: true } },
        { id: 'action_randevu', type: 'actionNode', position: { x: 260, y: 680 }, data: { action: 'save_appointment_pending', label: '📝 Randevu Talebi Oluştur (Onay Bekler)' } },
        { id: 'end', type: 'endNode', position: { x: 260, y: 810 }, data: { label: 'Talebi Onayla ve Bitir' } },
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
      showToast('🌟 Örnek WhatsApp asistan akışı yüklendi')
      return
    }

    if (!window.confirm('Örnek hasta kayıt ve randevu akışını yüklemek mevcut akışınızı değiştirecektir. Onaylıyor musunuz?')) return

    const sampleNodes: Node[] = [
      { id: 'start', type: 'startNode', position: { x: 260, y: 20 }, data: { label: 'Karşılama Mesajı' } },
      { id: 'cond_kayitli', type: 'conditionNode', position: { x: 260, y: 130 }, data: { conditionField: 'kayitli', operator: 'equals', conditionValue: 'true', label: 'Hasta Kayıtlı mı?' } },
      // Evet dalı (Sol)
      { id: 'field_sikayet', type: 'fieldNode', position: { x: 60, y: 280 }, data: { label: 'Şikayet / Endikasyon', fieldName: 'sikayet', fieldType: 'text', description: 'Şikayetiniz veya yaptırmak istediğiniz işlem nedir?', required: false } },
      // Hayır dalı (Sağ)
      { id: 'field_musteri_adi', type: 'fieldNode', position: { x: 440, y: 280 }, data: { label: 'Hasta Adı ve Soyadı', fieldName: 'musteri_adi', fieldType: 'text', description: 'Adınızı ve soyadınızı alabilir miyim?', required: true } },
      { id: 'field_tel', type: 'fieldNode', position: { x: 440, y: 410 }, data: { label: 'Telefon Numarası', fieldName: 'telefon', fieldType: 'text', description: 'Size ulaşabileceğimiz telefon numaranızı alabilir miyim?', required: true } },
      // Ortak devam
      { id: 'field_tarih', type: 'fieldNode', position: { x: 260, y: 540 }, data: { label: 'Randevu Tarihi', fieldName: 'tarih', fieldType: 'date', description: 'Hangi tarihe randevu oluşturmak istersiniz?', required: true } },
      { id: 'field_saat', type: 'fieldNode', position: { x: 260, y: 670 }, data: { label: 'Randevu Saati', fieldName: 'saat', fieldType: 'time', description: 'Saat kaç için randevu istersiniz?', required: true } },
      { id: 'action_randevu', type: 'actionNode', position: { x: 260, y: 800 }, data: { action: 'save_appointment_pending', label: '📝 Randevu Talebi Oluştur (Onay Bekler)' } },
      { id: 'end', type: 'endNode', position: { x: 260, y: 920 }, data: { label: 'Görüşmeyi Bitir' } },
    ]

    const sampleEdges = decorateEdges([
      { id: 'e_s_c', source: 'start', target: 'cond_kayitli' },
      { id: 'e_c_true', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet' },
      { id: 'e_c_false', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_musteri_adi' },
      { id: 'e_ad_tel', source: 'field_musteri_adi', target: 'field_tel' },
      { id: 'e_tel_sik', source: 'field_tel', target: 'field_sikayet' },
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
    showToast('🌟 Örnek gelen arama randevu akışı yüklendi')
  }

  const saveFlow = async () => {
    if (saving) return
    setSaving(true)
    try {
      const serverNodes = nodes.map(n => {
        const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, ...cleanData } = (n.data || {}) as any
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
        const { _issue, _simStatus, _onDuplicate, _onDelete, _canDelete, ...cleanData } = (n.data || {}) as any
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
    const initLog = [{ role: 'system' as const, text: `🧪 AI Simülasyonu başlatıldı (Hasta Kayıtlı mı: ${regVal === 'true' ? 'Evet' : 'Hayır'})` }]
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
            <option value="legacy">Prompt Tabanlı (Esnek AI)</option>
            <option value="observe">Gözlem Modu (Test / Log)</option>
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

        <button
          type="button"
          onClick={loadSampleFlow}
          style={{
            padding: '6px 12px',
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
          🌟 Örnek Akış Yükle
        </button>

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
              <span style={{ color: rightTab === 'prompt' ? '#ffffff' : 'inherit' }}>📋 AI Prompt</span>
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
                            <optgroup label="📥 Gelen Arama / Randevu Alanları">
                              {PRESET_FIELDS.filter(f => f.group === 'inbound').map(f => (
                                <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                              ))}
                            </optgroup>
                            <optgroup label="📤 Giden Arama / Anket Alanları">
                              {PRESET_FIELDS.filter(f => f.group === 'outbound').map(f => (
                                <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                              ))}
                            </optgroup>
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
                          <option value="date">Tarih (YYYY-MM-DD)</option>
                          <option value="time">Saat (HH:MM)</option>
                          <option value="enum">Seçenekli Liste (Enum)</option>
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
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Kontrol Edilecek Bilgi / Durum</label>
                        <select
                          value={d.conditionField || ''}
                          onChange={e => {
                            const val = e.target.value
                            updateSelectedNode({
                              conditionField: val,
                              operator: val === 'user_intent' ? 'intent' : d.operator === 'intent' ? 'equals' : (d.operator || 'equals'),
                              ...(val === 'kayitli' && !d.conditionValue ? { conditionValue: 'true' } : {}),
                            })
                          }}
                          style={inputStyle}
                        >
                          <option value="">Bir alan seçin...</option>
                          <option value="kayitli">👤 Hasta Sistemde Kayıtlı mı? (kayitli)</option>
                          <option value="user_intent">🎯 Özel Niyet / İstek Algılama (user_intent)</option>
                          <optgroup label="⚙️ Sistem Değişkenleri">
                            <option value="caller.isKnownPatient">Kayıtlı Hasta mı? (caller.isKnownPatient)</option>
                            <option value="caller.isVip">VIP Arayan mı? (caller.isVip)</option>
                            <option value="caller.hasUpcomingAppointment">Yaklaşan Randevusu Var mı? (caller.hasUpcomingAppointment)</option>
                            <option value="clinic.isOpen">Klinik Şu An Açık mı? (clinic.isOpen)</option>
                            <option value="time.hour">Günün Saati 0-23 (time.hour)</option>
                            <option value="time.weekday">Haftanın Günü 1-7 (time.weekday)</option>
                            <option value="call.direction">Arama Yönü (call.direction)</option>
                            <option value="call.channel">Kanal (call.channel)</option>
                            <option value="call.silenceCount">Sessizlik Sayısı (call.silenceCount)</option>
                            <option value="call.durationSec">Görüşme Süresi sn (call.durationSec)</option>
                          </optgroup>
                          <optgroup label="Hazır Alanlar">
                            {PRESET_FIELDS.map(f => (
                              <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                            ))}
                          </optgroup>
                          {customCanvasFieldNames.length > 0 && (
                            <optgroup label="Akıştaki Özel Alanlar">
                              {customCanvasFieldNames.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {d.conditionField === 'user_intent' ? (
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--flow-info-bg)', border: '1px solid var(--flow-info-border)' }}>
                          <label style={{ fontSize: 11, color: 'var(--flow-info-text)', display: 'block', marginBottom: 6, fontWeight: 700 }}>
                            🧠 Yapay Zeka Hangi Niyeti Algılasın?
                          </label>
                          <textarea
                            value={d.conditionValue || ''}
                            onChange={e => updateSelectedNode({ conditionValue: e.target.value, operator: 'intent' })}
                            placeholder="Örn: Arayan kişi fiyat bilgisi soruyor veya yetkili biriyle görüşmek istediğini söylüyor."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                          />
                          <div style={{ fontSize: 10, color: 'var(--flow-info-text)', marginTop: 8, lineHeight: 1.4 }}>
                            Bu niyet algılanırsa <strong>✓ Evet (Sol Yeşil Ok)</strong>, algılanmazsa <strong>✕ Hayır (Sağ Kırmızı Ok)</strong> yoluna gidilir.
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Karşılaştırma Kuralı</label>
                            <select value={d.operator || 'equals'} onChange={e => updateSelectedNode({ operator: e.target.value as any })} style={inputStyle}>
                              <option value="equals">Tam olarak eşitse (==)</option>
                              <option value="notEquals">Eşit değilse (!=)</option>
                              <option value="contains">Şu ifadeyi içeriyorsa</option>
                              <option value="notContains">Şu ifadeyi içermiyorsa</option>
                              <option value="startsWith">Şununla başlıyorsa</option>
                              <option value="in">Listedeki değerlerden biriyse (virgüllü)</option>
                              <option value="gt">Sayısal olarak büyükse (&gt;)</option>
                              <option value="gte">Sayısal olarak büyük veya eşitse (&gt;=)</option>
                              <option value="lt">Sayısal olarak küçükse (&lt;)</option>
                              <option value="lte">Sayısal olarak küçük veya eşitse (&lt;=)</option>
                              <option value="between">İki sayı arasındaysa (Örn: 9-18)</option>
                              <option value="regex">Regex deseniyle eşleşiyorsa</option>
                              <option value="notEmpty">Boş değilse (Cevap verildiyse)</option>
                              <option value="isEmpty">Boşsa (Cevap verilmediyse)</option>
                            </select>
                          </div>

                          {d.operator !== 'notEmpty' && d.operator !== 'isEmpty' && (
                            <div style={{ padding: 12, borderRadius: 10, background: 'var(--flow-success-bg)', border: '1px solid #16a34a' }}>
                              <label style={{ fontSize: 11, color: '#15803d', display: 'block', marginBottom: 6, fontWeight: 700 }}>
                                ✓ Hangi Durumda &ldquo;Evet&rdquo; (Yeşil Ok) Yönüne Gidilsin?
                              </label>
                              <select
                                value={d.conditionValue === 'true' || d.conditionValue === 'false' ? d.conditionValue : 'custom'}
                                onChange={e => updateSelectedNode({ conditionValue: e.target.value === 'custom' ? '' : e.target.value })}
                                style={{ ...inputStyle, marginBottom: d.conditionValue === 'true' || d.conditionValue === 'false' ? 0 : 8 }}
                              >
                                <option value="true">Evet / Olumluysa (true)</option>
                                <option value="false">Hayır / Olumsuzsa (false)</option>
                                <option value="custom">Özel Bir Kelime / Değer Gir...</option>
                              </select>

                              {d.conditionValue !== 'true' && d.conditionValue !== 'false' && (
                                <input
                                  value={d.conditionValue || ''}
                                  onChange={e => updateSelectedNode({ conditionValue: e.target.value })}
                                  placeholder="Örn: ağrı, implant, acil..."
                                  style={inputStyle}
                                />
                              )}
                            </div>
                          )}
                        </>
                      )}
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
                          <option value="webhook">🔗 Dış Sisteme Gönder (Webhook API)</option>
                          <option value="set_variable">🔧 Değişken Ata (set_variable)</option>
                          <option value="send_sms">💬 SMS Gönder (send_sms)</option>
                          <option value="wait_reprompt">⏳ Bekle / Yeniden Sor (wait_reprompt)</option>
                          <option value="switch_prompt">🔄 Prompt / Mod Değiştir (switch_prompt)</option>
                          {direction === 'whatsapp' ? (
                            <option value="send_wa_message">📱 WhatsApp Mesajı Gönder</option>
                          ) : (
                            <>
                              <option value="end_call">👋 Bilgi Ver ve Görüşmeyi Bitir</option>
                              <option value="transfer_call">📞 Aramayı Yetkiliye Aktar</option>
                              <option value="send_wa_location">📍 Arayana WhatsApp’tan Konum Gönder</option>
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
                          <option value="on_silence">🤫 Sessizlik Olduğunda (on_silence)</option>
                          <option value="on_no_match">❓ Cevap Anlaşılamadığında (on_no_match)</option>
                          <option value="on_transfer_fail">📵 Aktarım Başarısız Olduğunda (on_transfer_fail)</option>
                          <option value="on_call_end">📴 Görüşme Kapandığında (on_call_end)</option>
                          <option value="on_whatsapp_message">💬 WhatsApp Mesajı Geldiğinde (on_whatsapp_message)</option>
                        </select>
                      </div>

                      {d.action === 'webhook' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Webhook URL (HTTP POST)</label>
                            <input
                              value={d.webhookUrl || ''}
                              onChange={e => updateSelectedNode({ webhookUrl: e.target.value })}
                              placeholder="https://hooks.zapier.com/... veya n8n Webhook URL"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>
                              JSON Gövde Şablonu (Opsiyonel, {'{{musteri_adi}}'} destekler)
                            </label>
                            <textarea
                              value={(d.webhookBodyTemplate as string) || ''}
                              onChange={e => updateSelectedNode({ webhookBodyTemplate: e.target.value })}
                              placeholder={'{"name": "{{musteri_adi}}", "phone": "{{telefon}}"}'}
                              rows={3}
                              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                            />
                          </div>
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
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-2)', display: 'block', marginBottom: 6 }}>Atanacak Değer ({'{{alan}}'} destekler)</label>
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
                            {d.action === 'send_sms' ? 'SMS Şablonu ({{musteri_adi}}, {{tarih}})' : d.action === 'switch_prompt' ? 'Yeni Prompt / Mod Talimatı' : 'Yeniden Sorulacak Mesaj'}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--flow-success-bg)', border: '1px solid #16a34a', borderRadius: 10 }}>
                          <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                            📍 Arayan numaraya kayıtlı klinik konumu Evolution API üzerinden WhatsApp mesajı olarak gönderilir.
                          </div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>Global Tetikleyici İfadeler</label>
                          <input
                            value={(d.triggerKeywords as string) || ''}
                            onChange={e => updateSelectedNode({ triggerKeywords: e.target.value })}
                            placeholder="konum, adres, yol tarifi, nasıl gelebilirim"
                            style={inputStyle}
                          />
                        </div>
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
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--foreground)' }}>🧪 Canlı AI Simülatörü</span>
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
                        <span style={{ color: '#ffffff' }}>{simAiPowered ? '🤖 Canlı AI + RAG Aktif' : '🤖 AI Bağlantılı'}</span>
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

                {/* Active Step Interactive Input (Works for any step with natural AI + RAG) */}
                {(() => {
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
                        <span>✍️ AI Asistana Mesaj Yazın {d.fieldName ? `(${d.fieldName})` : ''}:</span>
                        {simLoading && <span style={{ fontSize: 10, color: '#2563eb' }}>🤖 AI yanıt üretiyor...</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={simInput}
                          disabled={simLoading}
                          onChange={e => setSimInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitSimulationField() } }}
                          placeholder="Doğal cümle veya yanıt yazın (AI alanları otomatik çıkarır)..."
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
          <strong>💡 Kısa İpuçları:</strong> Düğümleri sürükleyerek taşıyın • Yuvarlak bağlantı noktalarından (●) sürükleyerek ok çizin • Seçili düğümü veya oku <strong>Delete / Backspace</strong> tuşuyla silebilirsiniz.
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
