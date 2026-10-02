'use client';

import type { AccessorySlot, Appearance, ItemView, Mood, Rarity, XpCategory } from '@mimo/types';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Creature, type CreatureReaction } from './creature/Creature';
import { cx } from './cx';
import { Badge, Card } from './primitives';
import { CATEGORY_META, RARITY_COLORS } from './tokens';

// ─── CreatureCard ────────────────────────────────────────────────────────────

export interface CreatureCardProps {
  name: string;
  subtitle: string;
  appearance: Appearance;
  equipment?: Partial<Record<AccessorySlot, string>>;
  mood?: Mood;
  reaction?: CreatureReaction;
  reactionKey?: number | string;
  size?: number;
  footer?: ReactNode;
  className?: string;
}

export function CreatureCard({
  name,
  subtitle,
  appearance,
  equipment,
  mood,
  reaction,
  reactionKey,
  size = 140,
  footer,
  className,
}: CreatureCardProps) {
  return (
    <Card className={cx('flex flex-col items-center text-center', className)}>
      <Creature
        appearance={appearance}
        equipment={equipment}
        mood={mood}
        reaction={reaction}
        reactionKey={reactionKey}
        size={size}
        label={`${name}, ${subtitle}`}
      />
      <p className="mt-1 font-display text-lg font-bold text-ink">{name}</p>
      <p className="text-sm text-ink/60">{subtitle}</p>
      {footer}
    </Card>
  );
}

// ─── RarityFrame / RewardCard ────────────────────────────────────────────────

export function RarityBadge({ rarity, label }: { rarity: Rarity; label: string }) {
  return <Badge color={RARITY_COLORS[rarity]}>{label}</Badge>;
}

export function RewardCard({
  emoji,
  title,
  rarity,
  rarityLabel,
  quantity,
  delay = 0,
}: {
  emoji: string;
  title: string;
  rarity?: Rarity;
  rarityLabel?: string;
  quantity?: number;
  delay?: number;
}) {
  const color = rarity ? RARITY_COLORS[rarity] : '#ffc145';
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18, delay }}
      className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center ring-2"
      style={{ ['--tw-ring-color' as string]: color, boxShadow: `0 0 0 4px ${color}22` }}
    >
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="font-display text-sm font-bold leading-tight text-ink">{title}</span>
      {quantity !== undefined && quantity > 1 && (
        <span className="text-xs font-bold text-ink/60">× {quantity}</span>
      )}
      {rarity && rarityLabel && <RarityBadge rarity={rarity} label={rarityLabel} />}
    </motion.div>
  );
}

// ─── MissionCard ─────────────────────────────────────────────────────────────

export function MissionCard({
  icon,
  title,
  description,
  category,
  categoryLabel,
  xp,
  coins,
  status,
  action,
  className,
}: {
  icon: string;
  title: string;
  description?: string | null;
  category: XpCategory;
  categoryLabel: string;
  xp: number;
  coins: number;
  status?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const meta = CATEGORY_META[category];
  return (
    <Card className={cx('flex items-center gap-3', className)}>
      <span
        className="grid size-14 shrink-0 place-items-center rounded-2xl text-3xl"
        style={{ background: `${meta.color}1f` }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display font-bold leading-tight text-ink">{title}</p>
        {description && <p className="truncate text-sm text-ink/60">{description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge color={meta.color}>
            {meta.emoji} {categoryLabel}
          </Badge>
          <Badge color="#7c5cff">+{xp} XP</Badge>
          {coins > 0 && <Badge color="#d18b00">+{coins} 💰</Badge>}
          {status}
        </div>
      </div>
      {action}
    </Card>
  );
}

// ─── InventorySlot ───────────────────────────────────────────────────────────

export function InventorySlot({
  item,
  quantity,
  selected,
  equipped,
  onClick,
  label,
  disabled,
}: {
  item: Pick<ItemView, 'emoji' | 'name' | 'rarity'>;
  quantity?: number;
  selected?: boolean;
  equipped?: boolean;
  onClick?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const color = RARITY_COLORS[item.rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label ?? `${item.name}${quantity !== undefined ? ` × ${quantity}` : ''}`}
      className={cx(
        'relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl bg-white p-1 transition',
        'ring-2 hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-primary/60 disabled:opacity-40',
        selected && 'scale-[1.04] shadow-lg',
      )}
      style={{ ['--tw-ring-color' as string]: selected ? 'var(--color-primary)' : `${color}66` }}
    >
      <span className="text-3xl sm:text-4xl" aria-hidden="true">
        {item.emoji}
      </span>
      <span className="mt-0.5 line-clamp-1 px-1 text-[11px] font-semibold text-ink/70">
        {item.name}
      </span>
      {quantity !== undefined && (
        <span className="absolute right-1 top-1 min-w-6 rounded-full bg-ink px-1.5 text-xs font-bold text-white">
          {quantity}
        </span>
      )}
      {equipped && (
        <span className="absolute left-1 top-1 rounded-full bg-mint px-1.5 text-[10px] font-bold text-white">
          ✓
        </span>
      )}
    </button>
  );
}

// ─── ParentPanel ─────────────────────────────────────────────────────────────

/** Bloc sobre pour l'espace parent. */
export function ParentPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white p-4 sm:p-5', className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

// ─── PinPad ──────────────────────────────────────────────────────────────────

export interface PinPadProps {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
  label: string;
  deleteLabel: string;
  /** Change pour vider le champ (ex. après une erreur). */
  resetKey?: number;
}

/** Pavé numérique à grosses touches, utilisable au doigt et au clavier. */
export function PinPad({
  length = 4,
  onComplete,
  error,
  disabled,
  label,
  deleteLabel,
  resetKey,
}: PinPadProps) {
  const [digits, setDigits] = useState('');

  useEffect(() => setDigits(''), [resetKey]);

  const press = (d: string) => {
    if (disabled || digits.length >= length) return;
    const next = digits + d;
    setDigits(next);
    // Effet de bord hors de l'updater d'état (qui peut être rejoué en mode strict).
    if (next.length === length) window.setTimeout(() => onComplete(next), 120);
  };
  const erase = () => setDigits((c) => c.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        role="status"
        aria-label={`${label} : ${digits.length} / ${length}`}
        className="flex gap-3"
        animate={error ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        key={resetKey}
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cx(
              'size-5 rounded-full border-[3px] transition',
              i < digits.length ? 'scale-110 border-primary bg-primary' : 'border-ink/20 bg-white',
            )}
          />
        ))}
      </motion.div>
      {error && (
        <p role="alert" className="text-center font-semibold text-coral">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3" role="group" aria-label={label}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinKey key={d} onClick={() => press(d)} disabled={disabled}>
            {d}
          </PinKey>
        ))}
        <span />
        <PinKey onClick={() => press('0')} disabled={disabled}>
          0
        </PinKey>
        <PinKey onClick={erase} disabled={disabled} label={deleteLabel}>
          ⌫
        </PinKey>
      </div>
    </div>
  );
}

function PinKey({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-[72px] place-items-center rounded-full bg-white font-display text-2xl font-bold text-ink shadow-[0_4px_0_0_rgba(45,42,62,0.12)] ring-1 ring-ink/10 transition hover:bg-cream active:translate-y-[2px] active:shadow-none focus-visible:outline-4 focus-visible:outline-primary/60 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
