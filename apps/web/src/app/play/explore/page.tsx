'use client';

import type { ExplorationView, ZoneView } from '@mimo/types';
import { Badge, Button, Card, Creature, Spinner, cx } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useCelebrations } from '@/components/Celebrations';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { formatDuration } from '@/lib/creature';
import { useErrorMessage } from '@/lib/errors';
import { keys, useExplorations, useHome, useZones } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function ExplorePage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { celebrate } = useCelebrations();
  const { data: home } = useHome();
  const { data: zones, isPending } = useZones();
  const { data: history } = useExplorations();
  const creature = home?.creature;
  const current = home?.exploration ?? null;

  const start = useMutation({
    mutationFn: (zoneId: string) => http.post<ExplorationView>('/me/explorations', { zoneId }),
    onSuccess: () => {
      playSound('success');
      void client.invalidateQueries({ queryKey: keys.home });
      void client.invalidateQueries({ queryKey: keys.explorations });
    },
    onError: (error) => {
      playSound('error');
      toast(errorMessage(error), 'info');
    },
  });

  if (!creature) return null;
  const isEgg = creature.stage === 'EGG';

  return (
    <div>
      <PageHeader
        title={t('explore.title')}
        subtitle={t('explore.subtitle', { name: creature.name })}
        emoji="🧭"
      />

      {current && current.status === 'IN_PROGRESS' && <CurrentExploration exploration={current} />}
      {isEgg && (
        <Card className="mb-4 text-center">
          <p className="text-5xl" aria-hidden="true">
            🥚
          </p>
          <p className="font-semibold text-ink/80">{t('explore.eggCannot')}</p>
        </Card>
      )}

      {isPending || !zones ? (
        <Spinner size={36} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {zones.map((zone, i) => (
            <motion.li
              key={zone.id}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 * i }}
            >
              <ZoneCard
                zone={zone}
                energy={creature.stats.energy}
                disabled={isEgg || Boolean(current) || start.isPending}
                onGo={() => start.mutate(zone.id)}
              />
            </motion.li>
          ))}
        </ul>
      )}

      {history && history.some((h) => h.status === 'COMPLETED') && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-bold">{t('explore.history')}</h2>
          <ul className="flex flex-col gap-2">
            {history
              .filter((h) => h.status === 'COMPLETED')
              .slice(0, 8)
              .map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => celebrate({ kind: 'exploration', exploration: h })}
                    className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm focus-visible:outline-4 focus-visible:outline-primary/50"
                  >
                    <span className="text-3xl" aria-hidden="true">
                      {h.zone.emoji}
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold">{h.zone.name}</span>
                      <span className="text-sm text-ink/60">
                        {h.completedAt ? new Date(h.completedAt).toLocaleString() : ''}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {h.rewards ? `💰 ${h.rewards.coins} · 🎒 ${h.rewards.items.length}` : ''}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  energy,
  disabled,
  onGo,
}: {
  zone: ZoneView;
  energy: number;
  disabled: boolean;
  onGo: () => void;
}) {
  const { t } = useI18n();
  const tired = energy < zone.energyCost;
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-3xl p-4 text-white shadow-md',
        zone.locked && 'grayscale',
      )}
      style={{ background: `linear-gradient(135deg, ${zone.colors[0]}, ${zone.colors[1]})` }}
    >
      <span className="absolute -right-3 -top-3 text-8xl opacity-30" aria-hidden="true">
        {zone.emoji}
      </span>
      <p className="font-display text-xl font-bold drop-shadow">
        <span aria-hidden="true">{zone.emoji}</span> {zone.name}
      </p>
      <p className="mt-1 text-sm text-white/90">{zone.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className="bg-white/25 text-white">⏱ {formatDuration(zone.durationSeconds)}</Badge>
        <Badge className="bg-white/25 text-white">⚡ {zone.energyCost}</Badge>
        <Badge className="bg-white/25 text-white">⭐ +{zone.xpAmount} XP</Badge>
      </div>
      <div className="mt-3">
        {zone.locked ? (
          <p className="font-display font-bold">
            🔒 {t('explore.locked', { level: zone.minLevel })}
          </p>
        ) : (
          <Button variant="secondary" size="sm" onClick={onGo} disabled={disabled || tired}>
            {tired
              ? `😴 ${t('explore.energy', { count: zone.energyCost })}`
              : `🚀 ${t('explore.go')}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function CurrentExploration({ exploration }: { exploration: ExplorationView }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const { data: home } = useHome();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const total = new Date(exploration.endsAt).getTime() - new Date(exploration.startedAt).getTime();
  const remaining = Math.max(0, new Date(exploration.endsAt).getTime() - now);
  useEffect(() => {
    if (remaining === 0) void client.invalidateQueries({ queryKey: keys.home });
  }, [remaining, client]);
  const ratio = total > 0 ? 1 - remaining / total : 1;

  return (
    <Card className="mb-4 overflow-hidden">
      <p className="font-display text-lg font-bold">
        {t('child.exploringNow', { name: exploration.creatureName, zone: exploration.zone.name })}
      </p>
      <div
        className="relative mt-3 h-24 rounded-2xl"
        style={{
          background: `linear-gradient(90deg, ${exploration.zone.colors[0]}55, ${exploration.zone.colors[1]}55)`,
        }}
      >
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl" aria-hidden="true">
          {exploration.zone.emoji}
        </span>
        {home?.creature && (
          <motion.div
            className="absolute top-0"
            animate={{ left: `${Math.min(80, ratio * 80)}%` }}
            transition={{ ease: 'linear' }}
          >
            <Creature appearance={home.creature.appearance} size={80} label={home.creature.name} />
          </motion.div>
        )}
      </div>
      <p className="mt-2 font-semibold text-primary" role="timer">
        ⏳ {t('child.backIn', { time: formatDuration(remaining / 1000) })}
      </p>
    </Card>
  );
}
