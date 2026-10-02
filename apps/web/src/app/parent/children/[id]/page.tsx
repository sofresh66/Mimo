'use client';

import type { MissionSuggestion } from '@mimo/types';
import { Avatar, Button, CATEGORY_META, CreatureCard, Modal, ParentPanel, Spinner } from '@mimo/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { MissionForm, draftFromTemplate, type MissionDraft } from '@/components/MissionForm';
import { CategoryBalance, Timeline } from '@/components/parent';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { equipmentEmojis } from '@/lib/creature';
import { relativeTime } from '@/lib/events';
import { keys, useChildDetail, useTemplates } from '@/lib/queries';

export default function ChildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const { data, isPending } = useChildDetail(id);
  const { data: templates } = useTemplates();
  const { data: suggestions } = useQuery({
    queryKey: ['parent', 'suggestions', id],
    queryFn: () => http.get<MissionSuggestion[]>(`/parent/children/${id}/suggestions`),
  });
  const [draft, setDraft] = useState<MissionDraft | null>(null);

  if (isPending || !data) return <Spinner size={36} />;
  const o = data.overview;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/parent" className="text-sm text-primary hover:underline">
        ← {t('parent.nav.dashboard')}
      </Link>
      <div className="flex items-center gap-3">
        <Avatar emoji={o.avatar} color={o.color} size={56} />
        <div>
          <h1 className="text-2xl font-semibold">{o.displayName}</h1>
          <p className="text-sm text-slate-500">
            {t('parent.lastSeen', {
              date: o.lastSeenAt ? relativeTime(o.lastSeenAt) : t('parent.never'),
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <ParentPanel title={t('parent.creatures')}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.creatures.map((c) => (
                <li key={c.id}>
                  <CreatureCard
                    name={c.name}
                    subtitle={`${c.formName} · ${t('parent.level', { level: c.level })}`}
                    appearance={c.appearance}
                    equipment={equipmentEmojis(c.equipment)}
                    mood={c.mood}
                    size={110}
                    className="shadow-none ring-slate-200"
                  />
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat
                label={t('parent.nav.missions')}
                value={t('parent.missionsTotal', { count: o.missionsCompletedTotal })}
              />
              <Stat label="XP" value={t('parent.xpWeek', { count: o.xpWeek })} />
              <Stat
                label="🧭"
                value={t('parent.explorations', { count: o.explorationsCompleted })}
              />
              <Stat label="🍳" value={t('parent.recipes', { count: o.recipesDiscovered })} />
            </dl>
            <CategoryBalance categoryXp={o.categoryXp} />
          </ParentPanel>

          <ParentPanel title={t('parent.nav.history')}>
            <Timeline events={data.history} />
          </ParentPanel>
        </div>

        <div className="flex flex-col gap-5">
          <ParentPanel title={t('parent.suggestions')} description={t('parent.suggestionsHint')}>
            <ul className="flex flex-col gap-2">
              {suggestions?.map((s) => (
                <li key={s.templateId} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-medium">
                    {s.icon} {s.title}
                  </p>
                  <p className="text-xs text-slate-500">{s.reason}</p>
                  <Button
                    size="sm"
                    variant="soft"
                    className="mt-2"
                    onClick={() => {
                      const tpl = templates?.find((x) => x.id === s.templateId);
                      if (tpl) setDraft({ ...draftFromTemplate(tpl), assignedChildId: id });
                    }}
                  >
                    {t('parent.useSuggestion')}
                  </Button>
                </li>
              ))}
            </ul>
          </ParentPanel>
          <ParentPanel title={t('parent.recentXp')}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.recentXp.map((x) => (
                <li key={x.id} className="flex justify-between">
                  <span>
                    <span
                      className="mr-1 inline-block size-2 rounded-full"
                      style={{ background: CATEGORY_META[x.category].color }}
                    />
                    {t(`categories.${x.category}`)}
                  </span>
                  <span className="font-semibold">+{x.amount}</span>
                  <span className="text-slate-400">{relativeTime(x.createdAt)}</span>
                </li>
              ))}
            </ul>
          </ParentPanel>
        </div>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={t('parentMissions.create')}
      >
        {draft && (
          <MissionForm
            initial={draft}
            onSaved={() => {
              toast(t('parentMissions.created'), 'success');
              setDraft(null);
              void client.invalidateQueries({ queryKey: keys.parent.missions });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
