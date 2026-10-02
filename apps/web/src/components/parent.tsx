'use client';

import type { ChildOverview, GameEventView, PendingCompletionView } from '@mimo/types';
import { Avatar, Button, CATEGORY_META, Creature, ParentPanel } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { eventEmoji, eventText, relativeTime } from '@/lib/events';
import { keys } from '@/lib/queries';

/** File des missions à valider (temps réel côté enfant après validation). */
export function PendingList({ pending }: { pending: PendingCompletionView[] }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.parent.pending });
    void client.invalidateQueries({ queryKey: keys.parent.dashboard });
  };
  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      http.post(`/missions/completions/${id}/${approve ? 'approve' : 'decline'}`),
    onSuccess: (_, { id, approve }) => {
      const item = pending.find((p) => p.id === id);
      if (approve && item)
        toast(t('parent.validated', { name: item.child.displayName }), 'success');
      refresh();
    },
    onError: (error) => {
      toast(errorMessage(error), 'error');
      refresh();
    },
  });

  if (pending.length === 0)
    return <p className="text-sm text-slate-500">{t('parent.pendingEmpty')}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {pending.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
          <Avatar emoji={p.child.avatar} color={p.child.color} size={40} />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-medium">
              {p.mission.icon} {p.mission.title}
            </p>
            <p className="text-sm text-slate-500">
              {p.child.displayName} · +{p.mission.xp} XP · {t(`categories.${p.mission.category}`)}
              {p.requestedAt ? ` · ${relativeTime(p.requestedAt)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => review.mutate({ id: p.id, approve: false })}
              disabled={review.isPending}
            >
              {t('parent.decline')}
            </Button>
            <Button
              size="sm"
              variant="success"
              onClick={() => review.mutate({ id: p.id, approve: true })}
              loading={
                review.isPending && review.variables?.id === p.id && review.variables.approve
              }
            >
              ✓ {t('parent.approve')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChildOverviewCard({ child }: { child: ChildOverview }) {
  const { t } = useI18n();
  return (
    <ParentPanel
      title={`${child.avatar} ${child.displayName}`}
      description={
        child.lastSeenAt
          ? t('parent.lastSeen', { date: relativeTime(child.lastSeenAt) })
          : t('parent.lastSeen', { date: t('parent.never') })
      }
      actions={
        <Link
          href={`/parent/children/${child.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {t('parent.seeDetail')} →
        </Link>
      }
    >
      <div className="flex items-center gap-3">
        {child.creature ? (
          <Creature
            appearance={child.creature.appearance}
            size={86}
            animated={false}
            label={child.creature.name}
          />
        ) : (
          <span className="grid size-20 place-items-center text-4xl" aria-hidden="true">
            🥚
          </span>
        )}
        <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">{child.creature?.name ?? t('parent.noCreature')}</dt>
          <dd className="text-right font-semibold">{t('parent.level', { level: child.level })}</dd>
          <dt className="text-slate-500">{t('parent.nav.missions')}</dt>
          <dd className="text-right font-semibold">
            {t('parent.missionsWeek', { count: child.missionsCompletedWeek })}
          </dd>
          <dt className="text-slate-500">XP</dt>
          <dd className="text-right font-semibold">
            {t('parent.xpWeek', { count: child.xpWeek })}
          </dd>
          <dt className="text-slate-500">{t('parent.pending')}</dt>
          <dd className="text-right font-semibold">{child.pendingCount}</dd>
        </dl>
      </div>
      <CategoryBalance categoryXp={child.categoryXp} />
    </ParentPanel>
  );
}

/** Répartition des activités d'un enfant (jamais comparée aux autres enfants). */
export function CategoryBalance({ categoryXp }: { categoryXp: ChildOverview['categoryXp'] }) {
  const { t } = useI18n();
  const total = Object.values(categoryXp).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const entries = Object.entries(categoryXp) as Array<[keyof typeof categoryXp, number]>;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium text-slate-500">{t('parent.categoryBalance')}</p>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={entries
          .map(([c, v]) => `${t(`categories.${c}`)} ${Math.round((v / total) * 100)} %`)
          .join(', ')}
      >
        {entries.map(([cat, value]) =>
          value > 0 ? (
            <span
              key={cat}
              style={{ width: `${(value / total) * 100}%`, background: CATEGORY_META[cat].color }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {entries
          .filter(([, v]) => v > 0)
          .map(([cat, value]) => (
            <li key={cat}>
              <span
                className="mr-1 inline-block size-2 rounded-full"
                style={{ background: CATEGORY_META[cat].color }}
              />
              {t(`categories.${cat}`)} {Math.round((value / total) * 100)} %
            </li>
          ))}
      </ul>
    </div>
  );
}

export function Timeline({ events }: { events: GameEventView[] }) {
  const { tx, t } = useI18n();
  if (events.length === 0)
    return <p className="text-sm text-slate-500">{t('parent.noActivity')}</p>;
  return (
    <ol className="flex flex-col gap-2">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 text-sm">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100"
            aria-hidden="true"
          >
            {eventEmoji(e)}
          </span>
          <span className="flex-1 pt-1">{eventText(e, tx)}</span>
          <time className="shrink-0 pt-1 text-xs text-slate-400" dateTime={e.createdAt}>
            {relativeTime(e.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
