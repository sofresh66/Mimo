'use client';

import type { ChildHome, FeedResult } from '@mimo/types';
import {
  CATEGORY_META,
  Card,
  Creature,
  ProgressBar,
  STAT_COLORS,
  Spinner,
  cx,
  type CreatureReaction,
} from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCelebrations } from '@/components/Celebrations';
import { useToast } from '@/components/Toast';
import { useI18n, type MessageKey } from '@/i18n';
import { http } from '@/lib/api';
import { equipmentEmojis, formatDuration } from '@/lib/creature';
import { useErrorMessage } from '@/lib/errors';
import { keys, useHome } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function ChildHomePage() {
  const { data: home, isPending } = useHome();
  if (isPending || !home) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner size={40} />
      </div>
    );
  }
  if (!home.creature) return null;
  return <HomeView home={home} />;
}

function HomeView({ home }: { home: ChildHome }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { celebrateOutcome } = useCelebrations();
  const creature = home.creature;
  const [reaction, setReaction] = useState<{ type: CreatureReaction; key: number }>({
    type: 'idle',
    key: 0,
  });
  const react = (type: CreatureReaction) => setReaction((r) => ({ type, key: r.key + 1 }));

  const play = useMutation({
    mutationFn: () => http.post<FeedResult>('/me/creature/play'),
    onSuccess: (result) => {
      playSound('success');
      react('happy');
      client.setQueryData<ChildHome>(keys.home, (old) =>
        old ? { ...old, creature: result.creature } : old,
      );
      toast(t('child.playedTitle'), 'success');
      celebrateOutcome(result.outcome);
    },
    onError: (error) => {
      playSound('error');
      react('sleep');
      toast(errorMessage(error), 'info');
    },
  });

  if (!creature) return null;
  const isEgg = creature.stage === 'EGG';

  const actions: Array<{
    key: string;
    label: MessageKey;
    emoji: string;
    href?: string;
    onClick?: () => void;
    badge?: number;
    color: string;
  }> = [
    {
      key: 'play',
      label: 'child.play',
      emoji: '🎾',
      onClick: () => play.mutate(),
      color: '#ff7aa2',
    },
    { key: 'feed', label: 'child.feed', emoji: '🍎', href: '/play/kitchen', color: '#ff8a5c' },
    {
      key: 'explore',
      label: 'child.explore',
      emoji: '🧭',
      href: '/play/explore',
      color: '#4cc283',
    },
    {
      key: 'missions',
      label: 'child.missions',
      emoji: '📋',
      href: '/play/missions',
      badge: home.missionsTodo,
      color: '#7c5cff',
    },
    {
      key: 'inventory',
      label: 'child.inventory',
      emoji: '🎒',
      href: '/play/inventory',
      color: '#3fb6e8',
    },
    {
      key: 'collection',
      label: 'child.collection',
      emoji: '📚',
      href: '/play/collection',
      color: '#a06cd5',
    },
    { key: 'games', label: 'child.games', emoji: '🎲', href: '/play/games', color: '#ffc145' },
    {
      key: 'companion',
      label: 'child.companion',
      emoji: '💬',
      href: '/play/companion',
      color: '#26c6da',
    },
    {
      key: 'gifts',
      label: 'child.gifts',
      emoji: '🎁',
      href: '/play/gifts',
      badge: home.pendingRewards,
      color: '#ff5d8f',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold">
        {t('child.hello', { name: home.child.displayName })}
      </h1>

      <Card className="relative overflow-hidden p-0">
        <div
          className="relative flex flex-col items-center px-4 pb-4 pt-6"
          style={{
            background: `linear-gradient(180deg, ${creature.appearance.palette.belly}aa 0%, #ffffff 75%)`,
          }}
        >
          {home.roomDecorations.map((d, i) => (
            <span
              key={d.id}
              aria-hidden="true"
              className="absolute text-4xl"
              style={{
                left: i === 1 ? 'auto' : `${8 + i * 30}%`,
                right: i === 1 ? '8%' : undefined,
                top: i === 2 ? '55%' : '14%',
              }}
            >
              {d.emoji}
            </span>
          ))}
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">
            {t(`stages.${creature.stage}`)}
          </p>
          <h2 className="font-display text-4xl font-bold uppercase tracking-wide text-ink">
            {creature.name}
          </h2>
          <p className="text-ink/70">
            {creature.formName} · {t('common.level', { level: creature.level })}
          </p>
          <button
            type="button"
            className="mt-2 rounded-full focus-visible:outline-4 focus-visible:outline-primary/50"
            onClick={() => {
              playSound('pop');
              react('happy');
            }}
            aria-label={`${creature.name}, ${creature.formName}`}
          >
            <Creature
              appearance={creature.appearance}
              equipment={equipmentEmojis(creature.equipment)}
              mood={creature.mood}
              reaction={reaction.type}
              reactionKey={reaction.key}
              size={230}
              label={`${creature.name}, ${creature.formName}`}
            />
          </button>
          <motion.p
            key={creature.mood}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 rounded-2xl bg-white px-4 py-2 text-center font-semibold text-ink/80 shadow-sm"
          >
            {creature.isExploring && home.exploration
              ? t('child.exploringNow', { name: creature.name, zone: home.exploration.zone.name })
              : isEgg
                ? t('adopt.hatchHint')
                : t(`moods.${creature.mood}`, { name: creature.name })}
          </motion.p>
          {creature.isExploring && home.exploration && (
            <Countdown endsAt={home.exploration.endsAt} />
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <ProgressBar
          label={t('child.xp')}
          icon={<span aria-hidden="true">⭐</span>}
          value={creature.xpIntoLevel}
          max={creature.xpForNextLevel}
          valueText={`${creature.xpIntoLevel} / ${creature.xpForNextLevel}`}
          color={STAT_COLORS.xp}
          size="lg"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <ProgressBar
            label={t('child.happiness')}
            icon={<span aria-hidden="true">💖</span>}
            value={creature.stats.happiness}
            color={STAT_COLORS.happiness}
            valueText={`${creature.stats.happiness}%`}
          />
          <ProgressBar
            label={t('child.energy')}
            icon={<span aria-hidden="true">⚡</span>}
            value={creature.stats.energy}
            color={STAT_COLORS.energy}
            valueText={`${creature.stats.energy}%`}
          />
          <ProgressBar
            label={t('child.curiosity')}
            icon={<span aria-hidden="true">🔍</span>}
            value={creature.stats.curiosity}
            color={STAT_COLORS.curiosity}
            valueText={`${creature.stats.curiosity}%`}
          />
        </div>
      </Card>

      <ul className="grid grid-cols-3 gap-3">
        {actions.map((a, i) => {
          const content = (
            <>
              <span className="text-4xl" aria-hidden="true">
                {a.emoji}
              </span>
              <span className="font-display text-sm font-bold sm:text-base">{t(a.label)}</span>
              {a.badge ? (
                <span className="absolute right-2 top-2 grid min-w-6 place-items-center rounded-full bg-coral px-1.5 text-xs font-bold text-white">
                  {a.badge}
                </span>
              ) : null}
            </>
          );
          const className = cx(
            'relative flex aspect-[1.1] w-full flex-col items-center justify-center gap-1 rounded-3xl bg-white text-ink transition',
            'shadow-[0_6px_0_0_rgba(45,42,62,0.08)] hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-4 focus-visible:outline-primary/50',
          );
          return (
            <motion.li
              key={a.key}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.03 * i }}
            >
              {a.href ? (
                <Link
                  href={a.href}
                  className={className}
                  style={{ borderBottom: `5px solid ${a.color}` }}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={a.onClick}
                  disabled={play.isPending || creature.isExploring || isEgg}
                  className={cx(className, 'disabled:opacity-50')}
                  style={{ borderBottom: `5px solid ${a.color}` }}
                >
                  {content}
                </button>
              )}
            </motion.li>
          );
        })}
      </ul>

      {!isEgg && (
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold">{t('child.attributes')}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {(Object.keys(creature.attributes) as Array<keyof typeof creature.attributes>).map(
              (cat) => (
                <ProgressBar
                  key={cat}
                  size="sm"
                  label={t(`categories.${cat}`)}
                  icon={<span aria-hidden="true">{CATEGORY_META[cat].emoji}</span>}
                  value={creature.attributes[cat]}
                  color={CATEGORY_META[cat].color}
                />
              ),
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, (new Date(endsAt).getTime() - now) / 1000);
  useEffect(() => {
    // Filet de sécurité si l'événement temps réel n'arrive pas : on relit l'état à l'échéance.
    if (remaining === 0) void client.invalidateQueries({ queryKey: keys.home });
  }, [remaining, client]);
  return (
    <p className="mt-2 font-display font-semibold text-primary" role="timer" aria-live="off">
      ⏳ {t('child.backIn', { time: formatDuration(remaining) })}
    </p>
  );
}
