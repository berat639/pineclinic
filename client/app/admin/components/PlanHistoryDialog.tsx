import React, { useState } from 'react'
import PlanDialog from './PlanDialog'
import styles from './PineTreatmentPlan.module.css'

export default function PlanHistoryDialog({ patientId, entries, onChange, onClose }: { patientId: string; entries: any[]; onChange: (value: any[]) => void; onClose: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [disease, setDisease] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(editingId ? `/api/dental/consultations/${editingId}` : `/api/dental/patients/${patientId}/consultations`, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consultationNote: note.trim(), diseaseNote: disease.trim() }) })
      if (!response.ok) throw new Error('Geçmiş notu kaydedilemedi.')
      const refreshed = await fetch(`/api/dental/patients/${patientId}/consultations`)
      if (!refreshed.ok) throw new Error('Geçmiş yenilenemedi. Pencereyi yeniden açın.')
      onChange(await refreshed.json()); setNote(''); setDisease(''); setEditingId(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kayıt başarısız.') }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/dental/consultations/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Geçmiş notu silinemedi.')
      onChange(entries.filter(entry => entry.id !== id))
      if (editingId === id) { setEditingId(null); setNote(''); setDisease('') }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Silinemedi.') }
    finally { setBusy(false) }
  }
  return <PlanDialog title="Anamnez ve konsültasyon geçmişi" onClose={() => { if (!busy) onClose() }}>
    <p className={styles.dialogDescription}>Hasta geçmişi tüm planlarda görünür. Bu plana özel notu ana ekrandaki konsültasyon alanına yazın.</p>
    {entries.map(entry => <article className={styles.detailItem} key={entry.id}><strong>{new Date(entry.createdAt).toLocaleDateString('tr-TR')}</strong><p>{entry.consultationNote}</p>{entry.diseaseNote && <p>Anamnez: {entry.diseaseNote}</p>}<button type="button" className={styles.button} onClick={() => { setEditingId(entry.id); setNote(entry.consultationNote || ''); setDisease(entry.diseaseNote || '') }}>Düzenle</button> <button type="button" className={styles.button} disabled={busy} onClick={() => void remove(entry.id)}>Sil</button></article>)}
    {!entries.length && <p className={styles.dialogDescription}>Geçmiş kayıt bulunmuyor.</p>}
    <form onSubmit={save}><label htmlFor="history-note">{editingId ? 'Notu düzenle' : 'Yeni geçmiş notu'}</label><textarea id="history-note" className={styles.textarea} value={note} onChange={event => setNote(event.target.value)} /><label htmlFor="history-disease">Anamnez / hastalık notu</label><textarea id="history-disease" className={styles.textarea} value={disease} onChange={event => setDisease(event.target.value)} />{error && <p role="alert">{error}</p>}<div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => { setEditingId(null); setNote(''); setDisease('') }}>Temizle</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || (!note.trim() && !disease.trim())}>Kaydet</button></div></form>
  </PlanDialog>
}
