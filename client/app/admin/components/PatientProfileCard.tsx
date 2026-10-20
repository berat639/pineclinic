import React from 'react'

interface PatientProfileCardProps {
  profile: any
  onEdit?: (patient: any) => void
}

export default function PatientProfileCard({ profile, onEdit }: PatientProfileCardProps) {
  if (!profile) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground-3)' }}>
      Yükleniyor...
    </div>
  )

  const { patient, appointments, treatments, payments, consultations, diseases, completedWorks, doctorNotes, toothRecords, materialUsages } = profile

  const cardStyle = {
    background: 'var(--card-bg, #1e293b)',
    border: '1px solid var(--input-border, #334155)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
  }
  
  const headerStyle = {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--foreground-2)',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    borderBottom: '1px solid var(--divider, #334155)',
    paddingBottom: 4
  }

  const formatDate = (iso: string) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div style={{ padding: '16px', background: 'var(--card-bg, #1e293b)', fontSize: '0.85rem', color: 'var(--foreground)' }}>
      
      {/* Demografik */}
      <div style={cardStyle}>
        <div style={{ ...headerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Demografik Bilgiler</span>
          {onEdit && (
            <button
              onClick={() => onEdit(patient)}
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
                color: '#60a5fa',
                borderRadius: 6,
                padding: '2px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              ✏️ Düzenle
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <div><span style={{ color: 'var(--foreground-3)' }}>Ad:</span> {patient.name}</div>
          {patient.tcIdentity && <div><span style={{ color: 'var(--foreground-3)' }}>TC:</span> {patient.tcIdentity}</div>}
          {patient.phone && <div><span style={{ color: 'var(--foreground-3)' }}>Tel:</span> {patient.phone}</div>}
          {patient.email && <div><span style={{ color: 'var(--foreground-3)' }}>E-posta:</span> {patient.email}</div>}
          {patient.gender && <div><span style={{ color: 'var(--foreground-3)' }}>Cinsiyet:</span> {patient.gender === 'E' ? 'Erkek' : patient.gender === 'K' ? 'Kadın' : patient.gender}</div>}
          {patient.birthDate && <div><span style={{ color: 'var(--foreground-3)' }}>D. Tarihi:</span> {formatDate(patient.birthDate)}</div>}
          {!patient.birthDate && patient.birthYear && <div><span style={{ color: 'var(--foreground-3)' }}>D. Yılı:</span> {patient.birthYear}</div>}
          <div><span style={{ color: 'var(--foreground-3)' }}>Kayıt:</span> {formatDate(patient.createdAt)}</div>
          {payments && payments.length > 0 && <div><span style={{ color: 'var(--foreground-3)' }}>Son Ödeme:</span> {formatDate(payments[0].date)}</div>}
        </div>
      </div>

      {/* İletişim İzinleri (KVKK) */}
      <div style={cardStyle}>
        <div style={headerStyle}>🛡️ İletişim İzinleri (KVKK)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>💬 SMS:</span>
            {patient.smsOptOut ? <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Reddedildi</span> : <span style={{ color: '#10b981', fontWeight: 600 }}>✔️ İzinli</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📧 E-posta:</span>
            {patient.emailOptOut ? <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Reddedildi</span> : <span style={{ color: '#10b981', fontWeight: 600 }}>✔️ İzinli</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🟢 WhatsApp:</span>
            {patient.whatsappOptOut ? <span style={{ color: '#ef4444', fontWeight: 600 }}>❌ Reddedildi</span> : <span style={{ color: '#10b981', fontWeight: 600 }}>✔️ İzinli</span>}
          </div>
        </div>
      </div>

      {/* Hastalıklar & Alerjiler */}
      {diseases && diseases.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🩺 Hastalıklar & Alerjiler ({diseases.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {diseases.map((d: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>{d.name}</span>
                <span style={{ color: d.status === 'active' ? '#ef4444' : '#10b981' }}>{d.status === 'active' ? 'Aktif' : 'Pasif'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tamamlanan İşlemler */}
      {completedWorks && completedWorks.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>✅ Tamamlanan İşlemler ({completedWorks.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {completedWorks.map((w: any) => (
              <div key={w.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {w.doctorName || 'Doktor'} - {formatDate(w.date)}
                </div>
                <div>{w.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hekim Notları */}
      {doctorNotes && doctorNotes.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>✍️ Hekim Notları ({doctorNotes.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doctorNotes.map((n: any) => (
              <div key={n.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {n.doctorName || 'Doktor'} - {formatDate(n.createdAt)}
                </div>
                <div>{n.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ağız & Diş Kayıtları */}
      {toothRecords && toothRecords.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🦷 Ağız & Diş Kayıtları ({toothRecords.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {toothRecords.map((tr: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>Diş #{tr.toothNumber} {tr.surface ? `(${tr.surface})` : ''}</span>
                <span style={{ color: 'var(--foreground-2)' }}>{tr.condition}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kullanılan Malzemeler */}
      {materialUsages && materialUsages.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>📦 Kullanılan Malzemeler ({materialUsages.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {materialUsages.map((m: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>{m.itemName}</span>
                <span style={{ color: 'var(--foreground-2)' }}>{m.quantity} Adet</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Randevular */}
      {appointments && appointments.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>📅 Ziyaret Tarihleri ({appointments.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {appointments.map((a: any) => (
              <span key={a.id} style={{ background: 'var(--input-bg)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', border: '1px solid var(--input-border)' }}>
                {formatDate(a.startTime)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tedavi Planları */}
      {treatments && treatments.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>🦷 Tedavi Planları ({treatments.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {treatments.slice(0, 5).map((t: any) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--glass-border)', paddingBottom: 2 }}>
                <span>{t.toothNumber ? `#${t.toothNumber}` : ''} {t.procedureName}</span>
                <span style={{ color: t.status === 'completed' || t.status === 'yapıldı' || t.status === '✓ Tamamlandı' ? '#10b981' : '#f59e0b' }}>
                  {t.status}
                </span>
              </div>
            ))}
            {treatments.length > 5 && <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', textAlign: 'center', marginTop: 4 }}>...ve {treatments.length - 5} daha</div>}
          </div>
        </div>
      )}

      {/* Ödemeler */}
      {payments && payments.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>💳 Ödeme Tarihleri ({payments.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {payments.map((p: any, idx: number) => (
              <span key={idx} style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', border: '1px solid #a7f3d0' }}>
                {formatDate(p.date)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Konsültasyonlar */}
      {consultations && consultations.length > 0 && (
        <div style={cardStyle}>
          <div style={headerStyle}>📝 Konsültasyonlar ({consultations.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {consultations.map((c: any) => (
              <div key={c.id} style={{ background: 'var(--input-bg)', padding: 8, borderRadius: 6 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--foreground-3)', marginBottom: 4 }}>
                  {c.doctorName || 'Doktor'} - {formatDate(c.createdAt)}
                </div>
                <div>{c.consultationNote}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
    </div>
  )
}
