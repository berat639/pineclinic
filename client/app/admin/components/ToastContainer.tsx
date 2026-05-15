'use client'
import { useEffect, useState } from 'react'

interface Toast {
  id: string
  type: 'new_appointment' | 'session_start' | 'session_end' | 'info'
  title: string
  message: string
}

const TYPE_STYLE: Record<Toast['type'], { bg: string; border: string; icon: string }> = {
  new_appointment: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', icon: '📅' },
  session_start:   { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', icon: '🟢' },
  session_end:     { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)', icon: '🔴' },
  info:            { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', icon: 'ℹ️' },
}

export default function ToastContainer({ onNewAppointment }: { onNewAppointment?: () => void }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { ...t, id }])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5000)
  }

  useEffect(() => {
    const es = new EventSource('/api/events')

    es.addEventListener('new_appointment', (e) => {
      const data = JSON.parse(e.data)
      addToast({ type: 'new_appointment', title: 'Yeni Randevu!', message: `${data.customerName || 'Müşteri'} · ${data.phone || ''}` })
      onNewAppointment?.()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Yeni Randevu', { body: `${data.customerName || 'Müşteri'} — ${data.date} ${data.time}` })
      }
    })

    es.addEventListener('session_start', (e) => {
      const data = JSON.parse(e.data)
      addToast({ type: 'session_start', title: 'Görüşme Başladı', message: `Aktif: ${data.activeSessions} görüşme` })
    })

    es.addEventListener('session_end', (e) => {
      const data = JSON.parse(e.data)
      addToast({ type: 'session_end', title: 'Görüşme Bitti', message: `Aktif: ${data.activeSessions} görüşme` })
    })

    es.onerror = () => {}

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => es.close()
  }, [onNewAppointment])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: '0.6rem',
      zIndex: 1000, maxWidth: 320,
    }}>
      {toasts.map(t => {
        const s = TYPE_STYLE[t.type]
        return (
          <div key={t.id} style={{
            background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12,
            padding: '0.85rem 1rem', backdropFilter: 'blur(12px)',
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{s.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 2 }}>{t.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t.message}</div>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', padding: 0, flexShrink: 0 }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}
