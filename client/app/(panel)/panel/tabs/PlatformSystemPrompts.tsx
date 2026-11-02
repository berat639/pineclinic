'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmModal from '../../../admin/components/ConfirmModal'
import InfoTooltip from '../../../admin/components/ui/InfoTooltip'
import { termLabel } from '../../../../lib/ui-glossary'
import styles from './PlatformClinicsTab.module.css'

type PromptItem = { key: string; label: string; description: string; value: string; defaultValue: string; isCustom: boolean; updatedAt: string | null; variables: string[] }
type PromptGroup = { id: string; label: string; items: PromptItem[] }
type HistoryItem = { id: string; value: string; action: string; changedAt: string; changedBy: string | null }
type ClinicRef = { id: string; name: string }

const VARIABLE_FALLBACK: Record<string, string> = { callerName: 'Arayanın adı', callerPhone: 'Arayanın telefonu' }
const variableLabel = (id: string) => termLabel(id, VARIABLE_FALLBACK[id] ?? 'Değişken')

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'İşlem tamamlanamadı')
  return d as T
}

export default function PlatformSystemPrompts({ clinics }: { clinics: ClinicRef[] }) {
  const [groups, setGroups] = useState<PromptGroup[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [previewClinic, setPreviewClinic] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const items = useMemo(() => groups.flatMap(g => g.items), [groups])
  const active = items.find(i => i.key === selectedKey) ?? null
  const dirty = Boolean(active && draft !== active.value)

  const load = useCallback(async (keep?: string) => {
    const data = await call<{ groups: PromptGroup[] }>('/api/platform/system-prompts')
    setGroups(data.groups)
    const all = data.groups.flatMap(g => g.items)
    const next = all.find(i => i.key === keep) ?? all[0]
    if (next) { setSelectedKey(next.key); setDraft(next.value) }
  }, [])

  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : 'Talimatlar yüklenemedi')) }, [load])
  useEffect(() => { if (!previewClinic && clinics[0]) setPreviewClinic(clinics[0].id) }, [clinics, previewClinic])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const choose = (key: string) => {
    if (key === selectedKey) return
    if (dirty) { setPendingKey(key); return }
    const next = items.find(i => i.key === key)
    if (next) { setSelectedKey(key); setDraft(next.value); setNotice(''); setError('') }
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı') } finally { setBusy(false) }
  }

  const insertVariable = (id: string) => {
    const el = areaRef.current
    const token = `{{${id}}}`
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + token + draft.slice(end))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }

  const save = () => run(async () => {
    if (!active) return
    await call(`/api/platform/system-prompts/${encodeURIComponent(active.key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: draft }) })
    await load(active.key)
    setNotice('Talimat kaydedildi; tüm kliniklerde geçerlidir.')
  })

  const resetToDefault = () => run(async () => {
    if (!active) return
    await call(`/api/platform/system-prompts/${encodeURIComponent(active.key)}`, { method: 'DELETE' })
    setConfirmReset(false)
    await load(active.key)
    setNotice('Varsayılan talimata dönüldü.')
  })

  const openHistory = () => run(async () => {
    if (!active) return
    const data = await call<{ items: HistoryItem[] }>(`/api/platform/system-prompts/${encodeURIComponent(active.key)}/history`)
    setHistory(data.items)
  })

  const openPreview = () => run(async () => {
    if (!active || !previewClinic) return
    const data = await call<{ prompt: string }>('/api/platform/system-prompts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId: previewClinic, key: active.key, value: draft }) })
    setPreview(data.prompt)
  })

  return (
    <section className={styles.card}>
      <div className={styles.setupHeading}>
        <div>
          <h2 className={styles.title}>Sistem Talimatları</h2>
          <p className={styles.description}>Burada yapılan değişiklik tüm kliniklerde geçerli olur. Klinikler talimatları yalnızca görüntüler.</p>
        </div>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}
      <div className={styles.spLayout}>
        <nav className={styles.spList} aria-label="Talimat listesi">
          {groups.map(g => (
            <div key={g.id} className={styles.spGroup}>
              <div className={styles.spGroupTitle}>{g.label}</div>
              {g.items.map(i => (
                <button key={i.key} type="button" className={i.key === selectedKey ? styles.spItemActive : styles.spItem} onClick={() => choose(i.key)}>
                  <span>{i.label}</span>
                  {i.isCustom && <span className={styles.spDot} title="Özelleştirilmiş" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {active && (
          <div className={styles.spEditor}>
            <div className={styles.spHead}>
              <strong>{active.label}</strong>
              <InfoTooltip title={active.label}>{active.description}</InfoTooltip>
              {dirty && <span className={styles.badgePlatform}>Kaydedilmemiş değişiklik</span>}
            </div>
            {active.variables.length > 0 && (
              <div className={styles.spChips}>
                <span className={styles.spChipsLabel}>Metne ekle:</span>
                {active.variables.map(v => (
                  <button key={v} type="button" className={styles.spChip} onClick={() => insertVariable(v)}>{variableLabel(v)}</button>
                ))}
              </div>
            )}
            <textarea ref={areaRef} className={styles.spArea} rows={14} value={draft} onChange={e => setDraft(e.target.value)} />
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy || !dirty || draft.trim().length < 5} onClick={() => void save()}>Kaydet</button>
              <button type="button" className={styles.secondaryButton} disabled={busy || !active.isCustom} onClick={() => setConfirmReset(true)}>Varsayılana dön</button>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void openHistory()}>Geçmiş</button>
              <select className={styles.spSelect} value={previewClinic} onChange={e => setPreviewClinic(e.target.value)} aria-label="Önizleme kliniği">
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className={styles.secondaryButton} disabled={busy || !previewClinic} onClick={() => void openPreview()}>Önizle</button>
            </div>
          </div>
        )}
      </div>

      {history && (
        <div className={styles.spOverlay} onClick={() => setHistory(null)}>
          <div className={styles.spModal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3 className={styles.subTitle}>Değişiklik Geçmişi</h3>
            {history.length === 0 && <div className={styles.empty}>Bu talimat için kayıtlı değişiklik yok.</div>}
            <div className={styles.spHistory}>
              {history.map(h => (
                <div key={h.id} className={styles.spHistoryItem}>
                  <div className={styles.rowMeta}>{new Date(h.changedAt).toLocaleString('tr-TR')} · {h.action}{h.changedBy ? ` · ${h.changedBy}` : ''}</div>
                  <pre className={styles.spPre}>{h.value}</pre>
                  <button type="button" className={styles.secondaryButton} onClick={() => { setDraft(h.value); setHistory(null) }}>Bu sürümü editöre al</button>
                </div>
              ))}
            </div>
            <div className={styles.actions}><button type="button" className={styles.secondaryButton} onClick={() => setHistory(null)}>Kapat</button></div>
          </div>
        </div>
      )}
      {preview !== null && (
        <div className={styles.spOverlay} onClick={() => setPreview(null)}>
          <div className={styles.spModal} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3 className={styles.subTitle}>Önizleme · {clinics.find(c => c.id === previewClinic)?.name}</h3>
            <pre className={styles.spPre}>{preview}</pre>
            <div className={styles.actions}><button type="button" className={styles.secondaryButton} onClick={() => setPreview(null)}>Kapat</button></div>
          </div>
        </div>
      )}
      {pendingKey && (
        <ConfirmModal
          isOpen={true}
          title="Kaydedilmemiş değişiklik"
          message="Bu talimatta kaydedilmemiş değişiklikler var. Başka talimata geçerseniz kaybolacak."
          confirmText="Değişiklikleri at"
          cancelText="Düzenlemeye dön"
          variant="warning"
          onConfirm={() => { const next = items.find(i => i.key === pendingKey); if (next) { setSelectedKey(next.key); setDraft(next.value) } setPendingKey(null) }}
          onClose={() => setPendingKey(null)}
        />
      )}
      {confirmReset && (
        <ConfirmModal
          isOpen={true}
          title="Varsayılana dön"
          message="Bu talimat varsayılan metne döndürülecek ve tüm kliniklerde geçerli olacak. Önceki metin geçmişte saklanır."
          confirmText="Evet, varsayılana dön"
          cancelText="Vazgeç"
          variant="warning"
          onConfirm={() => void resetToDefault()}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </section>
  )
}
