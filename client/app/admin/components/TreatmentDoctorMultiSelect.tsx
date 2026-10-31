import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Users, UserPlus } from 'lucide-react';

export interface DoctorOption {
  id: string;
  name: string;
  specialty?: string;
  color?: string;
}

interface TreatmentDoctorMultiSelectProps {
  doctors: DoctorOption[];
  selectedDoctorIds: string[];
  onChange: (nextDoctorIds: string[]) => void;
  shifts?: any[];
  targetApptTime?: string | null;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}

export default function TreatmentDoctorMultiSelect({
  doctors,
  selectedDoctorIds,
  onChange,
  shifts = [],
  targetApptTime,
  disabled = false,
  compact = false,
  placeholder = 'Hekim Seç',
}: TreatmentDoctorMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0,
    left: 0,
    width: 240,
    openUp: false,
  });

  const normalizedIds = Array.from(new Set((selectedDoctorIds || []).filter(Boolean)));
  const selectedDoctors = normalizedIds
    .map(id => doctors.find(d => d.id === id))
    .filter((d): d is DoctorOption => !!d);

  const apptDateStr = targetApptTime
    ? (() => {
        const d = new Date(targetApptTime);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv');
      })()
    : '';

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = Math.min(280, doctors.length * 42 + 56);
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
    const width = Math.max(rect.width, 250);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(8, left),
      width,
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleScrollOrResize = () => updatePosition();

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, doctors.length]);

  const toggleDoctor = (docId: string) => {
    if (disabled) return;
    const exists = normalizedIds.includes(docId);
    const next = exists ? normalizedIds.filter(id => id !== docId) : [...normalizedIds, docId];
    onChange(next);
  };

  const fullNamesTooltip = selectedDoctors.length > 0
    ? `Katılan Hekimler: ${selectedDoctors.map(d => d.name).join(', ')}`
    : 'Henüz hekim atanmadı (Çoklu hekim seçebilirsiniz)';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={fullNamesTooltip}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setOpen(prev => !prev);
        }}
        style={{
          width: '100%',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: compact ? '4px 8px' : '5px 9px',
          borderRadius: 6,
          border: open
            ? '1px solid var(--accent, #0284c7)'
            : '1px solid var(--input-border, #cbd5e1)',
          background: 'var(--input-bg, #ffffff)',
          color: selectedDoctors.length > 0 ? 'var(--foreground)' : '#d97706',
          fontSize: compact ? '0.73rem' : '0.75rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.65 : 1,
          boxSizing: 'border-box',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {selectedDoctors.length === 0 ? (
            <>
              <UserPlus size={13} style={{ flexShrink: 0, color: '#d97706' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {placeholder}
              </span>
            </>
          ) : selectedDoctors.length === 1 ? (
            <>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: selectedDoctors[0].color || 'var(--accent, #0284c7)',
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedDoctors[0].name}
              </span>
            </>
          ) : (
            <>
              <Users size={13} style={{ flexShrink: 0, color: 'var(--accent, #0284c7)' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedDoctors[0].name}
              </span>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'var(--badge-clinic-bg, #e0f2fe)',
                  border: '1px solid var(--badge-clinic-border, #bae6fd)',
                  color: 'var(--badge-clinic-text, #0369a1)',
                  flexShrink: 0,
                }}
              >
                +{selectedDoctors.length - 1}
              </span>
            </>
          )}
        </span>
        <ChevronDown
          size={13}
          style={{
            flexShrink: 0,
            color: 'var(--foreground-3)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
              maxHeight: 300,
              background: 'var(--card-bg, #ffffff)',
              border: '1px solid var(--input-border, #cbd5e1)',
              borderRadius: 10,
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.22)',
              zIndex: 100050,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 10px',
                borderBottom: '1px solid var(--input-border, #cbd5e1)',
                background: 'var(--card-inner, #f1f5f9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--foreground-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Users size={12} style={{ color: 'var(--accent, #0284c7)' }} />
                Katılan Hekimler ({selectedDoctors.length})
              </span>
              {selectedDoctors.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '1px 4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--danger, #ef4444)',
                    cursor: 'pointer',
                  }}
                >
                  Temizle
                </button>
              )}
            </div>

            <div style={{ overflowY: 'auto', padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {doctors.length === 0 ? (
                <div style={{ padding: '10px 8px', fontSize: '0.74rem', color: 'var(--foreground-3)', textAlign: 'center' }}>
                  Kayıtlı hekim bulunamadı
                </div>
              ) : (
                doctors.map(doc => {
                  const isChecked = normalizedIds.includes(doc.id);
                  const docShifts = apptDateStr
                    ? (shifts || []).filter((s: any) => s.userId === doc.id && s.date === apptDateStr)
                    : [];
                  const hasShift = !apptDateStr || docShifts.length > 0;
                  const shiftLabel = apptDateStr
                    ? hasShift
                      ? docShifts.map((s: any) => `${s.startTime}-${s.endTime}`).join(', ')
                      : 'Vardiya Yok'
                    : doc.specialty || '';

                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => toggleDoctor(doc.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 8px',
                        borderRadius: 7,
                        border: isChecked
                          ? '1px solid var(--btn-clinic-secondary-border, #93c5fd)'
                          : '1px solid transparent',
                        background: isChecked
                          ? 'var(--btn-clinic-secondary-bg, #eff6ff)'
                          : 'transparent',
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: isChecked
                              ? '1.5px solid var(--accent, #0284c7)'
                              : '1.5px solid var(--input-border, #94a3b8)',
                            background: isChecked ? 'var(--accent, #0284c7)' : 'var(--input-bg, #ffffff)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {isChecked && <Check size={11} strokeWidth={3} />}
                        </div>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: doc.color || 'var(--accent, #0284c7)',
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.76rem',
                            fontWeight: isChecked ? 700 : 600,
                            color: isChecked ? 'var(--btn-clinic-secondary-text, #0284c7)' : 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {doc.name}
                        </span>
                      </div>

                      {shiftLabel && (
                        <span
                          style={{
                            fontSize: '0.64rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: hasShift
                              ? 'var(--btn-clinic-mint-bg, #f0fdf4)'
                              : 'var(--card-inner, #f1f5f9)',
                            border: hasShift
                              ? '1px solid var(--btn-clinic-mint-border, #86efac)'
                              : '1px solid var(--input-border, #cbd5e1)',
                            color: hasShift
                              ? 'var(--btn-clinic-mint-text, #15803d)'
                              : 'var(--foreground-3)',
                            flexShrink: 0,
                          }}
                        >
                          {shiftLabel}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

