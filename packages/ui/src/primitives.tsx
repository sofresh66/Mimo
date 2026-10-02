'use client';

import { AnimatePresence, motion } from 'motion/react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

// ─── Button ──────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-[0_4px_0_0_var(--color-primary-dark)] hover:brightness-105',
  secondary:
    'bg-white text-ink border-2 border-ink/10 shadow-[0_4px_0_0_rgba(45,42,62,0.12)] hover:bg-cream',
  soft: 'bg-primary/10 text-primary hover:bg-primary/15',
  ghost: 'bg-transparent text-ink hover:bg-ink/5',
  danger: 'bg-coral text-white shadow-[0_4px_0_0_#d9663d] hover:brightness-105',
  success: 'bg-mint text-white shadow-[0_4px_0_0_#3aa56c] hover:brightness-105',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'min-h-11 px-4 text-base rounded-2xl gap-2',
  lg: 'min-h-14 px-6 text-lg rounded-2xl gap-2',
  xl: 'min-h-16 px-7 text-xl rounded-3xl gap-3',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

/** Classes d'un bouton, réutilisables sur un lien (`<Link className={buttonClassName(...)}>`). */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cx(
    'inline-flex select-none items-center justify-center font-display font-semibold transition',
    'active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-55',
    'focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary/60',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    block && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    block,
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon}
      {children}
    </button>
  );
});

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-3xl bg-white p-4 shadow-[0_6px_24px_-12px_rgba(45,42,62,0.25)] ring-1 ring-ink/5',
        className,
      )}
      {...rest}
    />
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  /** Texte affiché à droite (ex. « 120 / 180 XP »). */
  valueText?: string;
  icon?: ReactNode;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  hideLabel?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  icon,
  color = 'var(--color-primary)',
  size = 'md',
  hideLabel,
  className,
}: ProgressBarProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const height = size === 'sm' ? 'h-2.5' : size === 'lg' ? 'h-5' : 'h-3.5';
  return (
    <div className={cx('w-full', className)}>
      {!hideLabel && (
        <div className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold text-ink/80">
          <span className="flex items-center gap-1.5">
            {icon}
            {label}
          </span>
          {valueText && <span className="tabular-nums text-ink/60">{valueText}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        aria-valuetext={valueText}
        className={cx('overflow-hidden rounded-full bg-ink/8', height)}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={false}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Empêche la fermeture par clic extérieur / Échap (ex. animation en cours). */
  dismissable?: boolean;
  className?: string;
}

/** Boîte de dialogue accessible : focus initial, piège de focus, Échap, retour du focus. */
export function Modal({
  open,
  onClose,
  title,
  hideTitle,
  children,
  footer,
  size = 'md',
  dismissable = true,
  className,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previous = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    const timer = window.setTimeout(() => (focusables()[0] ?? panel)?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0] as HTMLElement;
        const last = list[list.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, [open, onClose, dismissable]);

  if (typeof document === 'undefined') return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            onClick={dismissable ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cx(
              'relative max-h-[92dvh] w-full overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl outline-none',
              widths[size],
              className,
            )}
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <h2
              id={titleId}
              className={cx(
                'mb-3 pr-8 font-display text-xl font-bold text-ink',
                hideTitle && 'sr-only',
              )}
            >
              {title}
            </h2>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-xl text-ink/60 hover:bg-ink/5 focus-visible:outline-4 focus-visible:outline-primary/60"
              >
                ×
              </button>
            )}
            {children}
            {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

export function Avatar({
  emoji,
  color,
  size = 56,
  label,
  className,
}: {
  emoji: string;
  color: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full ring-4 ring-white',
        className,
      )}
      style={{ width: size, height: size, background: color, fontSize: size * 0.55 }}
    >
      {emoji}
    </span>
  );
}

// ─── Badge, Spinner, EmptyState ──────────────────────────────────────────────

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
        className,
      )}
      style={color ? { background: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label} className="inline-block">
      <span
        className="block animate-spin rounded-full border-[3px] border-current border-t-transparent opacity-70"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-ink/10 px-6 py-10 text-center">
      <span className="text-5xl" aria-hidden="true">
        {emoji}
      </span>
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {children && <div className="text-ink/70">{children}</div>}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
}

/** Onglets accessibles (rôle tablist, navigation au clavier par flèches). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = items[(index + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
    if (next) onChange(next.key);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx('flex gap-1 overflow-x-auto rounded-2xl bg-ink/5 p-1', className)}
    >
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx(
              'flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 font-display text-sm font-semibold transition',
              'focus-visible:outline-4 focus-visible:outline-primary/50',
              selected ? 'bg-white text-ink shadow-sm' : 'text-ink/60 hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
