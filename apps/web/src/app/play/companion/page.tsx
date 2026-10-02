'use client';

import type { CompanionAction, CompanionResponse } from '@mimo/types';
import { Button, Card, Creature, EmptyState, Spinner } from '@mimo/ui';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n, type MessageKey } from '@/i18n';
import { http } from '@/lib/api';
import { equipmentEmojis } from '@/lib/creature';
import { useErrorMessage } from '@/lib/errors';
import { useCompanion, useHome } from '@/lib/queries';
import { playSound } from '@/lib/sound';

const ACTIONS: Array<{ key: CompanionAction; label: MessageKey; emoji: string }> = [
  { key: 'story', label: 'companion.story', emoji: '📖' },
  { key: 'riddle', label: 'companion.riddle', emoji: '🧩' },
  { key: 'math', label: 'companion.math', emoji: '➗' },
  { key: 'fact', label: 'companion.fact', emoji: '💡' },
  { key: 'joke', label: 'companion.joke', emoji: '😄' },
];

/** Compagnon à actions prédéfinies : jamais de saisie libre de l'enfant. */
export default function CompanionPage() {
  const { t } = useI18n();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: home } = useHome();
  const { data: status, isPending } = useCompanion();
  const [answerShown, setAnswerShown] = useState(false);
  const ask = useMutation({
    mutationFn: (action: CompanionAction) =>
      http.post<CompanionResponse>(`/me/companion/${action}`),
    onSuccess: () => {
      setAnswerShown(false);
      playSound('pop');
    },
    onError: (error) => toast(errorMessage(error), 'info'),
  });
  const creature = home?.creature;
  if (isPending || !creature) return <Spinner size={36} />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('companion.title', { name: creature.name })}
        subtitle={t('companion.subtitle')}
        emoji="💬"
      />
      {!status?.enabled ? (
        <EmptyState emoji="🔒" title={t('companion.disabled')} />
      ) : (
        <>
          <div className="flex items-end gap-2">
            <Creature
              appearance={creature.appearance}
              equipment={equipmentEmojis(creature.equipment)}
              mood={creature.mood}
              reaction={ask.isPending ? 'happy' : 'idle'}
              reactionKey={ask.submittedAt}
              size={120}
              label={creature.name}
            />
            <AnimatePresence mode="wait">
              {ask.data && (
                <motion.div
                  key={ask.data.text}
                  initial={{ opacity: 0, scale: 0.9, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  className="relative mb-6 flex-1 rounded-3xl rounded-bl-md bg-white p-4 shadow-md"
                  aria-live="polite"
                >
                  <p className="font-display text-lg font-bold">{ask.data.title}</p>
                  <p className="mt-1 text-lg leading-relaxed text-ink/85">{ask.data.text}</p>
                  {ask.data.answer && (
                    <div className="mt-3">
                      {answerShown ? (
                        <p className="rounded-2xl bg-mint/15 p-3 font-display text-lg font-bold text-ink">
                          ✅ {ask.data.answer}
                        </p>
                      ) : (
                        <Button size="sm" variant="soft" onClick={() => setAnswerShown(true)}>
                          {t('companion.showAnswer')}
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.filter((a) => status.allowedActions.includes(a.key)).map((a) => (
              <li key={a.key}>
                <Card className="p-0">
                  <button
                    type="button"
                    onClick={() => ask.mutate(a.key)}
                    disabled={ask.isPending}
                    className="flex min-h-16 w-full items-center gap-3 rounded-3xl px-4 text-left font-display text-lg font-semibold focus-visible:outline-4 focus-visible:outline-primary/50 disabled:opacity-60"
                  >
                    <span className="text-3xl" aria-hidden="true">
                      {a.emoji}
                    </span>
                    {t(a.label)}
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
