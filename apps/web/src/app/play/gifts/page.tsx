'use client';

import type { RewardOpenResult, RewardView } from '@mimo/types';
import { Button, EmptyState, Modal, Spinner } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { LootGrid, useCelebrations } from '@/components/Celebrations';
import { Confetti } from '@/components/Confetti';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useRewards } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function GiftsPage() {
  const { t } = useI18n();
  const { data: rewards, isPending } = useRewards();
  const [opening, setOpening] = useState<RewardView | null>(null);

  const origin = (r: RewardView) =>
    r.source === 'PARENT' && r.fromName
      ? t('gifts.fromParent', { name: r.fromName })
      : r.source === 'MISSION'
        ? t('gifts.fromMission')
        : r.source === 'LEVEL_UP'
          ? t('gifts.fromLevel')
          : t('gifts.fromFamily');

  return (
    <div>
      <PageHeader title={t('gifts.title')} emoji="🎁" />
      {isPending ? (
        <Spinner size={36} />
      ) : !rewards || rewards.length === 0 ? (
        <EmptyState emoji="🎀" title={t('gifts.empty')}>
          {t('gifts.emptyHint')}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rewards.map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.05 * i }}
            >
              <button
                type="button"
                onClick={() => setOpening(r)}
                className="flex w-full flex-col items-center gap-1 rounded-3xl bg-white p-4 text-center shadow-[0_6px_0_0_rgba(45,42,62,0.08)] focus-visible:outline-4 focus-visible:outline-primary/50"
              >
                <motion.span
                  className="text-6xl"
                  aria-hidden="true"
                  animate={{ rotate: [0, -6, 6, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 2.2, repeatDelay: 1 + i * 0.3 }}
                >
                  {r.item?.category === 'CHEST' ? r.item.emoji : '🎁'}
                </motion.span>
                <span className="font-display font-bold">{origin(r)}</span>
                {r.message && <span className="text-sm italic text-ink/60">« {r.message} »</span>}
              </button>
            </motion.li>
          ))}
        </ul>
      )}
      <OpenGiftModal reward={opening} onClose={() => setOpening(null)} />
    </div>
  );
}

/** Ouverture d'un cadeau : le coffre tremble, s'ouvre, puis révèle son contenu. */
function OpenGiftModal({ reward, onClose }: { reward: RewardView | null; onClose: () => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { celebrateOutcome } = useCelebrations();
  const [result, setResult] = useState<RewardOpenResult | null>(null);

  const open = useMutation({
    mutationFn: (id: string) => http.post<RewardOpenResult>(`/me/rewards/${id}/open`),
    onSuccess: (res) => {
      playSound('open');
      window.setTimeout(() => playSound('coin'), 500);
      setResult(res);
      for (const key of [keys.rewards, keys.home, keys.inventory])
        void client.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      toast(errorMessage(error), 'error');
      onClose();
    },
  });

  const close = () => {
    const outcome = result?.outcome;
    setResult(null);
    open.reset();
    onClose();
    celebrateOutcome(outcome);
  };

  return (
    <Modal
      open={reward !== null}
      onClose={close}
      title={t('celebrate.gift')}
      dismissable={!open.isPending}
      size="sm"
    >
      {reward && (
        <div className="relative flex flex-col items-center gap-3 text-center">
          {result && <Confetti count={28} />}
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.button
                key="closed"
                type="button"
                onClick={() => open.mutate(reward.id)}
                disabled={open.isPending}
                aria-label={t('gifts.open')}
                className="rounded-full p-4 text-8xl focus-visible:outline-4 focus-visible:outline-primary/50"
                animate={
                  open.isPending
                    ? { rotate: [0, -12, 12, -12, 12, 0], scale: [1, 1.1, 1.1, 1.15, 1.2, 1.3] }
                    : { y: [0, -8, 0] }
                }
                transition={
                  open.isPending ? { duration: 0.7 } : { repeat: Infinity, duration: 1.4 }
                }
                exit={{ scale: 1.6, opacity: 0 }}
              >
                {reward.item?.category === 'CHEST' ? reward.item.emoji : '🎁'}
              </motion.button>
            ) : (
              <motion.div
                key="open"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full"
              >
                {reward.message && (
                  <p className="mb-2 font-display text-lg font-bold">« {reward.message} »</p>
                )}
                {result.outcome && (
                  <p className="font-display text-3xl font-bold text-primary">
                    +{result.outcome.xpGained} XP
                  </p>
                )}
                <LootGrid loot={result.loot} />
              </motion.div>
            )}
          </AnimatePresence>
          {!result ? (
            <p className="text-ink/70">{t('gifts.tapToOpen')}</p>
          ) : (
            <Button block onClick={close}>
              {t('celebrate.awesome')}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
