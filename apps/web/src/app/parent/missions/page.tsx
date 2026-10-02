'use client';

import type { MissionView } from '@mimo/types';
import { Badge, Button, CATEGORY_META, Modal, ParentPanel, Spinner, cx } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  EMPTY_DRAFT,
  MissionForm,
  draftFromMission,
  draftFromTemplate,
  type MissionDraft,
} from '@/components/MissionForm';
import { SelectField } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useParentMissions, useProfiles, useTemplates } from '@/lib/queries';

type Editing = { draft: MissionDraft; id?: string } | null;

export default function ParentMissionsPage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: missions, isPending } = useParentMissions();
  const { data: templates } = useTemplates();
  const { data: profiles } = useProfiles();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [validating, setValidating] = useState<MissionView | null>(null);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.parent.missions });
    void client.invalidateQueries({ queryKey: keys.parent.dashboard });
  };
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      http.patch(`/missions/${id}`, body),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => http.del(`/missions/${id}`),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const childName = (id: string | null) =>
    id ? (profiles?.find((p) => p.id === id)?.displayName ?? '?') : t('parentMissions.everyone');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('parentMissions.title')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing({ draft: EMPTY_DRAFT })}>
            {t('parentMissions.custom')}
          </Button>
          <Button onClick={() => setPicking(true)}>+ {t('parentMissions.create')}</Button>
        </div>
      </div>

      <ParentPanel title={t('parentMissions.title')}>
        {isPending ? (
          <Spinner size={28} />
        ) : !missions || missions.length === 0 ? (
          <p className="text-sm text-slate-500">{t('parentMissions.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {missions.map((m) => (
              <li
                key={m.id}
                className={cx(
                  'flex flex-wrap items-center gap-3 py-3',
                  !m.isActive && 'opacity-60',
                )}
              >
                <span
                  className="grid size-11 place-items-center rounded-xl text-2xl"
                  style={{ background: `${CATEGORY_META[m.category].color}1f` }}
                  aria-hidden="true"
                >
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">{m.title}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                    <Badge color={CATEGORY_META[m.category].color}>
                      {t(`categories.${m.category}`)}
                    </Badge>
                    <Badge color="#7c5cff">+{m.xp} XP</Badge>
                    {m.coins > 0 && <Badge color="#b7791f">+{m.coins} 💰</Badge>}
                    <Badge color="#64748b">
                      {m.recurrence === 'DAILY'
                        ? t('missions.daily')
                        : m.recurrence === 'WEEKLY'
                          ? t('missions.weekly')
                          : t('missions.once')}
                    </Badge>
                    <Badge color="#64748b">👤 {childName(m.assignedChildId)}</Badge>
                    {m.rewardItem && <Badge color="#ff5d8f">🎁 {m.rewardItem.name}</Badge>}
                    {!m.isActive && <Badge color="#94a3b8">{t('parentMissions.inactive')}</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.isActive && (
                    <Button size="sm" variant="success" onClick={() => setValidating(m)}>
                      ✓ {t('parentMissions.validateFor')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing({ draft: draftFromMission(m), id: m.id })}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: m.id, body: { isActive: !m.isActive } })}
                  >
                    {m.isActive ? t('parentMissions.pause') : t('parentMissions.resume')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('common.delete')} ${m.title}`}
                    onClick={() => {
                      if (window.confirm(t('parentMissions.deleteConfirm'))) remove.mutate(m.id);
                    }}
                  >
                    🗑
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ParentPanel>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title={t('parentMissions.fromTemplate')}
        size="lg"
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates?.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                onClick={() => {
                  setPicking(false);
                  setEditing({ draft: draftFromTemplate(tpl) });
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-primary hover:bg-primary/5 focus-visible:outline-4 focus-visible:outline-primary/40"
              >
                <span className="text-2xl" aria-hidden="true">
                  {tpl.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{tpl.title}</span>
                  <span className="text-xs text-slate-500">
                    {t(`categories.${tpl.category}`)} · +{tpl.xp} XP
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('parentMissions.edit') : t('parentMissions.create')}
      >
        {editing && (
          <MissionForm
            key={editing.id ?? editing.draft.templateId ?? 'new'}
            initial={editing.draft}
            missionId={editing.id}
            onSaved={() => {
              toast(
                editing.id ? t('parentMissions.saved') : t('parentMissions.created'),
                'success',
              );
              setEditing(null);
              refresh();
            }}
          />
        )}
      </Modal>

      <ValidateModal mission={validating} onClose={() => setValidating(null)} />
    </div>
  );
}

function ValidateModal({ mission, onClose }: { mission: MissionView | null; onClose: () => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: profiles } = useProfiles();
  const eligible =
    profiles?.filter((p) =>
      mission?.assignedChildId ? p.id === mission.assignedChildId : p.type === 'CHILD',
    ) ?? [];
  const [childId, setChildId] = useState('');
  const validate = useMutation({
    mutationFn: () =>
      http.post(`/missions/${mission?.id}/validate`, { childId: childId || eligible[0]?.id }),
    onSuccess: () => {
      const name = eligible.find((p) => p.id === (childId || eligible[0]?.id))?.displayName ?? '';
      toast(t('parent.validated', { name }), 'success');
      void client.invalidateQueries({ queryKey: keys.parent.dashboard });
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <Modal
      open={mission !== null}
      onClose={onClose}
      title={`${mission?.icon ?? ''} ${mission?.title ?? ''}`}
      size="sm"
    >
      <div className="flex flex-col gap-3">
        <SelectField
          label={t('parentMissions.validateFor')}
          value={childId || eligible[0]?.id || ''}
          onChange={(e) => setChildId(e.target.value)}
        >
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.avatar} {p.displayName}
            </option>
          ))}
        </SelectField>
        <Button
          variant="success"
          onClick={() => validate.mutate()}
          loading={validate.isPending}
          block
        >
          ✓ {t('parent.approve')}
        </Button>
      </div>
    </Modal>
  );
}
