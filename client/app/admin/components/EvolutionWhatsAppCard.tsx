'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type Config = { clinicId: string; clinicName: string; baseUrl: string; instanceName: string; hasApiKey: boolean; enabled: boolean; aiEnabled: boolean; connectionState: string }
type Conversation = { id: string; phone: string | null; remoteJid: string | null; aiPaused: boolean; lastMessageAt: string }
type Message = { id: string; direction: string; text: string; replyText: string | null; status: string; deliveryStatus: string | null; error: string | null; createdAt: string }
const API = '/api/admin/whatsapp'
const states: Record<string, string> = { open: 'Bağlı', close: 'Bağlantı kesildi', connecting: 'Bağlanıyor', unconfigured: 'Kurulum gerekli', unknown: 'Durum bilinmiyor' }
const messageStates: Record<string, string> = { pending: 'Yanıt bekliyor', processing: 'AI yanıtlıyor', reply_ready: 'Gönderim bekliyor', sending: 'Gönderiliyor', sent: 'Gönderildi', received: 'Personel mesajı', held: 'Personelde / otomasyon kapalı', failed: 'Başarısız', uncertain: 'Gönderimi kontrol edin', skipped: 'Tercih nedeniyle atlandı', resolved: 'Personel sonuçlandırdı' }

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function EvolutionWhatsAppCard() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [form, setForm] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api<Config[]>('/').then(rows => { if (active) { setConfigs(rows); setForm(rows[0] || null) } })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const refreshConversations = useCallback(async () => {
    if (!form) return
    const rows = await api<Conversation[]>(`/${form.clinicId}/conversations`)
    setConversations(rows)
  }, [form?.clinicId])

  useEffect(() => { void refreshConversations().catch(e => setError(e.message)) }, [refreshConversations])
  useEffect(() => {
    if (!selected || !form) { setMessages([]); return }
    let active = true
    const refresh = () => api<Message[]>(`/${form.clinicId}/conversations/${selected}/messages`)
      .then(rows => { if (active) setMessages(rows) }).catch(e => { if (active) setError(e.message) })
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [selected, form?.clinicId])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') } finally { setBusy(false) }
  }
  const save = async () => {
    if (!form) return
    const updated = await api<Config>(`/${form.clinicId}`, 'PUT', {
      baseUrl: form.baseUrl, instanceName: form.instanceName, enabled: form.enabled, aiEnabled: form.aiEnabled,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    })
    setForm(updated); setApiKey(''); setConfigs(rows => rows.map(c => c.clinicId === updated.clinicId ? updated : c))
    return updated
  }
  const checkStatus = useCallback(async () => {
    if (!form) return
    const result = await api<{ connectionState: string }>(`/${form.clinicId}/status`)
    setForm(current => current?.clinicId === form.clinicId ? { ...current, connectionState: result.connectionState } : current)
    if (result.connectionState === 'open') { setQr(null); setNotice('WhatsApp bağlantısı kuruldu.') }
  }, [form?.clinicId])

  useEffect(() => {
    if (!qr) return
    const timer = setInterval(() => { void checkStatus().catch(() => {}) }, 5000)
    return () => clearInterval(timer)
  }, [qr, checkStatus])

  const selectedConversation = conversations.find(c => c.id === selected)
  const patch = (change: Partial<Config>) => setForm(current => current ? { ...current, ...change } : current)

  return <section className={styles.card} aria-labelledby="evolution-heading">
    <div className={styles.heading}>
      <div><h3 id="evolution-heading">WhatsApp · Evolution API</h3><p>Gemini 3.1 ile mesajları yanıtlayın ve randevu taleplerini yönetin.</p></div>
      {form && <span className={styles.badge}>{states[form.connectionState] || 'Durum bilinmiyor'}</span>}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p>WhatsApp ayarları yükleniyor…</p> : !form ? <p>WhatsApp bağlamak için önce bir klinik kaydı oluşturun.</p> : <>
      {configs.length > 1 && <label className={styles.field}>Klinik<select value={form.clinicId} disabled={busy} onChange={e => {
        setForm(configs.find(c => c.clinicId === e.target.value) || null); setApiKey(''); setQr(null); setSelected(''); setConversations([])
      }}>{configs.map(c => <option key={c.clinicId} value={c.clinicId}>{c.clinicName}</option>)}</select></label>}
      <div className={styles.grid}>
        <label className={styles.field}>Evolution sunucu adresi<input type="url" placeholder="https://whatsapp.ornek.com" value={form.baseUrl} onChange={e => patch({ baseUrl: e.target.value })} /></label>
        <label className={styles.field}>Bağlantı adı (instance)<input placeholder="klinik-whatsapp" value={form.instanceName} onChange={e => patch({ instanceName: e.target.value })} /></label>
        <label className={styles.field}>Evolution API anahtarı<input type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={form.hasApiKey ? 'Kayıtlı. Değiştirmek için yeni anahtarı girin.' : 'Evolution sunucunuzun API anahtarı'} /><small>Anahtar kaydedildikten sonra ekranda gösterilmez.</small></label>
        <div className={styles.checks}>
          <label><input type="checkbox" checked={form.enabled} onChange={e => patch({ enabled: e.target.checked })} /> WhatsApp gönderimleri açık</label>
          <label><input type="checkbox" checked={form.aiEnabled} onChange={e => patch({ aiEnabled: e.target.checked })} /> Gemini 3.1 otomatik yanıtları açık</label>
        </div>
      </div>
      <div className={styles.actions}>
        <button disabled={busy} onClick={() => run(async () => { await save(); setNotice('Evolution ayarları kaydedildi.') })}>Ayarları kaydet</button>
        <button disabled={busy} onClick={() => run(async () => {
          const saved = await save(); if (!saved) return
          const result = await api<{ qrcode: string | null; connectionState: string }>(`/${saved.clinicId}/connect`, 'POST')
          setQr(result.qrcode); patch({ connectionState: result.connectionState })
          if (!result.qrcode) { await checkStatus(); setNotice('Bağlantı isteği gönderildi. Gerekirse QR kodunu yenileyin.') }
        })}>{qr ? 'QR kodunu yenile' : 'WhatsApp bağla / QR göster'}</button>
        <button className={styles.secondary} disabled={busy || !form.hasApiKey} onClick={() => run(checkStatus)}>Durumu kontrol et</button>
      </div>
      {qr && <div className={styles.qr}><img src={qr} width={240} height={240} alt="WhatsApp bağlantısı için QR kodu" /><p>Telefonunda WhatsApp → Bağlı cihazlar → Cihaz bağla yolunu açıp kodu okut.</p></div>}
      <details className={styles.guide}><summary>API anahtarını nasıl alırım?</summary><p>Kendi Evolution sunucunu kullanıyorsan anahtar, kurulum sırasında belirlenen <code>AUTHENTICATION_API_KEY</code> değeridir. Bir hizmet sağlayıcı kullanıyorsan anahtarı sağlayıcının panelinden edin. Sunucu adresi ve bağlantı adıyla birlikte yukarıya girip kaydet; ardından QR kodunu okut.</p></details>
      <div className={styles.inboxHeader}><h4>Sohbetler</h4><button className={styles.secondary} disabled={busy} onClick={() => run(refreshConversations)}>Sohbetleri yenile</button></div>
      <p className={styles.help}>Personel WhatsApp üzerinden yanıt verdiğinde AI o sohbette duraklatılır. Yeniden açma, sonraki mesajlar için geçerlidir.</p>
      <div className={styles.inbox}>
        <div className={styles.conversations}>
          {!conversations.length && <p>Henüz mesaj yok.</p>}
          {conversations.map(c => <button key={c.id} className={selected === c.id ? styles.selected : styles.conversation} onClick={() => setSelected(c.id)}>
            <strong>{c.phone || 'Numarası doğrulanmamış sohbet'}</strong><span>{c.aiPaused ? 'Personel desteğinde' : 'AI açık'}</span>
          </button>)}
        </div>
        <div className={styles.messages}>
          {selectedConversation ? <>
            <button className={styles.secondary} disabled={busy} onClick={() => run(async () => {
              await api(`/${form.clinicId}/conversations/${selected}`, 'PUT', { paused: !selectedConversation.aiPaused })
              await refreshConversations()
            })}>{selectedConversation.aiPaused ? 'Sonraki mesajlarda AI aç' : 'Personel desteğine al'}</button>
            {messages.map(m => <article className={styles.message} key={m.id}>
              <div className={styles.meta}>{m.direction === 'inbound' ? 'Hasta' : m.direction === 'notification' ? 'Bildirim' : 'Personel'} · {new Date(m.createdAt).toLocaleString('tr-TR')}</div>
              <p>{m.text}</p>
              {m.direction === 'inbound' && m.replyText && <><strong>AI yanıtı</strong><p>{m.replyText}</p></>}
              <small>{messageStates[m.status] || m.status}{m.deliveryStatus ? ` · ${m.deliveryStatus}` : ''}</small>
              {m.error && <p className={styles.error}>{m.error}</p>}
              {['failed', 'uncertain'].includes(m.status) && <div className={styles.actions}>
                {m.status === 'failed' && <button disabled={busy} onClick={() => run(async () => {
                  await api(`/${form.clinicId}/messages/${m.id}/resolve`, 'POST', { action: 'retry' }); await refreshConversations(); setNotice('Mesaj yeniden kuyruğa alındı.')
                })}>Yeniden dene</button>}
                <button className={styles.secondary} disabled={busy} onClick={() => run(async () => {
                  await api(`/${form.clinicId}/messages/${m.id}/resolve`, 'POST', { action: 'resolve' }); setNotice('Mesaj sonuçlandırıldı. Hazır olduğunuzda AI yanıtlarını açabilirsiniz.')
                })}>WhatsApp'tan kontrol ettim, sonuçlandır</button>
              </div>}
            </article>)}
          </> : <p>Mesajları görmek için bir sohbet seçin.</p>}
        </div>
      </div>
    </>}
  </section>
}
