import React from 'react';
import { AlertTriangle, Trash2, CheckCircle2, X } from 'lucide-react';
import { useBackdropDismiss } from '../../../hooks/useBackdropDismiss';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Evet, Sil',
  cancelText = 'Vazgeç',
  variant = 'danger',
  onConfirm,
  onClose
}: ConfirmModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose);
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          icon: <AlertTriangle size={17} color="#ffffff" />,
          iconBg: '#d97706',
          btnBg: '#d97706',
          subtitle: 'Lütfen işlemi onaylayın',
        };
      case 'primary':
        return {
          icon: <CheckCircle2 size={17} color="#ffffff" />,
          iconBg: '#2563eb',
          btnBg: '#2563eb',
          subtitle: 'İşlem onayı',
        };
      case 'danger':
      default:
        return {
          icon: <Trash2 size={17} color="#ffffff" />,
          iconBg: '#dc2626',
          btnBg: '#dc2626',
          subtitle: 'Bu işlem geri alınamaz',
        };
    }
  };

  const vStyle = getVariantStyles();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999999,
        padding: '16px',
      }}
      {...backdropDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'calc(100vw - 24px)',
          maxWidth: '460px',
          background: 'var(--card-bg)',
          borderRadius: '14px',
          border: '1.5px solid var(--input-border)',
          boxShadow: 'var(--pc-modal-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header (Yeni Randevu Standardı) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '15px 20px',
            borderBottom: '1px solid var(--input-border)',
            background: 'var(--card-inner)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: vStyle.iconBg,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--pc-clay-primary)',
                flexShrink: 0,
              }}
            >
              {vStyle.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  lineHeight: 1.2,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--foreground-3)',
                  marginTop: '2px',
                }}
              >
                {vStyle.subtitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '6px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--foreground)',
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
          }}
        >
          <div
            style={{
              background: 'var(--card-inner)',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--input-border)',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              color: 'var(--foreground-2)',
            }}
          >
            {message}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--input-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            background: 'var(--card-inner)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              background: 'var(--card-bg)',
              color: 'var(--foreground)',
              fontWeight: 600,
              fontSize: '0.86rem',
              cursor: 'pointer',
              boxShadow: 'var(--pc-clay-btn)',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={{
              padding: '9px 24px',
              borderRadius: '8px',
              border: 'none',
              background: vStyle.btnBg,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              boxShadow: 'var(--pc-clay-primary)',
            }}
          >
            <span style={{ color: '#ffffff' }}>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
