'use client'
import { useState, useEffect, useCallback } from 'react'

interface RecordingMeta {
  id: string
  filename: string
  startedAt: string
  endedAt: string
  durationMs: number
  sizeBytes: number
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}d ${sec}s` : `${sec}s`
}
function fmtSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}
function fmtDate(d: string) {
  try { return new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

export default function RecordingsTab() {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/recordings')
      setRecordings(await r.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const play = (rec: RecordingMeta) => {
    if (audio) { audio.pause(); audio.src = '' }
    if (playingId === rec.id) { setPlayingId(null); setAudio(null); return }
    const a = new Audio(`/api/recordings/${rec.filename}`)
    a.play()
    a.onended = () => { setPlayingId(null); setAudio(null) }
    setAudio(a)
    setPlayingId(rec.id)
  }

  const del = async (id: string) => {
    if (!confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return
    setDeleting(id)
    await fetch(`/api/recordings/${id}`, { method: 'DELETE' })
    setRecordings(prev => prev.filter(r => r.id !== id))
    if (playingId === id && audio) { audio.pause(); setPlayingId(null); setAudio(null) }
    setDeleting(null)
  }

  const download = (rec: RecordingMeta) => {
    const a = document.createElement('a')
    a.href = `/api/recordings/${rec.filename}`
    a.download = rec.filename
    a.click()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>⏳ Yükleniyor...</div>

  if (recordings.length === 0) return (
    <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎙️</div>
      <div style={{ fontWeight: 500 }}>Henüz ses kaydı yok</div>
      <div style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>Görüşmeler tamamlandıkça buraya eklenecek</div>
    </div>
  )

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {recordings.length} kayıt
        </span>
        <button onClick={load} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>↺ Yenile</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {recordings.map((rec, i) => {
          const isPlaying = playingId === rec.id
          return (
            <div key={rec.id} style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '0.9rem 1.25rem',
              borderBottom: i < recordings.length - 1 ? '1px solid var(--divider)' : 'none',
              background: isPlaying ? 'rgba(167,139,250,0.06)' : 'transparent',
            }}>
              <button onClick={() => play(rec)} style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                background: isPlaying ? 'rgba(167,139,250,0.2)' : 'var(--glass-bg)',
                border: `1px solid ${isPlaying ? 'rgba(167,139,250,0.4)' : 'var(--glass-border)'}`,
                color: isPlaying ? '#a78bfa' : 'var(--muted)', fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--foreground)', fontFamily: 'monospace' }}>{rec.id}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{fmtDate(rec.startedAt)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground-2)' }}>{fmtDuration(rec.durationMs)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 1 }}>{fmtSize(rec.sizeBytes)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => download(rec)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: '0.75rem' }}>⬇</button>
                <button onClick={() => del(rec.id)} disabled={!!deleting} className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '0.75rem', opacity: deleting === rec.id ? 0.5 : 1 }}>🗑</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
