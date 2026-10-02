'use client';

import type { RewardView, XpCategory } from '@mimo/types';
import { Badge, Button, ParentPanel, Spinner } from '@mimo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/events';
import { keys, useGiftable, useProfiles } from '@/lib/queries';

type SentReward = RewardView & { childId: string; claimed: boolean };
const CATEGORIES: XpCategory[] = [
  'LOGIC',
  'CREATIVITY',
  'READING',
  'ADVENTURE',
  'HELPING',
  'SPORT',
];

export default function ParentRewardsPage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: profiles } = useProfiles();
  const { data: giftable } = useGiftable();
  const { data: sent, isPending } = useQuery({
    queryKey: keys.parent.rewards,
    queryFn: () => http.get<SentReward[]>('/rewards'),
  });
  const [type, setType] = useState<'ITEM' | 'COINS' | 'XP'>('ITEM');

  const send = useMutation({
    mutationFn: (body: Record<string, unknown>) => http.post('/rewards', body),
    onSuccess: () => {
      toast(t('parentRewards.sent'), 'success');
      void client.invalidateQueries({ queryKey: keys.parent.rewards });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    send.mutate({
      childId: form.get('childId'),
      type,
      itemId: type === 'ITEM' ? form.get('itemId') : undefined,
      category: type === 'XP' ? form.get('category') : undefined,
      amount: Number(form.get('amount') ?? 1),
      message: String(form.get('message') ?? '') || undefined,
    });
  };

  const childName = (id: string) => profiles?.find((p) => p.id === id);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ParentPanel title={t('parentRewards.send')}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <SelectField label={t('parentRewards.child')} name="childId" required>
            {profiles?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatar} {p.displayName}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('parentRewards.type')}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="ITEM">{t('parentRewards.typeItem')}</option>
            <option value="COINS">{t('parentRewards.typeCoins')}</option>
            <option value="XP">{t('parentRewards.typeXp')}</option>
          </SelectField>
          {type === 'ITEM' && (
            <SelectField label={t('parentRewards.item')} name="itemId" required>
              {giftable?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji} {item.name} ({t(`rarities.${item.rarity}`)})
                </option>
              ))}
            </SelectField>
          )}
          {type === 'XP' && (
            <SelectField label={t('parentRewards.category')} name="category">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`categories.${c}`)}
                </option>
              ))}
            </SelectField>
          )}
          <Field
            label={t('parentRewards.amount')}
            name="amount"
            type="number"
            min={1}
            max={type === 'ITEM' ? 10 : 100}
            defaultValue={type === 'ITEM' ? 1 : 20}
            key={type}
            required
          />
          <Field label={t('parentRewards.message')} name="message" maxLength={120} />
          <Button type="submit" loading={send.isPending} block>
            🎁 {t('parentRewards.send')}
          </Button>
        </form>
      </ParentPanel>

      <ParentPanel title={t('parentRewards.history')}>
        {isPending ? (
          <Spinner size={28} />
        ) : !sent || sent.length === 0 ? (
          <p className="text-sm text-slate-500">{t('parentRewards.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="text-2xl" aria-hidden="true">
                  {r.type === 'ITEM' ? r.item?.emoji : r.type === 'COINS' ? '💰' : '⭐'}
                </span>
                <div className="flex-1">
                  <p className="font-medium">
                    {childName(r.childId)?.avatar} {childName(r.childId)?.displayName} ·{' '}
                    {r.type === 'ITEM'
                      ? `${r.item?.name} ×${r.amount}`
                      : r.type === 'COINS'
                        ? `${r.amount} 💰`
                        : `${r.amount} XP`}
                  </p>
                  {r.message && <p className="text-slate-500">« {r.message} »</p>}
                </div>
                <div className="text-right">
                  <Badge color={r.claimed ? '#4cc283' : '#94a3b8'}>
                    {r.claimed ? t('parentRewards.opened') : t('parentRewards.waiting')}
                  </Badge>
                  <p className="text-xs text-slate-400">{relativeTime(r.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ParentPanel>
    </div>
  );
}
