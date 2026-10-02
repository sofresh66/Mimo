'use client';

import { ParentPanel, ProgressBar, Spinner, buttonClassName } from '@mimo/ui';
import Link from 'next/link';
import { ChildOverviewCard, PendingList, Timeline } from '@/components/parent';
import { useI18n } from '@/i18n';
import { useDashboard, usePending } from '@/lib/queries';

export default function ParentDashboardPage() {
  const { t } = useI18n();
  const { data, isPending } = useDashboard();
  const { data: pending } = usePending();
  if (isPending || !data) return <Spinner size={36} />;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <ParentPanel title={`${t('parent.pending')} (${(pending ?? data.pending).length})`}>
          <PendingList pending={pending ?? data.pending} />
        </ParentPanel>

        <section aria-labelledby="children-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="children-title" className="font-semibold">
              {t('parent.children')}
            </h2>
            <Link
              href="/parent/children"
              className={buttonClassName({ size: 'sm', variant: 'soft' })}
            >
              + {t('parent.addChild')}
            </Link>
          </div>
          {data.children.length === 0 ? (
            <p className="text-sm text-slate-500">{t('parent.noChildren')}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.children.map((c) => (
                <ChildOverviewCard key={c.id} child={c} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-5">
        <ParentPanel
          title={t('parent.familyMissions')}
          description={t('parent.village', { points: data.village.points })}
        >
          <ul className="flex flex-col gap-3">
            {data.familyMissions.map((fm) => (
              <li key={fm.id}>
                <ProgressBar
                  label={`${fm.icon} ${fm.title}`}
                  value={fm.progress}
                  max={fm.target}
                  valueText={fm.completed ? '✓' : `${fm.progress}/${fm.target}`}
                  size="sm"
                  color={fm.completed ? '#4cc283' : '#7c5cff'}
                />
              </li>
            ))}
          </ul>
        </ParentPanel>
        <ParentPanel title={t('parent.recent')}>
          <Timeline events={data.recent} />
          <Link
            href="/parent/history"
            className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
          >
            {t('parent.nav.history')} →
          </Link>
        </ParentPanel>
      </div>
    </div>
  );
}
