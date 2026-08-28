import React from 'react';
import { AlertTriangle, Trash2, CheckCircle2, X } from 'lucide-react';

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
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'warning':
        return {
          icon: <AlertTriangle size={28} className="text-amber-500" />,
          iconBg: 'rgba(245, 158, 11, 0.12)',
          iconBorder: 'rgba(245, 158, 11, 0.25)',
          btnBg: '#f59e0b',
          btnHover: '#d97706',
          btnText: '#fff'
        };
      case 'primary':
        return {
          icon: <CheckCircle2 size={28} className="text-blue-500" />,
          iconBg: 'rgba(59, 130, 246, 0.12)',
          iconBorder: 'rgba(59, 130, 246, 0.25)',
          btnBg: '#3b82f6',
          btnHover: '#2563eb',
          btnText: '#fff'
        };
      case 'danger':
      default:
        return {
          icon: <Trash2 size={28} className="text-rose-500" />,
          iconBg: 'rgba(239, 68, 68, 0.12)',
          iconBorder: 'rgba(239, 68, 68, 0.25)',
          btnBg: '#ef4444',
          btnHover: '#dc2626',
          btnText: '#fff'
        };
    }
  };

  const vStyle = getVariantStyles();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999999,
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--background-2, #0f172a)',
          borderRadius: '16px',
          border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.05)',
          padding: '24px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Kapat Butonu */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'transparent',
            border: 'none',
            color: 'var(--foreground-3, #94a3b8)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
        >
          <X size={18} />
        </button>

        {/* İkon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: vStyle.iconBg,
            border: `1.5px solid ${vStyle.iconBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}
        >
          {vStyle.icon}
        </div>

        {/* Başlık */}
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--foreground, #f8fafc)'
          }}
        >
          {title}
        </h3>

        {/* Mesaj */}
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '0.88rem',
            lineHeight: 1.5,
            color: 'var(--foreground-2, #94a3b8)'
          }}
        >
          {message}
        </p>

        {/* Butonlar */}
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.12))',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--foreground, #f8fafc)',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
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
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: vStyle.btnBg,
              color: vStyle.btnText,
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              transition: 'all 0.15s'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
