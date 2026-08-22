'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PromptEditor from '../../../admin/components/PromptEditor'
import FlowBuilder from '../../../admin/components/FlowBuilder'

type InnerTab = 'conversation' | 'system' | 'phonebook'

type CalendarStatus = {
  connected: boolean
  authType: 'oauth2' | 'service_account' | null
  email: string | null
  calendarId: string | null
}

type CalendarItem = { id: string; name: string; isPrimary: boolean }
type PhonebookEntry = { label: string; number: string }

const cardStyle: React.CSSProperties = {
  padding: '14px 16px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--foreground)',
  fontSize: '0.8rem',
  outline: 'none',
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-bg)',
  color: 'var(--foreground-2)',
  cursor: 'pointer',
  fontSize: '0.76rem',
  fontWeight: 600,
}

export default function AyarlarTab() {
  const [innerTab, setInnerTab] = useState<InnerTab>('conversation')

  const [greeting, setGreeting] = useState('')
  const [greetingLoading, setGreetingLoading] = useState(true)
  const [greetingSaving, setGreetingSaving] = useState(false)

  const [connMode, setConnMode] = useState<'server' | 'direct'>('server')
  const [connModeSaving, setConnModeSaving] = useState(false)

  const [aiModel, setAiModel] = useState<string>('')
  const [aiAvailable, setAiAvailable] = useState<string[]>([])
  const [aiSaving, setAiSaving] = useState(false)

  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [selectedCalId, setSelectedCalId] = useState('')
  const [calendarSaving, setCalendarSaving] = useState(false)

  // Phonebook state
  const [phonebook, setPhonebook] = useState<PhonebookEntry[]>([])
  const [phonebookLoading, setPhonebookLoading] = useState(false)
  const [phonebookSaving, setPhonebookSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newNumber, setNewNumber] = useState('')

  const loadPhonebook = useCallback(async () => {
    setPhonebookLoading(true)
    try {
      const res = await fetch('/api/admin/settings/transfer-phonebook')
      const data = await res.json()
      if (Array.isArray(data)) setPhonebook(data)
    } catch {
      // ignore
    }
    setPhonebookLoading(false)
  }, [])

  const savePhonebook = async (updated: PhonebookEntry[]) => {
    setPhonebookSaving(true)
    try {
      const res = await fetch('/api/admin/settings/transfer-phonebook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phonebook: updated }),
      })
      if (res.ok) setPhonebook(updated)
    } catch {
      // ignore
    }
    setPhonebookSaving(false)
  }

  const addPhonebookEntry = () => {
    if (!newLabel.trim() || !newNumber.trim()) return
    const updated = [...phonebook, { label: newLabel.trim(), number: newNumber.trim() }]
    savePhonebook(updated)
    setNewLabel('')
    setNewNumber('')
  }

  const deletePhonebookEntry = (idx: number) => {
    const updated = phonebook.filter((_, i) => i !== idx)
    savePhonebook(updated)
  }

  const loadGreeting = useCallback(async () => {
    setGreetingLoading(true)
    try {
      const res = await fetch('/api/admin/settings/greeting')
      const data = await res.json()
      setGreeting(data?.greeting || '')
    } catch {
      // ignore
    }
    setGreetingLoading(false)
  }, [])

  const loadConnMode = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/connection-mode')
      const data = await res.json()
      if (data?.mode === 'direct' || data?.mode === 'server') setConnMode(data.mode)
    } catch {
      // ignore
    }
  }, [])

  const loadAi = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/ai')
      const data = await res.json()
      if (Array.isArray(data?.available)) setAiAvailable(data.available)
      if (typeof data?.current === 'string') setAiModel(data.current)
    } catch {
      // ignore
    }
  }, [])

  const loadCalendar = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/admin/settings/calendar/status')
      const statusData = await statusRes.json()
      setCalStatus(statusData)
      if (statusData?.calendarId) setSelectedCalId(statusData.calendarId)

      if (statusData?.connected && statusData?.authType === 'oauth2') {
        const listRes = await fetch('/api/admin/settings/calendar/calendars')
        const listData = await listRes.json()
        if (Array.isArray(listData?.calendars)) setCalendars(listData.calendars)
      } else {
        setCalendars([])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (innerTab === 'system') {
      loadGreeting()
      loadConnMode()
      loadAi()
      loadCalendar()
    } else if (innerTab === 'phonebook') {
      loadPhonebook()
    }
  }, [innerTab, loadGreeting, loadConnMode, loadAi, loadCalendar, loadPhonebook])

  const saveGreeting = async () => {
    if (!greeting.trim() || greetingSaving) return
    setGreetingSaving(true)
    try {
      await fetch('/api/admin/settings/greeting', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ greeting: greeting.trim() }),
      })
    } catch {
      // ignore
    }
    setGreetingSaving(false)
  }

  const saveConnMode = async (mode: 'server' | 'direct') => {
    if (connModeSaving || mode === connMode) return
    setConnModeSaving(true)
    try {
      const res = await fetch('/api/admin/settings/connection-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (res.ok) setConnMode(mode)
    } catch {
      // ignore
    }
    setConnModeSaving(false)
  }

  const saveAiModel = async (model: string) => {
    if (!model || aiSaving || model === aiModel) return
    setAiSaving(true)
    try {
      const res = await fetch('/api/admin/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (res.ok) setAiModel(model)
    } catch {
      // ignore
    }
    setAiSaving(false)
  }

  const connectCalendar = async () => {
    try {
      const res = await fetch('/api/admin/settings/calendar/auth')
      const data = await res.json()
      if (data?.url) window.location.href = data.url
    } catch {
      // ignore
    }
  }

  const disconnectCalendar = async () => {
    try {
      await fetch('/api/admin/settings/calendar/disconnect', { method: 'DELETE' })
      await loadCalendar()
    } catch {
      // ignore
    }
  }

  const saveCalendar = async () => {
    if (!selectedCalId) return
    setCalendarSaving(true)
    try {
      await fetch('/api/admin/settings/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: selectedCalId }),
      })
      await loadCalendar()
    } catch {
      // ignore
    }
    setCalendarSaving(false)
  }

  const connectionLabel = useMemo(() => (connMode === 'server' ? 'Sunucu Üzerinden' : 'Doğrudan'), [connMode])

  return (
    <div style={{ width: '100%', display: 'grid', gap: 14 }}>
      <div className="glass-card" style={{ ...cardStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => setInnerTab('conversation')}
          style={{
            ...buttonStyle,
            background: innerTab === 'conversation' ? 'var(--accent)' : 'var(--glass-bg)',
            color: innerTab === 'conversation' ? '#fff' : 'var(--foreground-2)',
          }}
        >
          Konuşma Akışı
        </button>
        <button
          onClick={() => setInnerTab('phonebook')}
          style={{
            ...buttonStyle,
            background: innerTab === 'phonebook' ? 'var(--accent)' : 'var(--glass-bg)',
            color: innerTab === 'phonebook' ? '#fff' : 'var(--foreground-2)',
          }}
        >
          📞 Aktarım Telefon Defteri
        </button>
        <button
          onClick={() => setInnerTab('system')}
          style={{
            ...buttonStyle,
            background: innerTab === 'system' ? 'var(--accent)' : 'var(--glass-bg)',
            color: innerTab === 'system' ? '#fff' : 'var(--foreground-2)',
          }}
        >
          Sistem Ayarları
        </button>
      </div>

      {innerTab === 'conversation' && (
        <>
          <PromptEditor />
          <div className="glass-card" style={{ padding: 12 }}>
            <FlowBuilder />
          </div>
        </>
      )}

      {innerTab === 'phonebook' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="glass-card" style={cardStyle}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
              📞 Çağrı Aktarım Telefon Defteri
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--foreground-3)', marginBottom: 16 }}>
              Yapay zekanın çağrıları aktarabileceği yetkili birim ve dahili numaraları buradan tanımlayabilirsiniz. Akış oluşturucuda bu isimlerle seçilecektir.
            </div>

            {/* List */}
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {phonebookLoading && <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)' }}>Yükleniyor...</div>}
              {!phonebookLoading && phonebook.length === 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)' }}>Kayıtlı aktarım numarası bulunmuyor.</div>
              )}
              {phonebook.map((entry, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--glass-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--foreground)' }}>{entry.label}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--accent)', fontFamily: 'monospace' }}>{entry.number}</div>
                  </div>
                  <button onClick={() => deletePhonebookEntry(idx)} disabled={phonebookSaving} style={{ ...buttonStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
                    Sil
                  </button>
                </div>
              ))}
            </div>

            {/* Add New */}
            <div style={{ padding: 14, background: 'rgba(0,0,0,0.15)', borderRadius: 8, border: '1px dashed var(--glass-border)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground-2)', marginBottom: 8 }}>+ Yeni Numara Ekle</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Birim Adı (Örn: Resepsiyon, Dr. Ahmet)"
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                />
                <input
                  value={newNumber}
                  onChange={e => setNewNumber(e.target.value)}
                  placeholder="Telefon / Dahili (Örn: 08503096119)"
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                />
                <button onClick={addPhonebookEntry} disabled={phonebookSaving || !newLabel.trim() || !newNumber.trim()} style={{ ...buttonStyle, background: 'var(--accent)', color: '#fff' }}>
                  {phonebookSaving ? '...' : '+ Ekle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {innerTab === 'system' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="glass-card" style={cardStyle}>
            <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Karşılama Mesajı</div>
            <textarea
              value={greeting}
              onChange={e => setGreeting(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder={greetingLoading ? 'Yükleniyor...' : 'Karşılama mesajını girin'}
            />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={saveGreeting} disabled={greetingSaving || greetingLoading || !greeting.trim()} style={buttonStyle}>
                {greetingSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>

          <div className="glass-card" style={cardStyle}>
            <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Bağlantı Modu</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--foreground-2)' }}>Aktif: {connectionLabel}</span>
              <button onClick={() => saveConnMode('server')} disabled={connModeSaving} style={buttonStyle}>Sunucu</button>
              <button onClick={() => saveConnMode('direct')} disabled={connModeSaving} style={buttonStyle}>Doğrudan</button>
            </div>
          </div>

          <div className="glass-card" style={cardStyle}>
            <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Yapay Zeka Modeli</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {aiAvailable.length === 0 && <span style={{ fontSize: '0.74rem', color: 'var(--foreground-3)' }}>Model listesi boş</span>}
              {aiAvailable.map(model => (
                <button
                  key={model}
                  onClick={() => saveAiModel(model)}
                  disabled={aiSaving}
                  style={{
                    ...buttonStyle,
                    background: aiModel === model ? 'var(--accent)' : 'var(--glass-bg)',
                    color: aiModel === model ? '#fff' : 'var(--foreground-2)',
                  }}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card" style={cardStyle}>
            <div style={{ fontSize: '0.78rem', color: 'var(--foreground-3)', marginBottom: 8 }}>Google Calendar</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--foreground-2)', marginBottom: 8 }}>
              Durum: {calStatus?.connected ? 'Bağlı' : 'Bağlı Değil'}
            </div>
            {calStatus?.email && <div style={{ fontSize: '0.74rem', color: 'var(--foreground-3)', marginBottom: 8 }}>{calStatus.email}</div>}

            {calStatus?.connected && calStatus?.authType === 'oauth2' && calendars.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <select value={selectedCalId} onChange={e => setSelectedCalId(e.target.value)} style={{ ...inputStyle, maxWidth: 340 }}>
                  <option value="">Takvim seçin</option>
                  {calendars.map(c => <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? ' (Ana)' : ''}</option>)}
                </select>
                <button onClick={saveCalendar} disabled={calendarSaving || !selectedCalId} style={buttonStyle}>
                  {calendarSaving ? 'Kaydediliyor...' : 'Takvimi Kaydet'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!calStatus?.connected && <button onClick={connectCalendar} style={buttonStyle}>Google ile Bağlan</button>}
              {calStatus?.connected && <button onClick={disconnectCalendar} style={buttonStyle}>Bağlantıyı Kes</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
