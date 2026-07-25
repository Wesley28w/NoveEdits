import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { randomUUID } from './uuid';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const KIND_STYLES: Record<ToastKind, { border: string; icon: string }> = {
  success: { border: '#1e7e34', icon: '✓' },
  error: { border: 'var(--danger)', icon: '✕' },
  info: { border: 'var(--accent)', icon: 'ℹ' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = randomUUID();
      setToasts((prev) => [...prev, { id, kind, message }]);
      const timer = setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api: ToastApi = {
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 100,
          maxWidth: 360,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              background: 'var(--fg)',
              color: 'var(--bg)',
              padding: '10px 14px',
              borderRadius: 8,
              borderLeft: `4px solid ${KIND_STYLES[t.kind].border}`,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ color: KIND_STYLES[t.kind].border, fontWeight: 700 }}>{KIND_STYLES[t.kind].icon}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
