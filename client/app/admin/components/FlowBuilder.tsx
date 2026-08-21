'use client'
// @ts-nocheck — xyflow generics conflict with strict mode, pre-existing
import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FieldData {
  [key: string]: unknown
  label: string
  fieldName: string
  description: string
  required: boolean
  fieldType: 'text' | 'date' | 'time' | 'enum' | 'user'
  enumValues?: string[]
}
interface ConditionData {
  [key: string]: unknown
  label: string
  conditionField: string
  operator: 'equals' | 'contains' | 'notEmpty'
  conditionValue: string
}
interface ActionData { [key: string]: unknown; label: string; action: string; message?: string; webhookUrl?: string; transferNumber?: string }
interface StartData { [key: string]: unknown; label: string }
interface EndData { [key: string]: unknown; label: string }

type FlowNodeData = FieldData | ConditionData | ActionData | StartData | EndData

// ── Auto Layout ───────────────────────────────────────────────────────────────
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  for (const n of nodes) g.setNode(n.id, { width: 260, height: n.type === 'conditionNode' ? 80 : 60 })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - 130, y: pos.y - 30 } }
  })
}

// ── Custom Nodes ──────────────────────────────────────────────────────────────
function StartNode() {
  return (
    <div style={{ padding: '10px 20px', borderRadius: 20, background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', minWidth: 180 }}>
      ▶ Karşılama Mesajı
      <Handle type="source" position={Position.Bottom} style={{ background: '#22c55e' }} />
    </div>
  )
}

function FieldNode({ data }: { data: FieldData }) {
  // Find matching field in the predefined list, else use the raw field name
  const PATIENT_FIELDS = [
    { value: 'hastaAdiSoyadi', label: 'Hasta Adı ve Soyadı' },
    { value: 'hastaTelefonu', label: 'Telefon Numarası' },
    { value: 'tcKimlikNo', label: 'TC Kimlik Numarası' },
    { value: 'hastaSikayeti', label: 'Şikayet / Endikasyon' },
    { value: 'randevuTarihi', label: 'Randevu Tarihi' },
    { value: 'randevuSaati', label: 'Randevu Saati' },
    { value: 'doktor_id', label: 'Doktor Seçimi' },
    { value: 'tercihEdilenHekim', label: 'Tercih Edilen Hekim (Eski)' }
  ];
  const fieldInfo = PATIENT_FIELDS.find(f => f.value === data.fieldName);
  const displayLabel = fieldInfo ? fieldInfo.label : (data.fieldName || 'Alan Seçilmedi');

  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--flow-node-field)', border: '1px solid var(--flow-node-field-border)', minWidth: 220 }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--flow-node-field-border)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <code style={{ fontSize: 11, fontWeight: 600, color: '#7dd3fc', background: 'rgba(0,0,0,0.2)', padding: '1px 6px', borderRadius: 4 }}>{displayLabel}</code>
        {data.required && <span style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(251,146,60,0.2)', borderRadius: 8, color: '#fb923c', fontWeight: 600 }}>zorunlu</span>}
        {data.fieldType !== 'text' && <span style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(139,92,246,0.2)', borderRadius: 8, color: '#a78bfa' }}>{data.fieldType}</span>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--flow-text-muted)', lineHeight: 1.4 }}>{data.description || 'Soru girilmedi...'}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--flow-node-field-border)' }} />
    </div>
  )
}

function ConditionNode({ data }: { data: ConditionData }) {
  const labels: Record<string, string> = {
    'kayitli': 'Hasta kayıtlı mı?',
  }
  const humanLabel = labels[data.conditionField] || (data.conditionField ? `${data.conditionField} kontrol` : 'Koşul')
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--flow-node-cond)', border: '1px solid var(--flow-node-cond-border)', minWidth: 220, position: 'relative' }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--flow-node-cond-border)' }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#fbbf24', textAlign: 'center' }}>
        🔀 {humanLabel}
      </div>
      <Handle type="source" position={Position.Bottom} id="true" style={{ background: '#22c55e', left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false" style={{ background: '#ef4444', left: '70%' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: 'var(--flow-text-muted)' }}>
        <span style={{ color: '#22c55e' }}>Evet ↓</span>
        <span style={{ color: '#ef4444' }}>Hayır ↓</span>
      </div>
    </div>
  )
}

function ActionNode({ data }: { data: ActionData }) {
  const labelMap: any = {
     'save_record': '💾 Veritabanına Kaydet',
     'randevuOlustur': '💾 Randevu Oluştur (Kayıt)',
     'webhook': '🔗 Webhook İsteği',
     'end_call': '👋 Bilgi Ver & Kapat',
     'transfer': '📞 Operatöre Aktar'
  }
  const displayLabel = labelMap[data.action] || data.label || '⚡ İşlem';
  return (
    <div style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--flow-node-action)', border: '1px solid var(--flow-node-action-border)', minWidth: 180, textAlign: 'center' }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--flow-node-action-border)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa' }}>{displayLabel}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--flow-node-action-border)' }} />
    </div>
  )
}

function EndNode() {
  return (
    <div style={{ padding: '8px 20px', borderRadius: 20, background: 'var(--card-bg)', color: 'var(--flow-text-muted)', fontSize: 11, fontWeight: 600, textAlign: 'center', minWidth: 120, border: '1px solid var(--glass-border)' }}>
      <Handle type="target" position={Position.Top} style={{ background: '#64748b' }} />
      ✓ Bitti
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


const PATIENT_FIELDS = [
  { value: 'hastaAdiSoyadi', label: 'Hasta Adı ve Soyadı', type: 'text', desc: 'Adınızı ve soyadınızı alabilir miyim?' },
  { value: 'hastaTelefonu', label: 'Telefon Numarası', type: 'text', desc: 'Size ulaşabileceğimiz telefon numaranızı alabilir miyim?' },
  { value: 'tcKimlikNo', label: 'TC Kimlik Numarası', type: 'text', desc: 'Kayıt için TC kimlik numaranızı rica edebilir miyim?' },
  { value: 'hastaSikayeti', label: 'Şikayet / Endikasyon', type: 'text', desc: 'Şikayetiniz veya yaptırmak istediğiniz işlem nedir?' },
  { value: 'randevuTarihi', label: 'Randevu Tarihi', type: 'date', desc: 'Hangi tarihe randevu oluşturmak istersiniz?' },
  { value: 'randevuSaati', label: 'Randevu Saati', type: 'time', desc: 'Saat kaç için randevu istersiniz?' },
  { value: 'doktor_id', label: 'Doktor Seçimi', type: 'user', desc: 'Hangi doktora gelmek istersiniz?' },
  { value: 'tercihEdilenHekim', label: 'Tercih Edilen Hekim (Eski)', type: 'user', desc: 'Tercih ettiğiniz özel bir hekim var mı?' }
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function FlowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState([] as any)
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  
  // Sidebar state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Field names for condition dropdown
  const fieldNames = useMemo(() => {
    const fields = nodes.filter(n => n.type === 'fieldNode')
    return [...new Set(fields.map(n => (n.data as unknown as FieldData).fieldName))]
  }, [nodes])

  // Load flow
  useEffect(() => {
    fetch('/api/admin/flow')
      .then(r => r.json())
      .then(data => {
        if (data.nodes?.length > 0) {
          const TYPE_MAP: Record<string, string> = { START: 'startNode', FIELD: 'fieldNode', CONDITION: 'conditionNode', ACTION: 'actionNode', END: 'endNode' }
          const mapped = data.nodes.map((n: any) => ({
            ...n,
            type: TYPE_MAP[n.type] || n.type,
            data: {
              ...n.data,
              label: n.data.label || n.data.fieldName || n.data.action || n.type,
            },
          }))
          setNodes(mapped)
          setEdges(data.edges || [])
        } else {
          const defaultNodes: Node[] = [
            { id: 'start', type: 'startNode', position: { x: 100, y: 0 }, data: { label: 'Başla' } },
            { id: 'end', type: 'endNode', position: { x: 100, y: 100 }, data: { label: 'Bitti' } },
          ]
          const defaultEdges: Edge[] = [
            { id: 'start-end', source: 'start', target: 'end', markerEnd: { type: MarkerType.ArrowClosed } },
          ]
          setNodes(defaultNodes)
          setEdges(defaultEdges)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [setNodes, setEdges])

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#64748b' } }, eds))
  }, [setEdges])

  const autoLayout = useCallback(() => {
    setNodes(nds => layoutNodes(nds, edges))
  }, [edges, setNodes])

  
  const loadSampleFlow = () => {
    if(!window.confirm("Örnek hasta kayıt ve randevu akışını yüklemek mevcut akışınızı silecektir. Onaylıyor musunuz?")) return;
    
    const sampleNodes: Node[] = [
      { id: 'start', type: 'startNode', position: { x: 250, y: 0 }, data: { label: 'Başla' } },
      { id: 'cond_kayitli', type: 'conditionNode', position: { x: 250, y: 120 }, data: { conditionField: 'is_registered', operator: 'equals', conditionValue: 'true', label: 'Kayıtlı mı?' } },
      
      // Hayır (Kayıtlı değil) dalı
      { id: 'field_adsoyad', type: 'fieldNode', position: { x: 50, y: 250 }, data: { fieldName: 'hastaAdiSoyadi', fieldType: 'text', description: 'Adınızı ve soyadınızı alabilir miyim?', required: true } },
      { id: 'field_tc', type: 'fieldNode', position: { x: 50, y: 380 }, data: { fieldName: 'tcKimlikNo', fieldType: 'text', description: 'Kayıt için TC kimlik numaranızı rica edebilir miyim?', required: true } },
      
      // Evet dalı veya kayıt sonrası
      { id: 'field_sikayet', type: 'fieldNode', position: { x: 450, y: 250 }, data: { fieldName: 'hastaSikayeti', fieldType: 'text', description: 'Şikayetiniz veya yaptırmak istediğiniz işlem nedir?', required: false } },
      { id: 'field_tarih', type: 'fieldNode', position: { x: 450, y: 380 }, data: { fieldName: 'randevuTarihi', fieldType: 'date', description: 'Hangi tarihe randevu oluşturmak istersiniz?', required: true } },
      { id: 'field_saat', type: 'fieldNode', position: { x: 450, y: 510 }, data: { fieldName: 'randevuSaati', fieldType: 'time', description: 'Saat kaç için randevu istersiniz?', required: true } },
      
      // İşlem ve bitiş
      { id: 'action_randevu', type: 'actionNode', position: { x: 250, y: 640 }, data: { action: 'randevuOlustur', label: 'Randevu Oluştur' } },
      { id: 'end', type: 'endNode', position: { x: 250, y: 760 }, data: { label: 'Bitti' } }
    ];
    
    const sampleEdges: Edge[] = [
      { id: 'e_s_c', source: 'start', target: 'cond_kayitli', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e_c_false', source: 'cond_kayitli', sourceHandle: 'false', target: 'field_adsoyad', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e_ad_tc', source: 'field_adsoyad', target: 'field_tc', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e_tc_sik', source: 'field_tc', target: 'field_sikayet', markerEnd: { type: MarkerType.ArrowClosed } },
      
      { id: 'e_c_true', source: 'cond_kayitli', sourceHandle: 'true', target: 'field_sikayet', markerEnd: { type: MarkerType.ArrowClosed } },
      
      { id: 'e_sik_tar', source: 'field_sikayet', target: 'field_tarih', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e_tar_sa', source: 'field_tarih', target: 'field_saat', markerEnd: { type: MarkerType.ArrowClosed } },
      { id: 'e_sa_act', source: 'field_saat', target: 'action_randevu', markerEnd: { type: MarkerType.ArrowClosed } },
      
      { id: 'e_act_end', source: 'action_randevu', target: 'end', markerEnd: { type: MarkerType.ArrowClosed } }
    ];
    
    setNodes(sampleNodes);
    setEdges(sampleEdges);
  };

  const saveFlow = async () => {
    setSaving(true)
    try {
      const serverNodes = nodes.map(n => ({
        id: n.id,
        type: n.type === 'startNode' ? 'START' : n.type === 'fieldNode' ? 'FIELD' : n.type === 'conditionNode' ? 'CONDITION' : n.type === 'actionNode' ? 'ACTION' : 'END',
        position: n.position,
        data: n.data,
      }))
      await fetch('/api/admin/flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: serverNodes, edges }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  const addNode = (type: 'field' | 'condition' | 'action') => {
    const id = `node_${Date.now()}`
    
    let newNode: Node;
    if (type === 'field') {
      const fieldId = `alan_${Math.floor(Math.random() * 1000)}`
      newNode = {
        id, type: 'fieldNode',
        position: { x: 100, y: nodes.length * 80 + 20 },
        data: { label: fieldId, fieldName: fieldId, description: '', required: false, fieldType: 'text' } as FieldData,
      }
    } else if (type === 'condition') {
      newNode = {
        id, type: 'conditionNode',
        position: { x: 100, y: nodes.length * 80 + 20 },
        data: { label: 'Koşul', conditionField: '', operator: 'equals', conditionValue: '' } as ConditionData,
      }
    } else {
      newNode = {
        id, type: 'actionNode',
        position: { x: 100, y: nodes.length * 80 + 20 },
        data: { label: 'Randevu Oluştur', action: 'randevuOlustur' } as ActionData,
      }
    }
    
    setNodes(nds => [...nds, newNode])
    setSelectedNodeId(id)
  }

  const updateSelectedNode = (updates: any) => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNodeId) return n
      const newData = { ...n.data, ...updates }
      if (n.type === 'fieldNode' && updates.fieldName !== undefined) {
        const safeName = updates.fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_')
        newData.fieldName = safeName
        newData.label = safeName
      }
      return { ...n, data: newData }
    }))
  }

  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'start' || nodeId === 'end') return
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [setNodes, setEdges, selectedNodeId])

  if (!loaded) return <div style={{ padding: 24, color: 'var(--foreground-3)' }}>Yükleniyor...</div>

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--foreground)', fontSize: 12, outline: 'none' }
  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>🔀 Konuşma Akışı</div>
        <div style={{ flex: 1 }} />
        <button onClick={autoLayout} style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          📐 Otomatik Hizala
        </button>
        <button onClick={loadSampleFlow} style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.3)', color: '#ec4899', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          🌟 Örnek Hasta Akışını Yükle
        </button>
        <button onClick={saveFlow} disabled={saving} style={{ padding: '6px 14px', borderRadius: 6, background: saving ? 'rgba(255,255,255,0.04)' : 'rgba(34,197,94,0.15)', border: `1px solid ${saving ? 'rgba(255,255,255,0.06)' : 'rgba(34,197,94,0.3)'}`, color: saving ? '#475569' : '#22c55e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? '⏳ Kaydediliyor...' : '💾 Değişiklikleri Kaydet'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, minHeight: 600 }}>
        {/* Canvas */}
        <div className="glass-card" style={{ flex: '1 1 300px', minHeight: 400, padding: 0, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
          {/* Quick Add Toolbar */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8, background: 'rgba(15,23,42,0.8)', padding: 8, borderRadius: 8, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button onClick={() => addNode('field')} style={{ padding: '6px 12px', background: 'rgba(59,130,246,0.2)', color: 'var(--accent)', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid rgba(59,130,246,0.4)', cursor: 'pointer' }}>+ Alan Düğümü</button>
            <button onClick={() => addNode('condition')} style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid rgba(245,158,11,0.4)', cursor: 'pointer' }}>+ Koşul Düğümü</button>
            <button onClick={() => addNode('action')} style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.2)', color: '#c084fc', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid rgba(168,85,247,0.4)', cursor: 'pointer' }}>+ İşlem Düğümü</button>
          </div>
          
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onNodeDoubleClick={(_e, node) => deleteNode(node.id)}
            fitView
            style={{ background: 'var(--flow-bg, #0a0f1a)' }}
            colorMode="system"
            defaultEdgeOptions={{ style: { stroke: '#475569', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' } }}
          >
            <Background color="var(--flow-grid, #1e293b)" gap={20} />
            <Controls style={{ background: 'var(--card-bg, #1e293b)', borderRadius: 8 }} />
          </ReactFlow>
        </div>

        {/* Sidebar */}
        <div className="glass-card" style={{ flex: '1 1 320px', maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Özellikler Paneli
          </h3>

          {!selectedNode && (
            <div style={{ color: 'var(--foreground-3)', fontSize: 12, textAlign: 'center', marginTop: 40, lineHeight: 1.6 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🖱️</div>
              Tuvalden düzenlemek istediğiniz bir düğümü seçin veya üst menüden yeni bir düğüm ekleyin.
            </div>
          )}

          {selectedNode?.type === 'fieldNode' && (() => {
            const d = selectedNode.data as FieldData;
            const isCustomField = d.fieldName && !PATIENT_FIELDS.some(f => f.value === d.fieldName);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Hangi Bilgi İstenecek? (Alan Adı)</label>
                  <select 
                    value={d.fieldName || ''} 
                    onChange={e => {
                      const val = e.target.value;
                      const sel = PATIENT_FIELDS.find(p => p.value === val);
                      if (sel) {
                        updateSelectedNode({ fieldName: sel.value, fieldType: sel.type, description: d.description || sel.desc });
                      } else {
                        updateSelectedNode({ fieldName: val });
                      }
                    }} 
                    style={inputStyle}
                  >
                    <option value="">Bir alan seçin...</option>
                    {isCustomField && <option value={d.fieldName}>{d.fieldName} (Özel/Eski Alan)</option>}
                    {PATIENT_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                    ))}
                  </select>
                </div>
                {isCustomField && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Özel Alan Adı</label>
                    <input 
                      type="text" 
                      value={d.fieldName} 
                      onChange={e => updateSelectedNode({ fieldName: e.target.value })} 
                      style={inputStyle} 
                      placeholder="Örn: doktor_id"
                    />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>AI Sorusu (Kullanıcıya sorulacak metin)</label>
                  <textarea value={d.description} onChange={e => updateSelectedNode({ description: e.target.value })} placeholder="Adınızı öğrenebilir miyim?" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Veri Tipi</label>
                  <select value={d.fieldType} onChange={e => updateSelectedNode({ fieldType: e.target.value as any })} style={inputStyle}>
                    <option value="text">Metin</option>
                    <option value="date">Tarih</option>
                    <option value="time">Saat</option>
                    <option value="enum">Seçenekli (Enum)</option>
                    <option value="user">Sistem Kullanıcısı (Personel/Uzman vb.)</option>
                  </select>
                </div>
                {d.fieldType === 'user' && (
                  <div style={{ padding: '10px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 11, color: 'var(--accent)', lineHeight: 1.5 }}>
                    ℹ️ Bu alan, sistemde kayıtlı olan <strong>kullanıcılarla (personel, uzman vb.)</strong> otomatik olarak eşleştirilir.
                  </div>
                )}
                {d.fieldType === 'enum' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Seçenekler (Virgülle ayırın)</label>
                    <input value={d.enumValues ? d.enumValues.join(', ') : ''} onChange={e => updateSelectedNode({ enumValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="seçenek1, seçenek2" style={inputStyle} />
                  </div>
                )}
                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--foreground)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={d.required} onChange={e => updateSelectedNode({ required: e.target.checked })} style={{ accentColor: '#fb923c', width: 16, height: 16 }} />
                    Bu alan zorunlu mu?
                  </label>
                </div>
              </div>
            )
          })()}

          {selectedNode?.type === 'conditionNode' && (() => {
            const d = selectedNode.data as ConditionData;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Hangi bilgi kontrol edilecek?</label>
                  <select value={d.conditionField} onChange={e => updateSelectedNode({ conditionField: e.target.value })} style={inputStyle}>
                    <option value="">Bir alan seçin...</option>
                    <option value="is_registered">Hasta Kayıtlı Mı? (is_registered)</option>
                    {PATIENT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label} ({f.value})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Kural (Şart)</label>
                  <select value={d.operator} onChange={e => updateSelectedNode({ operator: e.target.value as any })} style={inputStyle}>
                    <option value="equals">Cevap tam olarak şuna eşitse:</option>
                    <option value="contains">Cevap şu kelimeyi içeriyorsa:</option>
                    <option value="notEmpty">Herhangi bir cevap verildiyse (Boş bırakılmadıysa)</option>
                  </select>
                </div>
                {d.operator !== 'notEmpty' && (
                  <div style={{ padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <label style={{ fontSize: 11, color: '#22c55e', display: 'block', marginBottom: 6, fontWeight: 600 }}>
                      ✅ Hangi durumda "Evet" (Yeşil ok) yönüne gidilsin?
                    </label>
                    <select 
                      value={d.conditionValue === 'true' || d.conditionValue === 'false' ? d.conditionValue : 'custom'}
                      onChange={e => updateSelectedNode({ conditionValue: e.target.value === 'custom' ? '' : e.target.value })}
                      style={{ ...inputStyle, marginBottom: (d.conditionValue === 'true' || d.conditionValue === 'false') ? 0 : 8, borderColor: 'rgba(34,197,94,0.3)' }}
                    >
                      <option value="true">Cevap Olumluysa (Evet vb.)</option>
                      <option value="false">Cevap Olumsuzsa (Hayır vb.)</option>
                      <option value="custom">Özel Bir Kelime Söylerse...</option>
                    </select>

                    {d.conditionValue !== 'true' && d.conditionValue !== 'false' && (
                      <input value={d.conditionValue} onChange={e => updateSelectedNode({ conditionValue: e.target.value })} placeholder="Örn: kanal tedavisi, onaylıyorum..." style={inputStyle} />
                    )}

                    <div style={{ fontSize: 10, color: '#ef4444', marginTop: 12, borderTop: '1px dashed rgba(239,68,68,0.2)', paddingTop: 8 }}>
                      ❌ <strong>Diğer tüm cevaplarda</strong> otomatik olarak "Hayır" (Kırmızı ok) yönüne gidilir.
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {selectedNode?.type === 'actionNode' && (() => {
            const d = selectedNode.data as ActionData;
            const validActions = ['save_record', 'webhook', 'end_call', 'transfer', 'randevuOlustur'];
            const isCustomAction = d.action && !validActions.includes(d.action);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>İşlem Tipi</label>
                  <select value={d.action || ''} onChange={e => updateSelectedNode({ action: e.target.value, label: e.target.options[e.target.selectedIndex].text })} style={inputStyle}>
                    <option value="">Bir işlem seçin...</option>
                    {isCustomAction && <option value={d.action}>{d.action} (Özel İşlem)</option>}
                    <option value="save_record">Veritabanına Kaydet (Randevu/Talep/Anket)</option>
                    <option value="webhook">Dış Sisteme Gönder (Webhook API)</option>
                    <option value="end_call">Sadece Bilgi Ver ve Görüşmeyi Bitir</option>
                    <option value="transfer">Canlı Destek / Operatöre Aktar</option>
                    <option value="randevuOlustur">Eski: Randevu Oluştur</option>
                  </select>
                </div>

                {(d.action === 'save_record' || d.action === 'randevuOlustur') && (
                  <div style={{ fontSize: 11, color: 'var(--foreground-3)', lineHeight: 1.6, background: 'rgba(168,85,247,0.1)', padding: 12, borderRadius: 8, border: '1px solid rgba(168,85,247,0.2)' }}>
                    Toplanan tüm bilgiler CRM'e kaydedilir.
                  </div>
                )}

                {d.action === 'webhook' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Webhook URL (POST)</label>
                    <input value={d.webhookUrl || ''} onChange={e => updateSelectedNode({ webhookUrl: e.target.value })} placeholder="https://api.make.com/... veya Zapier" style={inputStyle} />
                  </div>
                )}

                {d.action === 'end_call' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Kapanış Mesajı (Yapay Zeka Okur)</label>
                    <textarea value={d.message || ''} onChange={e => updateSelectedNode({ message: e.target.value })} placeholder="Bilgileriniz alındı, teşekkür ederiz." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                )}

                {d.action === 'transfer' && (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--foreground-3)', display: 'block', marginBottom: 6 }}>Aktarılacak Telefon Numarası</label>
                    <input value={d.transferNumber || ''} onChange={e => updateSelectedNode({ transferNumber: e.target.value })} placeholder="+90555..." style={inputStyle} />
                  </div>
                )}
              </div>
            )
          })()}

          {selectedNode && selectedNode.type && !['startNode', 'endNode'].includes(selectedNode.type) && (
            <div style={{ marginTop: 'auto', paddingTop: 20 }}>
              <button onClick={() => deleteNode(selectedNode.id)} style={{ width: '100%', padding: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                Düğümü Sil
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Tips */}
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)', fontSize: 11, color: 'var(--foreground-3)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--foreground-3)' }}>İpuçları:</strong> Node&apos;ları sürükleyerek taşıyın. Bağlantı noktalarından sürükleyerek ok oluşturun.
        <strong> Düğüm Özelliklerini Düzenlemek</strong> için tuval üzerinde düğüme tıklayın. (Start ve End silinemez).
      </div>
    </div>
  )
}
