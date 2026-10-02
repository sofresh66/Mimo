'use client';

import type {
  MathDifficulty,
  MiniGameKey,
  MiniGameResult,
  MiniGameStartResponse,
  MiniGameSubmission,
} from '@mimo/types';
import { Button, Card, Spinner, Tabs, buttonClassName } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCelebrations } from '@/components/Celebrations';
import { MathGame, MemoryGame, SequenceGame } from '@/components/games';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useGames } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function GamePage() {
  const { key } = useParams<{ key: MiniGameKey }>();
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { celebrateOutcome } = useCelebrations();
  const { data: games } = useGames();
  const info = games?.find((g) => g.key === key);
  const [difficulty, setDifficulty] = useState<MathDifficulty>('medium');
  const [session, setSession] = useState<MiniGameStartResponse | null>(null);
  const [result, setResult] = useState<MiniGameResult | null>(null);

  const start = useMutation({
    mutationFn: () => http.post<MiniGameStartResponse>(`/me/games/${key}/start`, { difficulty }),
    onSuccess: (s) => {
      setResult(null);
      setSession(s);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });
  const submit = useMutation({
    mutationFn: (submission: MiniGameSubmission) =>
      http.post<MiniGameResult>(`/me/games/sessions/${session?.sessionId}/submit`, { submission }),
    onSuccess: (r) => {
      playSound(r.xpAwarded > 0 ? 'success' : 'pop');
      setResult(r);
      setSession(null);
      for (const k of [keys.games, keys.home, keys.village])
        void client.invalidateQueries({ queryKey: k });
      celebrateOutcome(r.outcome);
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <div>
      <PageHeader title={info?.name ?? ''} subtitle={info?.description} emoji={info?.emoji} />

      {!session && !result && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <span className="text-7xl" aria-hidden="true">
            {info?.emoji ?? '🎲'}
          </span>
          {key !== 'memory' && (
            <div className="w-full max-w-sm">
              <p className="mb-2 font-semibold">{t('games.difficulty')}</p>
              <Tabs<MathDifficulty>
                label={t('games.difficulty')}
                value={difficulty}
                onChange={setDifficulty}
                items={[
                  { key: 'easy', label: t('games.easy') },
                  { key: 'medium', label: t('games.medium') },
                  { key: 'hard', label: t('games.hard') },
                ]}
              />
            </div>
          )}
          {info && (
            <p className="text-sm text-ink/60">
              {info.rewardedSessionsLeft > 0
                ? t('games.rewardsLeft', { count: info.rewardedSessionsLeft })
                : t('games.noMoreRewards')}
            </p>
          )}
          <Button size="lg" onClick={() => start.mutate()} loading={start.isPending}>
            ▶ {t('games.play')}
          </Button>
        </Card>
      )}

      {session && (
        <div className={submit.isPending ? 'pointer-events-none opacity-60' : undefined}>
          {session.challenge.kind === 'memory' && (
            <MemoryGame
              cards={session.challenge.cards}
              onFinish={(flips) => submit.mutate({ kind: 'memory', flips })}
            />
          )}
          {session.challenge.kind === 'math' && (
            <MathGame
              questions={session.challenge.questions}
              onFinish={(answers) => submit.mutate({ kind: 'math', answers })}
            />
          )}
          {session.challenge.kind === 'sequence' && (
            <SequenceGame
              questions={session.challenge.questions}
              onFinish={(answers) => submit.mutate({ kind: 'sequence', answers })}
            />
          )}
          {submit.isPending && <Spinner size={32} />}
        </div>
      )}

      {result && (
        <Card className="flex flex-col items-center gap-3 text-center" role="status">
          <span className="text-6xl" aria-hidden="true">
            {result.score === result.maxScore
              ? '🏆'
              : result.score > result.maxScore / 2
                ? '🌟'
                : '👍'}
          </span>
          <p className="font-display text-3xl font-bold">{t('games.finished')}</p>
          <p className="text-xl">
            {t('games.score', { score: result.score, max: result.maxScore })}
          </p>
          <p className="font-display text-2xl font-bold text-primary">
            {result.xpAwarded > 0 ? t('games.xpWon', { count: result.xpAwarded }) : t('games.noXp')}
          </p>
          {key !== 'memory' && (
            <details className="w-full max-w-sm text-left">
              <summary className="cursor-pointer font-semibold">{t('games.corrections')}</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.corrections.map((c, i) => (
                  <li key={i} className={c.correct ? 'text-mint' : 'text-coral'}>
                    {c.correct ? '✅' : '❌'} {i + 1}. {c.given ?? '—'}{' '}
                    {c.correct ? '' : `→ ${c.expected}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              🔁 {t('games.again')}
            </Button>
            <Link href="/play/games" className={buttonClassName({ variant: 'secondary' })}>
              {t('games.backToGames')}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
