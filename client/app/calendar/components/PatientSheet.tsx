'use client'

import { useState, useEffect, useCallback } from 'react'

interface Patient {
  id: string
  name: string
  phone: string | null
  balance: number
}

interface Doctor {
  id: string
  name: string
  color: string
}

interface Treatment {
  id: string
  procedureName: string
  cost: number
  status: string
}

interface Payment {
  id: string
  date: string
  amount: number
  method: string
}

interface CompletedWork {
  id: string
  doctorId: string
  date: string
  description: string
}

interface Props {
  open: boolean
  onClose: () => void
  patient: Patient | null
  doctors: Doctor[]
}

type TabKey = 'treatments' | 'payments' | 'works'

export default function PatientSheet({ open, onClose, patient, doctors }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('treatments')
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [works, setWorks] = useState<CompletedWork[]>([])

  const fetchDetails = useCallback(async () => {
    if (!patient) return
    try {
      const [tRes, pRes, wRes] = await Promise.all([
        fetch(`/api/dental/patients/${patient.id}/treatments`),
        fetch(`/api/dental/patients/${patient.id}/payments`),
        fetch(`/api/dental/patients/${patient.id}/works`),
      ])
      if (tRes.ok) setTreatments(await tRes.json())
      if (pRes.ok) setPayments(await pRes.json())
      if (wRes.ok) setWorks(await wRes.json())
    } catch (e) {
      console.error('Patient details fetch error:', e)
    }
  }, [patient])

  useEffect(() => {
    if (open && patient) fetchDetails()
  }, [open, patient, fetchDetails])

  const doctorName = (id: string) => doctors.find((d) => d.id === id)?.name ?? 'Bilinmeyen'

  const totalCost = treatments.reduce((sum, t) => sum + t.cost, 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)

  if (!patient) return null

  return (
    <>
      {/* Backdrop */}
      <div className={`sheet-backdrop ${open ? 'open' : ''}`} onClick={onClose} />

      {/* Sheet */}
      <div className={`sheet-panel ${open ? 'open' : ''}`}>
        {/* Header */}
        <div className="sheet-header">
          <div className="sheet-header-top">
            <button className="sheet-close" onClick={onClose} aria-label="Kapat">✕</button>
            <h2 className="sheet-patient-name">{patient.name}</h2>
            <span className="sheet-badge">Aktif Hasta</span>
          </div>
          <div className="sheet-balance">
            Kalan Bakiye: <strong>{(patient.balance - totalPaid).toLocaleString('tr-TR')} ₺</strong>
          </div>
        </div>

        {/* Tabs */}
        <div className="sheet-tabs">
          <button className={`tab-btn ${activeTab === 'treatments' ? 'active' : ''}`} onClick={() => setActiveTab('treatments')}>Tedavi Planı</button>
          <button className={`tab-btn ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>Ödemeler</button>
          <button className={`tab-btn ${activeTab === 'works' ? 'active' : ''}`} onClick={() => setActiveTab('works')}>Yapılan İşler</button>
        </div>

        {/* Tab Content */}
        <div className="sheet-body">
          {activeTab === 'treatments' && (
            <div className="tab-content">
              {treatments.length === 0 ? (
                <p className="empty-state">Henüz tedavi planı eklenmemiş.</p>
              ) : (
                <>
                  <div className="treatment-list">
                    {treatments.map((t) => (
                      <div key={t.id} className="treatment-card">
                        <div className="treatment-info">
                          <span className="treatment-name">{t.procedureName}</span>
                          <span className={`treatment-status status-${t.status}`}>{t.status === 'planned' ? 'Planlandı' : t.status === 'completed' ? 'Tamamlandı' : t.status}</span>
                        </div>
                        <span className="treatment-cost">{t.cost.toLocaleString('tr-TR')} ₺</span>
                      </div>
                    ))}
                  </div>
                  <div className="cost-summary">
                    <div className="cost-row">
                      <span>Toplam Maliyet</span>
                      <strong>{totalCost.toLocaleString('tr-TR')} ₺</strong>
                    </div>
                    <div className="cost-row">
                      <span>Ödenen</span>
                      <strong className="paid">{totalPaid.toLocaleString('tr-TR')} ₺</strong>
                    </div>
                    <div className="cost-row total">
                      <span>Kalan</span>
                      <strong className="remaining">{(totalCost - totalPaid).toLocaleString('tr-TR')} ₺</strong>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="tab-content">
              {payments.length === 0 ? (
                <p className="empty-state">Henüz ödeme kaydı yok.</p>
              ) : (
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Tutar</th>
                      <th>Yöntem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.date}</td>
                        <td className="amount">{p.amount.toLocaleString('tr-TR')} ₺</td>
                        <td><span className="method-badge">{p.method}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'works' && (
            <div className="tab-content">
              {works.length === 0 ? (
                <p className="empty-state">Henüz yapılan iş kaydı yok.</p>
              ) : (
                <div className="timeline">
                  {works.map((w, i) => (
                    <div key={w.id} className="timeline-item">
                      <div className="timeline-dot" />
                      {i < works.length - 1 && <div className="timeline-line" />}
                      <div className="timeline-content">
                        <div className="timeline-date">{w.date}</div>
                        <div className="timeline-doctor">{doctorName(w.doctorId)}</div>
                        <div className="timeline-desc">{w.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .sheet-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
          z-index: 998;
        }
        .sheet-backdrop.open {
          opacity: 1;
          pointer-events: all;
        }
        .sheet-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(480px, 90vw);
          background: var(--background);
          border-left: 1px solid var(--glass-border);
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sheet-panel.open {
          transform: translateX(0);
        }
        .sheet-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--divider);
        }
        .sheet-header-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sheet-close {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          color: var(--foreground-2);
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .sheet-close:hover {
          background: var(--glass-bg-hover);
        }
        .sheet-patient-name {
          font-size: 1.2rem;
          font-weight: 700;
          flex: 1;
        }
        .sheet-badge {
          font-size: 0.7rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
          white-space: nowrap;
        }
        .sheet-balance {
          margin-top: 10px;
          font-size: 0.85rem;
          color: var(--foreground-2);
        }
        .sheet-balance strong {
          color: var(--accent);
        }
        .sheet-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--divider);
          padding: 0 24px;
        }
        .tab-btn {
          flex: 1;
          padding: 12px 8px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--foreground-3);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
          text-align: center;
        }
        .tab-btn:hover {
          color: var(--foreground-2);
        }
        .tab-btn.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }
        .sheet-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
        }
        .empty-state {
          text-align: center;
          color: var(--foreground-3);
          padding: 40px 0;
          font-size: 0.85rem;
        }

        /* Treatments */
        .treatment-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }
        .treatment-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-radius: 8px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
        }
        .treatment-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .treatment-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--foreground);
        }
        .treatment-status {
          font-size: 0.7rem;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 10px;
          width: fit-content;
        }
        .status-planned {
          background: rgba(96, 165, 250, 0.15);
          color: var(--accent);
        }
        .status-completed {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }
        .treatment-cost {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .cost-summary {
          padding: 14px;
          border-radius: 10px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
        }
        .cost-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          font-size: 0.8rem;
          color: var(--foreground-2);
        }
        .cost-row.total {
          border-top: 1px solid var(--divider);
          margin-top: 6px;
          padding-top: 10px;
        }
        .cost-row .paid { color: var(--success); }
        .cost-row .remaining { color: var(--warning); font-size: 0.95rem; }

        /* Payments */
        .payments-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }
        .payments-table th {
          text-align: left;
          padding: 10px 12px;
          color: var(--foreground-3);
          font-weight: 500;
          border-bottom: 1px solid var(--divider);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .payments-table td {
          padding: 12px;
          border-bottom: 1px solid var(--divider);
          color: var(--foreground);
        }
        .payments-table .amount {
          font-weight: 600;
          color: var(--success);
        }
        .method-badge {
          font-size: 0.7rem;
          padding: 3px 8px;
          border-radius: 6px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          color: var(--foreground-2);
        }

        /* Timeline */
        .timeline {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding-left: 16px;
        }
        .timeline-item {
          position: relative;
          padding-left: 24px;
          padding-bottom: 24px;
        }
        .timeline-dot {
          position: absolute;
          left: 0;
          top: 4px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid var(--background);
          box-shadow: 0 0 0 2px var(--accent);
        }
        .timeline-line {
          position: absolute;
          left: 4px;
          top: 16px;
          bottom: 0;
          width: 2px;
          background: var(--divider);
        }
        .timeline-content {
          padding-top: 0;
        }
        .timeline-date {
          font-size: 0.75rem;
          color: var(--foreground-3);
          margin-bottom: 2px;
        }
        .timeline-doctor {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 4px;
        }
        .timeline-desc {
          font-size: 0.85rem;
          color: var(--foreground);
          line-height: 1.4;
        }

        @media (max-width: 640px) {
          .sheet-panel {
            width: 100vw;
          }
        }
      `}</style>
    </>
  )
}
