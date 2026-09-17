'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './EvolutionWhatsAppCard.module.css'

type Config = { clinicId: string; clinicName: string }
type Conversation = { id: string; phone: string | null; remoteJid: string | null; aiPaused: boolean; lastMessageAt: string }
type Message = { id: string; direction: string; text: string; replyText: string | null; status: string; deliveryStatus: string | null; error: string | null; createdAt: string }

const API = '/api/admin/whatsapp'
const messageStates: Record<string, string> = { pending: 'Yanıt bekliyor', processing: 'AI yanıtlıyor', reply_ready: 'Gönderim bekliyor', sending: 'Gönderiliyor', sent: 'Gönderildi', received: 'Personel mesajı', held: 'Personelde / otomasyon kapalı', failed: 'Başarısız', uncertain: 'Gönderimi kontrol edin', skipped: 'Tercih nedeniyle atlandı', resolved: 'Personel sonuçlandırdı' }

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data as T
}

export default function WhatsAppConversationsCard() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [clinicId, setClinicId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api<Config[]>('/').then(rows => {
      if (!active) return
      setConfigs(rows)
      setClinicId(rows[0]?.clinicId || '')
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const refreshConversations = useCallback(async () => {
    if (!clinicId) return
    const rows = await api<Conversation[]>(`/${clinicId}/conversations`)
    setConversations(rows)
  }, [clinicId])

  useEffect(() => { void refreshConversations().catch(e => setError(e.message)) }, [refreshConversations])
  useEffect(() => {
    if (!selected || !clinicId) { setMessages([]); return }
    let active = true
    const refresh = () => api<Message[]>(`/${clinicId}/conversations/${selected}/messages`)
      .then(rows => { if (active) setMessages(rows) }).catch(e => { if (active) setError(e.message) })
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [selected, clinicId])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') } finally { setBusy(false) }
  }
  const selectedConversation = conversations.find(c => c.id === selected)

  return <section className={styles.card} aria-labelledby="whatsapp-conversations-heading">
    <div className={styles.inboxHeader}>
      <div>
        <h3 id="whatsapp-conversations-heading">WhatsApp Sohbetleri</h3>
        <p className={styles.description}>Hasta mesajlarını görüntüleyin ve yapay zekâ yanıtlarını yönetin.</p>
      </div>
      <button className={styles.secondary} disabled={busy || !clinicId} onClick={() => run(refreshConversations)}>Sohbetleri yenile</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <p>WhatsApp sohbetleri yükleniyor…</p> : !clinicId ? <p>WhatsApp sohbetlerini görmek için önce bir klinik kaydı oluşturun.</p> : <>
      {configs.length > 1 && <label className={styles.field}>Klinik<select value={clinicId} disabled={busy} onChange={e => {
        setClinicId(e.target.value); setSelected(''); setConversations([]); setMessages([])
      }}>{configs.map(config => <option key={config.clinicId} value={config.clinicId}>{config.clinicName}</option>)}</select></label>}
      <p className={styles.help}>Personel WhatsApp üzerinden yanıt verdiğinde AI o sohbette duraklatılır. Yeniden açma, sonraki mesajlar için geçerlidir.</p>
      <div className={styles.inbox}>
        <div className={styles.conversations}>
          {!conversations.length && <p>Henüz mesaj yok.</p>}
          {conversations.map(conversation => <button key={conversation.id} className={selected === conversation.id ? styles.selected : styles.conversation} onClick={() => setSelected(conversation.id)}>
            <strong>{conversation.phone || 'Numarası doğrulanmamış sohbet'}</strong><span>{conversation.aiPaused ? 'Personel desteğinde' : 'AI açık'}</span>
          </button>)}
        </div>
        <div className={styles.messages}>
          {selectedConversation ? <>
            <button className={styles.secondary} disabled={busy} onClick={() => run(async () => {
              await api(`/${clinicId}/conversations/${selected}`, 'PUT', { paused: !selectedConversation.aiPaused })
              await refreshConversations()
            })}>{selectedConversation.aiPaused ? 'Sonraki mesajlarda AI aç' : 'Personel desteğine al'}</button>
            {messages.map(message => <article className={styles.message} key={message.id}>
              <div className={styles.meta}>{message.direction === 'inbound' ? 'Hasta' : message.direction === 'notification' ? 'Bildirim' : 'Personel'} · {new Date(message.createdAt).toLocaleString('tr-TR')}</div>
              <p>{message.text}</p>
              {message.direction === 'inbound' && message.replyText && <><strong>AI yanıtı</strong><p>{message.replyText}</p></>}
              <small>{messageStates[message.status] || message.status}{message.deliveryStatus ? ` · ${message.deliveryStatus}` : ''}</small>
              {message.error && <p className={styles.error}>{message.error}</p>}
              {['failed', 'uncertain'].includes(message.status) && <div className={styles.actions}>
                {message.status === 'failed' && <button disabled={busy} onClick={() => run(async () => {
                  await api(`/${clinicId}/messages/${message.id}/resolve`, 'POST', { action: 'retry' }); await refreshConversations(); setNotice('Mesaj yeniden kuyruğa alındı.')
                })}>Yeniden dene</button>}
                <button className={styles.secondary} disabled={busy} onClick={() => run(async () => {
                  await api(`/${clinicId}/messages/${message.id}/resolve`, 'POST', { action: 'resolve' }); setNotice('Mesaj sonuçlandırıldı. Hazır olduğunuzda AI yanıtlarını açabilirsiniz.')
                })}>WhatsApp'tan kontrol ettim, sonuçlandır</button>
              </div>}
            </article>)}
          </> : <p>Mesajları görmek için bir sohbet seçin.</p>}
        </div>
      </div>
    </>}
  </section>
}
