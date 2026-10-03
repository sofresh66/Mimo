'use client';

import type { FriendView, PlayTogetherResult, SocialEventView } from '@mimo/types';
import { Button, Card, Creature, EmptyState, Spinner, buttonClassName } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n, type MessageKey } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { relativeTime } from '@/lib/events';
import { keys, useFriends, useFriendsJournal, useHome } from '@/lib/queries';
import { hearts, lootText, socialText } from '@/lib/social';
import { playSound } from '@/lib/sound';

/** ❤️ Amis : relations de la créature du joueur et souvenirs récents. */
export default function FriendsPage() {
  const { t } = useI18n();
  const { data: home } = useHome();
  const { data: friends, isPending } = useFriends();
  const { data: journal } = useFriendsJournal();
  const [last, setLast] = useState<SocialEventView | null>(null);
  const tx = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('friends.title')} subtitle={t('friends.subtitle')} emoji="❤️" />

      {last && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="flex flex-col items-center gap-2 text-center" role="status">
            <span className="text-4xl" aria-hidden="true">
              {last.icon}
            </span>
            <p className="font-display text-lg font-bold">{socialText(last, tx)}</p>
            <Link href="/play" className={buttonClassName({ size: 'sm' })}>
              🏠 {t('child.home')}
            </Link>
          </Card>
        </motion.div>
      )}

      {isPending ? (
        <Spinner size={36} />
      ) : !home?.creature ? (
        <EmptyState emoji="🥚" title={t('friends.noCreature')} />
      ) : !friends || friends.length === 0 ? (
        <EmptyState emoji="🌱" title={t('friends.empty')} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="friends">
          {friends.map((f) => (
            <li key={f.creature.id}>
              <FriendCard friend={f} onPlayed={setLast} />
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-2 font-display text-xl font-bold">💌 {t('friends.journal')}</h2>
        {!journal || journal.length === 0 ? (
          <p className="text-ink/60">{t('friends.journalEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="journal">
            {journal.map((e) => {
              const loot = lootText(e);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-2 rounded-2xl bg-white p-3 shadow-sm"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {e.icon}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{socialText(e, tx)}</span>
                    {loot && (
                      <span className="block text-ink/70">{t('friends.found', { loot })}</span>
                    )}
                    <span className="block text-xs text-ink/50">{relativeTime(e.createdAt)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function FriendCard({
  friend,
  onPlayed,
}: {
  friend: FriendView;
  onPlayed: (event: SocialEventView) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [bounce, setBounce] = useState(0);

  const play = useMutation({
    mutationFn: () => http.post<PlayTogetherResult>(`/me/friends/${friend.creature.id}/play`),
    onSuccess: (result) => {
      playSound('success');
      setBounce((b) => b + 1);
      client.setQueryData<FriendView[]>(keys.friends, (old) =>
        old?.map((f) => (f.creature.id === result.friend.creature.id ? result.friend : f)),
      );
      for (const key of [keys.home, keys.friendsJournal, keys.inventory]) {
        void client.invalidateQueries({ queryKey: key });
      }
      onPlayed(result.event);
    },
    onError: (e) => {
      playSound('error');
      toast(errorMessage(e), 'info');
    },
  });

  const level = t(`friendshipLevels.${friend.levelKey}`);
  const next =
    friend.toNextLevel === null
      ? t('friends.max')
      : t('friends.next', {
          count: friend.toNextLevel,
          level: t(`friendshipLevels.${NEXT[friend.levelKey]}`),
        });
  return (
    <Card
      className="flex items-center gap-3"
      style={{ borderLeft: `6px solid ${friend.owner.color}` }}
    >
      <Creature
        appearance={friend.creature.appearance}
        size={76}
        reaction="happy"
        reactionKey={bounce}
        label={t('friends.creatureOf', {
          creature: friend.creature.name,
          owner: friend.owner.displayName,
        })}
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold leading-tight">
          {t('friends.creatureOf', {
            creature: friend.creature.name,
            owner: friend.owner.displayName,
          })}
        </p>
        <p className="text-sm font-semibold">
          <span aria-hidden="true">{hearts(friend.hearts)}</span> {level}
        </p>
        <p className="text-xs text-ink/60">{next}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Button
          size="sm"
          variant="success"
          onClick={() => play.mutate()}
          loading={play.isPending}
          disabled={friend.playsLeft === 0}
        >
          🤝 {t('friends.play')}
        </Button>
        <span className="text-[11px] text-ink/60">
          {friend.playsLeft > 0
            ? t('friends.playsLeft', { count: friend.playsLeft })
            : t('friends.tired')}
        </span>
      </div>
    </Card>
  );
}

const NEXT = {
  STRANGERS: 'ACQUAINTANCES',
  ACQUAINTANCES: 'BUDDIES',
  BUDDIES: 'FRIENDS',
  FRIENDS: 'BEST_FRIENDS',
  BEST_FRIENDS: 'BEST_FRIENDS',
} as const;
