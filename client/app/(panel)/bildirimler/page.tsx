'use client'

import { useEffect, useState } from 'react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}

export default function BildirimlerPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    fetch(`/api/notifications`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setNotifications)
      .catch(() => {})
  }, [])

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'PUT', credentials: 'include' })
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    await fetch(`/api/notifications/read-all`, { method: 'PUT', credentials: 'include' })
    setNotifications(ns => ns.map(n => ({ ...n, read: true })))
  }

  const unread = notifications.filter(n => !n.read).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--foreground)' }}>Bildirimler</h1>
        {unread > 0 && (
          <button onClick={markAllRead} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--foreground-2)', cursor: 'pointer' }}>
            Tümünü okundu işaretle ({unread})
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p style={{ color: 'var(--foreground-3)', fontSize: 14 }}>Henüz bildirim yok.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map(n => (
            <div key={n.id} onClick={() => !n.read && markRead(n.id)} style={{ padding: '12px 16px', borderRadius: 8, background: n.read ? 'var(--glass-bg)' : 'rgba(96,165,250,0.06)', border: `1px solid ${n.read ? 'var(--glass-border)' : 'rgba(96,165,250,0.2)'}`, cursor: n.read ? 'default' : 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)' }}>{n.title}</div>
                <span style={{ fontSize: 11, color: 'var(--foreground-3)' }}>{new Date(n.createdAt).toLocaleDateString('tr-TR')}</span>
              </div>
              {n.body && <div style={{ fontSize: 12, color: 'var(--foreground-2)', marginTop: 4 }}>{n.body}</div>}
              {!n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6 }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
