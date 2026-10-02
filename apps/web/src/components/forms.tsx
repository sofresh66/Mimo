'use client';

import { cx } from '@mimo/ui';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

/** Champs de formulaire accessibles (libellé associé, aide et erreur annoncées). */
export function Field({
  label,
  hint,
  error,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const id = useId();
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-coral">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  children,
  className,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      <select
        id={id}
        className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        {...select}
      >
        {children}
      </select>
    </div>
  );
}

/** Groupe de choix visuels (avatars, couleurs, icônes) en boutons radio accessibles. */
export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (option: T) => ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-slate-700">{label}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            onClick={() => onChange(option)}
            className={cx(
              'grid size-12 place-items-center rounded-xl border-2 text-2xl transition focus-visible:outline-4 focus-visible:outline-primary/50',
              option === value
                ? 'border-primary bg-primary/10'
                : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export const AVATARS = [
  '🦊',
  '🐉',
  '🐼',
  '🦄',
  '🐱',
  '🐶',
  '🐸',
  '🦁',
  '🐰',
  '🐨',
  '🐯',
  '🐙',
  '🦉',
  '🐢',
  '🚀',
  '⭐',
] as const;
export const CHILD_COLORS = [
  '#ff8a5c',
  '#5ccf8f',
  '#7c5cff',
  '#3fb6e8',
  '#ff5d8f',
  '#ffc145',
  '#26c6da',
  '#a06cd5',
] as const;
