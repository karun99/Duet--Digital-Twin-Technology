import React, { useEffect } from 'react';
import { IconX, IconWarn, IconCheck, IconSpark } from './icons';
import type { Toast } from '../types';

/* -------------------------------------------------------------------------- */
/* Spinner                                                                    */
/* -------------------------------------------------------------------------- */

export const Spinner: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={`animate-spin ${className}`}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-cyan-400 to-cyan-600 text-black font-semibold hover:from-cyan-300 hover:to-cyan-500 shadow-lg shadow-cyan-500/20',
  secondary:
    'bg-white/[0.06] text-neutral-100 border border-white/10 hover:bg-white/[0.12] hover:border-white/20',
  ghost: 'text-neutral-400 hover:text-white hover:bg-white/[0.06]',
  danger: 'bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 hover:text-red-200',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[11px] gap-2 rounded-xl',
  md: 'h-11 px-5 text-[12px] gap-2.5 rounded-2xl',
  lg: 'h-14 px-7 text-[13px] gap-3 rounded-2xl',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  full,
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center font-mono uppercase tracking-[0.14em] transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
  >
    {loading ? <Spinner size={size === 'lg' ? 18 : 14} /> : icon}
    {children}
  </button>
);

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: 'cyan' | 'violet' | 'green' | 'neutral' | 'amber';
  className?: string;
}> = ({ children, tone = 'neutral', className = '' }) => {
  const tones: Record<string, string> = {
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    neutral: 'bg-white/[0.04] text-neutral-400 border-white/10',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  wide?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, children, labelledBy, wide, className = '' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start sm:items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-6 backdrop-blur-xl animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`relative my-auto w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} rounded-[1.75rem] sm:rounded-[2rem] border border-white/10 bg-[#0a0a0a] shadow-3xl animate-fade-in-up ${className}`}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-neutral-500 transition-colors hover:border-white/20 hover:text-white"
        >
          <IconX size={16} />
        </button>
        {children}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

const TOAST_ICON: Record<string, React.ReactNode> = {
  error: <IconWarn size={16} />,
  success: <IconCheck size={16} />,
  info: <IconSpark size={16} />,
};

const TOAST_STYLE: Record<string, string> = {
  error: 'border-red-500/30 bg-red-950/60 text-red-200',
  success: 'border-emerald-500/30 bg-emerald-950/50 text-emerald-200',
  info: 'border-cyan-500/30 bg-cyan-950/50 text-cyan-100',
};

export const ToastStack: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({
  toasts,
  onDismiss,
}) => (
  <div className="pointer-events-none fixed bottom-4 left-1/2 z-[300] flex w-full max-w-lg -translate-x-1/2 flex-col gap-2 px-3 sm:bottom-6">
    {toasts.map((toast) => (
      <div
        key={toast.id}
        role="status"
        className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-3xl backdrop-blur-xl animate-slide-up ${TOAST_STYLE[toast.kind]}`}
      >
        <span className="mt-0.5 shrink-0">{TOAST_ICON[toast.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug">{toast.title}</p>
          {toast.detail && <p className="mt-0.5 text-[11px] leading-relaxed opacity-70">{toast.detail}</p>}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1 opacity-50 transition-opacity hover:opacity-100"
        >
          <IconX size={14} />
        </button>
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

export const Field: React.FC<{
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, children, className = '' }) => (
  <div className={className}>
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <label className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] text-neutral-500">{label}</label>
      {hint}
    </div>
    {children}
  </div>
);

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-3 text-[13px] text-white placeholder-neutral-600 transition-colors focus:border-cyan-500/60 focus:outline-none';
