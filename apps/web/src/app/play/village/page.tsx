'use client';

import { Card, ProgressBar, Spinner, cx } from '@mimo/ui';
import { PageHeader } from '@/components/PageHeader';
import { VillageMap } from '@/components/VillageMap';
import { useI18n } from '@/i18n';
import { useVillage } from '@/lib/queries';

export default function VillagePage() {
  const { t } = useI18n();
  const { data: village, isPending } = useVillage();
  if (isPending || !village) return <Spinner size={36} />;

  const previous = [...village.buildings]
    .filter((b) => b.unlocked)
    .sort((a, b) => b.requiredPoints - a.requiredPoints)[0];
  const from = previous?.requiredPoints ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={village.name} subtitle={t('village.contribute')} emoji="🏡" />
      <VillageMap village={village} />
      <Card>
        <p className="font-display text-lg font-bold">
          🏅 {t('village.points', { count: village.points })}
        </p>
        {village.next ? (
          <ProgressBar
            className="mt-2"
            label={t('village.next', {
              name: village.next.name,
              count: village.next.requiredPoints,
            })}
            value={village.points - from}
            max={village.next.requiredPoints - from}
            color="linear-gradient(90deg, #4cc283, #9be7a5)"
          />
        ) : (
          <p className="mt-2 text-ink/70">{t('village.complete')}</p>
        )}
      </Card>

      <section>
        <h2 className="mb-2 font-display text-xl font-bold">🤝 {t('village.week')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {village.familyMissions.map((fm) => (
            <li key={fm.id}>
              <Card className={cx(fm.completed && 'ring-2 ring-mint')}>
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
                  {fm.completed ? '✅' : `${fm.progress} / ${fm.target}`} · +{fm.rewardPoints} 🏅
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {village.buildings.map((b) => (
            <li
              key={b.id}
              className={cx(
                'rounded-2xl bg-white p-3 text-center shadow-sm',
                !b.unlocked && 'opacity-60',
              )}
            >
              <span className={cx('block text-3xl', !b.unlocked && 'grayscale')} aria-hidden="true">
                {b.unlocked ? b.emoji : '🚧'}
              </span>
              <span className="block font-semibold">{b.name}</span>
              <span className="text-xs text-ink/60">
                {b.unlocked ? t('village.built') : `${t('village.locked')} · ${b.requiredPoints}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
