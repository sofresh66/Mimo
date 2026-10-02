'use client';

import { Badge, Card, Spinner, buttonClassName } from '@mimo/ui';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { useI18n } from '@/i18n';
import { useGames } from '@/lib/queries';

export default function GamesPage() {
  const { t } = useI18n();
  const { data: games, isPending } = useGames();
  return (
    <div>
      <PageHeader title={t('games.title')} subtitle={t('games.subtitle')} emoji="🎲" />
      {isPending || !games ? (
        <Spinner size={36} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {games.map((g) => (
            <li key={g.key}>
              <Card className="flex h-full flex-col items-center gap-2 text-center">
                <span className="text-6xl" aria-hidden="true">
                  {g.emoji}
                </span>
                <p className="font-display text-xl font-bold">{g.name}</p>
                <p className="text-sm text-ink/70">{g.description}</p>
                <Badge color={g.rewardedSessionsLeft > 0 ? '#7c5cff' : '#8a94a6'}>
                  {g.rewardedSessionsLeft > 0
                    ? t('games.rewardsLeft', { count: g.rewardedSessionsLeft })
                    : t('games.noMoreRewards')}
                </Badge>
                <Link
                  href={`/play/games/${g.key}`}
                  className={buttonClassName({ block: true, className: 'mt-auto' })}
                >
                  {t('games.play')}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
