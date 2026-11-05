import React, { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { isSelectableTreatmentMaterial, maskTlPrice, tlPriceToMinor } from '@/lib/tl-price-input'
import styles from './PineTreatmentPlan.module.css'

type CatalogKind = 'procedure' | 'indication'
export type CreatedCatalogEntry = {
  id: string; name: string; scope: 'tooth' | 'jaw' | 'mouth'; priceMinor: number; color: string; materials: any[]
}

export type EditingCatalogItem = {
  id: string; name: string; scope?: 'tooth' | 'jaw' | 'mouth'; price?: number; color?: string; defaultMaterials?: any[]
}

function formatPriceFromTl(tl?: number): string {
  if (!tl || !Number.isFinite(tl) || tl <= 0) return '0,00'
  const minor = Math.round(tl * 100)
  const whole = Math.floor(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = String(minor % 100).padStart(2, '0')
  return `${whole},${fraction}`
}

export default function InlineCatalogForm({ kind, initialName, editingItem, replacingMaterials, onCreated, onCancel }: {
  kind: CatalogKind
  initialName: string
  editingItem?: EditingCatalogItem | null
  replacingMaterials?: boolean
  onCreated: (entry: CreatedCatalogEntry) => void
  onCancel: () => void
}) {
  const id = useId()
  const [name, setName] = useState(editingItem?.name ?? initialName)
  const [price, setPrice] = useState(() => formatPriceFromTl(editingItem?.price))
  const [scope, setScope] = useState<'tooth' | 'jaw' | 'mouth'>(editingItem?.scope || 'tooth')
  const [color, setColor] = useState(editingItem?.color || '#0284c7')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const isProcedure = kind === 'procedure'
  const isEditing = !!editingItem?.id

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name)
      setPrice(formatPriceFromTl(editingItem.price))
      setScope(editingItem.scope || 'tooth')
      setColor(editingItem.color || '#0284c7')
    } else {
      setScope('tooth')
      setColor('#0284c7')
    }
  }, [editingItem, kind])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending.current) return
    if (!name.trim()) { setError('Lütfen bir ad yazın.'); return }
    const priceMinor = isProcedure ? tlPriceToMinor(price) : 0
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) { setError('Geçerli bir fiyat yazın.'); return }
    pending.current = true; setBusy(true); setError('')
    try {
      const url = isEditing ? `/api/dental/treatment-catalog/${editingItem!.id}` : '/api/dental/treatment-catalog'
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          scope: isProcedure ? scope : 'tooth',
          priceMinor,
          color: isProcedure ? color : undefined,
          materials: (editingItem?.defaultMaterials ?? []).filter(isSelectableTreatmentMaterial),
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Kayıt kaydedilemedi. Yazdığınız bilgiler korunuyor.')
      if (!result.id || !result.name) throw new Error('Kayıt sonucu doğrulanamadı.')
      onCreated({
        ...result,
        color: isProcedure ? (result.color || color) : result.color,
        materials: Array.isArray(result.materials) ? result.materials.filter(isSelectableTreatmentMaterial) : [],
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kayıt kaydedilemedi.')
    } finally { pending.current = false; setBusy(false) }
  }

  return <form
    id={`pine-create-${kind}`}
    className={styles.inlineCatalog}
    aria-label={isProcedure ? 'Yeni tedavi ekle' : 'Yeni endikasyon ekle'}
    aria-busy={busy}
    style={{
      padding: isProcedure ? '24px 7px 7px' : '8px 7px',
      overflowX: 'hidden',
      maxWidth: '100%',
      boxSizing: 'border-box',
    }}
    onSubmit={submit}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!pending.current) onCancel() }
    }}
  >
    {isProcedure && <>
      <svg aria-hidden="true" focusable="false" className={styles.spriteDefs}>
        <symbol id="pc-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3h7v7" />
          <path d="M10 14 21 3" />
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </symbol>
        <symbol id="pc-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </symbol>
      </svg>
      <span className="price-link-wrap"><a className="base-price-link" href="https://tdb.org.tr/dishekimleri/tedavi-ucretleri/tarife" target="_blank" rel="noopener noreferrer" aria-describedby="basePriceTip" title="TDB güncel rehber tedavi ücret tarifesini yeni sekmede görüntüle"><svg className="ui-icon sm" aria-hidden="true" focusable="false"><use href="#pc-external"></use></svg> Baz Fiyat <svg className="ui-icon sm" aria-hidden="true" focusable="false"><use href="#pc-info"></use></svg></a><span className="price-tip" id="basePriceTip" role="tooltip">Türk Dişhekimleri Birliği&apos;nin güncel rehber ücret tarifesini yeni sekmede açar. Buradaki tutarlar bilgi ve karşılaştırma amaçlıdır; kendi tedavi fiyatınızı alana manuel olarak girebilirsiniz.</span></span>
    </>}
    <button type="button" className={styles.catalogClose} aria-label="Eklemeyi iptal et" title="Kapat" disabled={busy} onClick={onCancel}><X size={16} /></button>
    <fieldset disabled={busy} style={{ minWidth: 0, width: '100%', maxWidth: '100%', margin: 0, padding: 0, border: 0 }}>
      <div
        className={styles.catalogFields}
        style={{
          display: 'grid',
          gridTemplateColumns: isProcedure ? 'minmax(88px, 1fr) 76px 28px auto' : 'minmax(96px, 1fr) auto',
          alignItems: 'center',
          gap: 5,
          overflowX: 'hidden',
          width: '100%',
        }}
      >
        <input
          autoFocus
          id={`${id}-name`}
          className={`${styles.input} ${styles.catalogName}`}
          aria-label={isProcedure ? 'Tedavi adı' : 'Endikasyon adı'}
          placeholder={isProcedure ? 'Tedavi adı' : 'Endikasyon adı'}
          required
          maxLength={120}
          autoComplete="off"
          value={name}
          onChange={event => setName(event.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          style={{
            height: 28,
            minHeight: 28,
            padding: '4px 8px',
            fontSize: 11.5,
            minWidth: 0,
            width: '100%',
          }}
        />
        {isProcedure && <>
          <div
            className={styles.catalogPrice}
            style={{
              width: 76,
              minWidth: 76,
              flex: '0 0 76px',
            }}
          >
            <input
              id={`${id}-price`}
              className={styles.input}
              aria-label="Fiyat (TL)"
              title="Fiyat (TL)"
              placeholder="0,00"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              required
              value={price}
              onFocus={event => { if (price === '0,00') event.target.select() }}
              onChange={event => {
                const input = event.target
                const masked = maskTlPrice(input.value)
                if (masked === null) return
                const position = (input.value.slice(0, input.selectionStart ?? input.value.length).match(/[\d,]/g) || []).length
                setPrice(masked)
                requestAnimationFrame(() => {
                  let cursor = 0, count = 0
                  while (cursor < masked.length && count < position) { if (/[\d,]/.test(masked[cursor])) count++; cursor++ }
                  if (document.activeElement === input) input.setSelectionRange(cursor, cursor)
                })
              }}
              onBlur={() => {
                if (price) { const [whole, fraction = ''] = price.split(','); setPrice(`${whole},${fraction.padEnd(2, '0')}`) }
              }}
              style={{
                height: 28,
                minHeight: 28,
                padding: '4px 22px 4px 6px',
                fontSize: 11.5,
                width: '100%',
              }}
            />
            <span aria-hidden="true" style={{ fontSize: 10.5, right: 6 }}>TL</span>
          </div>
          <input
            id={`${id}-color`}
            type="color"
            aria-label="Tedavi rengi"
            title="Tedavi rengi seç"
            value={color}
            onChange={event => setColor(event.target.value)}
            style={{
              width: 28,
              height: 28,
              padding: 2,
              borderRadius: 7,
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              boxShadow: 'var(--pc-neo-inset)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
        </>}
        <button
          type="submit"
          className={`${styles.button} ${styles.primary} ${styles.small}`}
          disabled={!name.trim()}
          title={isProcedure && replacingMaterials ? 'Yeni tedavi seçildiğinde önceki malzeme seçimi temizlenir.' : undefined}
          style={{
            height: 28,
            minHeight: 28,
            padding: '4px 10px',
            fontSize: 11.5,
            fontWeight: 700,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {isEditing ? (busy ? 'Kaydediliyor…' : 'Kaydet') : (busy ? 'Ekleniyor…' : 'Ekle')}
        </button>
      </div>
      {error && <p id={`${id}-error`} className={styles.catalogError} role="alert">{error}</p>}
    </fieldset>
  </form>
}
