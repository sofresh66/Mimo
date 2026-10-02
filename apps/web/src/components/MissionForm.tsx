'use client';

import type { MissionRecurrence, MissionTemplateView, MissionView, XpCategory } from '@mimo/types';
import { Button } from '@mimo/ui';
import { useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useGiftable, useProfiles } from '@/lib/queries';
import { Field, SelectField } from './forms';

const CATEGORIES: XpCategory[] = [
  'LOGIC',
  'CREATIVITY',
  'READING',
  'ADVENTURE',
  'HELPING',
  'SPORT',
];
const RECURRENCES: MissionRecurrence[] = ['DAILY', 'WEEKLY', 'ONCE'];

export interface MissionDraft {
  title: string;
  description: string;
  category: XpCategory;
  icon: string;
  xp: number;
  coins: number;
  recurrence: MissionRecurrence;
  assignedChildId: string | null;
  rewardItemId: string | null;
  templateId?: string;
}

export function draftFromTemplate(t: MissionTemplateView): MissionDraft {
  return {
    title: t.title,
    description: t.description,
    category: t.category,
    icon: t.icon,
    xp: t.xp,
    coins: t.coins,
    recurrence: 'DAILY',
    assignedChildId: null,
    rewardItemId: null,
    templateId: t.id,
  };
}

export function draftFromMission(m: MissionView): MissionDraft {
  return {
    title: m.title,
    description: m.description ?? '',
    category: m.category,
    icon: m.icon,
    xp: m.xp,
    coins: m.coins,
    recurrence: m.recurrence,
    assignedChildId: m.assignedChildId,
    rewardItemId: m.rewardItem?.id ?? null,
  };
}

export const EMPTY_DRAFT: MissionDraft = {
  title: '',
  description: '',
  category: 'HELPING',
  icon: '⭐',
  xp: 15,
  coins: 5,
  recurrence: 'DAILY',
  assignedChildId: null,
  rewardItemId: null,
};

/** Formulaire de création / modification d'une mission. */
export function MissionForm({
  initial,
  missionId,
  onSaved,
}: {
  initial: MissionDraft;
  missionId?: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const { data: profiles } = useProfiles();
  const { data: giftable } = useGiftable();
  const [draft, setDraft] = useState<MissionDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MissionDraft>(key: K, value: MissionDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title: draft.title,
      description: draft.description || undefined,
      category: draft.category,
      icon: draft.icon,
      xp: draft.xp,
      coins: draft.coins,
      recurrence: draft.recurrence,
      assignedChildId: draft.assignedChildId,
      rewardItemId: draft.rewardItemId,
    };
    try {
      if (missionId) await http.patch(`/missions/${missionId}`, body);
      else await http.post('/missions', { ...body, templateId: draft.templateId });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <Field
          label={t('parentMissions.fieldIcon')}
          value={draft.icon}
          onChange={(e) => set('icon', e.target.value.slice(0, 8))}
          required
        />
        <Field
          label={t('parentMissions.fieldTitle')}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={60}
          required
        />
      </div>
      <Field
        label={t('parentMissions.fieldDescription')}
        value={draft.description}
        onChange={(e) => set('description', e.target.value)}
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label={t('parentMissions.fieldCategory')}
          value={draft.category}
          onChange={(e) => set('category', e.target.value as XpCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('parentMissions.fieldRecurrence')}
          value={draft.recurrence}
          onChange={(e) => set('recurrence', e.target.value as MissionRecurrence)}
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {r === 'DAILY'
                ? t('missions.daily')
                : r === 'WEEKLY'
                  ? t('missions.weekly')
                  : t('missions.once')}
            </option>
          ))}
        </SelectField>
        <Field
          label={t('parentMissions.fieldXp')}
          type="number"
          min={1}
          max={100}
          value={draft.xp}
          onChange={(e) => set('xp', Number(e.target.value))}
          required
        />
        <Field
          label={t('parentMissions.fieldCoins')}
          type="number"
          min={0}
          max={100}
          value={draft.coins}
          onChange={(e) => set('coins', Number(e.target.value))}
          required
        />
      </div>
      <SelectField
        label={t('parentMissions.fieldAssigned')}
        value={draft.assignedChildId ?? ''}
        onChange={(e) => set('assignedChildId', e.target.value || null)}
      >
        <option value="">{t('parentMissions.everyone')}</option>
        {profiles?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.avatar} {p.displayName}
            {p.type === 'ADULT' ? ` (${t('parent.adultBadge')})` : ''}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('parentMissions.fieldReward')}
        value={draft.rewardItemId ?? ''}
        onChange={(e) => set('rewardItemId', e.target.value || null)}
      >
        <option value="">{t('parentMissions.noReward')}</option>
        {giftable?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.emoji} {item.name} ({t(`rarities.${item.rarity}`)})
          </option>
        ))}
      </SelectField>
      {error && (
        <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} block>
        {t('common.save')}
      </Button>
    </form>
  );
}
