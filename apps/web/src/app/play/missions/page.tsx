'use client';

import type { ChildMissionView } from '@mimo/types';
import { Badge, Button, Card, EmptyState, MissionCard, ProgressBar, Spinner } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useChildMissions, useVillage } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function MissionsPage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: missions, isPending } = useChildMissions();
  const { data: village } = useVillage();

  const done = useMutation({
    mutationFn: (id: string) => http.post<ChildMissionView[]>(`/me/missions/${id}/done`),
    onSuccess: (list) => {
      playSound('success');
      client.setQueryData(keys.missions, list);
      void client.invalidateQueries({ queryKey: keys.home });
      toast(t('missions.sent'), 'success');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const recurrenceLabel = (m: ChildMissionView) =>
    m.recurrence === 'DAILY'
      ? t('missions.daily')
      : m.recurrence === 'WEEKLY'
        ? t('missions.weekly')
        : t('missions.once');

  return (
    <div>
      <PageHeader title={t('missions.title')} subtitle={t('missions.subtitle')} emoji="📋" />
      {isPending ? (
        <Spinner size={36} />
      ) : !missions || missions.length === 0 ? (
        <EmptyState emoji="🌈" title={t('missions.empty')}>
          {t('missions.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((m) => (
            <li key={m.id}>
              <MissionCard
                icon={m.icon}
                title={m.title}
                description={m.description}
                category={m.category}
                categoryLabel={t(`categories.${m.category}`)}
                xp={m.xp}
                coins={m.coins}
                status={
                  <>
                    <Badge color="#8a94a6">{recurrenceLabel(m)}</Badge>
                    {m.rewardItem && <Badge color="#ff5d8f">🎁 {m.rewardItem.name}</Badge>}
                  </>
                }
                action={
                  <MissionAction
                    mission={m}
                    onDone={() => done.mutate(m.id)}
                    busy={done.isPending && done.variables === m.id}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

      {village && village.familyMissions.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-bold">🤝 {t('missions.familyTitle')}</h2>
          <p className="mb-3 text-ink/70">{t('missions.familySubtitle')}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {village.familyMissions.map((fm) => (
              <li key={fm.id}>
                <Card className={fm.completed ? 'ring-2 ring-mint' : undefined}>
                  <p className="font-display font-bold">
                    <span aria-hidden="true">{fm.icon}</span> {fm.title}
                  </p>
                  <ProgressBar
                    className="mt-2"
                    label={fm.title}
                    hideLabel
                    value={fm.progress}
                    max={fm.target}
                    color={fm.completed ? '#4cc283' : '#7c5cff'}
                  />
                  <p className="mt-1 text-sm text-ink/60">
                    {fm.completed ? '✅' : `${fm.progress} / ${fm.target}`} · +{fm.rewardPoints} 🏡
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MissionAction({
  mission,
  onDone,
  busy,
}: {
  mission: ChildMissionView;
  onDone: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  if (mission.status === 'APPROVED') {
    return (
      <span className="shrink-0 text-3xl" role="img" aria-label={t('missions.approved')}>
        ✅
      </span>
    );
  }
  if (mission.status === 'PENDING') {
    return (
      <span className="shrink-0 text-center text-xs font-bold text-primary" role="status">
        <span className="block text-2xl" aria-hidden="true">
          ⏳
        </span>
        {t('missions.pending')}
      </span>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button size="sm" variant="success" onClick={onDone} loading={busy}>
        {t('missions.done')}
      </Button>
      {mission.status === 'DECLINED' && (
        <span className="text-[11px] text-ink/50">{t('missions.declinedHint')}</span>
      )}
    </div>
  );
}
