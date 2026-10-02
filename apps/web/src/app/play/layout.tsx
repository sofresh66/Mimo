'use client';

import { Avatar, Spinner, cx } from '@mimo/ui';
import type { ExplorationView } from '@mimo/types';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { CelebrationProvider, useCelebrations } from '@/components/Celebrations';
import { useToast } from '@/components/Toast';
import { useI18n, type MessageKey } from '@/i18n';
import { http } from '@/lib/api';
import { keys, useHome } from '@/lib/queries';
import { useRealtimeEvent, useRealtimeStatus } from '@/lib/realtime';
import { useSession, useSessionActions } from '@/lib/session';
import { playSound, setSoundEnabled, useSoundEnabled } from '@/lib/sound';

const NAV: Array<{ href: string; label: MessageKey; emoji: string }> = [
  { href: '/play', label: 'child.home', emoji: '🏠' },
  { href: '/play/missions', label: 'child.missions', emoji: '📋' },
  { href: '/play/explore', label: 'child.explore', emoji: '🧭' },
  { href: '/play/inventory', label: 'child.inventory', emoji: '🎒' },
  { href: '/play/village', label: 'child.village', emoji: '🏡' },
];

export default function PlayLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const ready = (me?.mode === 'CHILD' || me?.mode === 'PLAYER') && me.child;

  useEffect(() => {
    if (!loading && !ready) router.replace('/');
  }, [loading, ready, router]);

  if (!ready) {
    return (
      <main className="kid-bg grid min-h-dvh place-items-center">
        <Spinner size={40} />
      </main>
    );
  }
  return (
    <CelebrationProvider>
      <ChildShell>{children}</ChildShell>
    </CelebrationProvider>
  );
}

function ChildShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { me } = useSession();
  const { lock, logout } = useSessionActions();
  const router = useRouter();
  const pathname = usePathname();
  const { data: home } = useHome();
  const status = useRealtimeStatus();
  const sound = useSoundEnabled();
  useRealtimeBridge(home?.unseenExploration ?? null);

  // Pas encore de compagnon : direction l'adoption.
  useEffect(() => {
    if (home && !home.creature && pathname !== '/play/adopt') router.replace('/play/adopt');
  }, [home, pathname, router]);

  const child = me?.child;
  if (!child) return null;
  // Adulte joueur : pas d'écran « Qui joue ? », il se déconnecte de son propre compte.
  const adult = me?.mode === 'PLAYER';
  const leaveLabel = adult ? t('child.logout') : t('child.switchProfile');

  return (
    <div className="kid-bg flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-30 border-b border-ink/5 bg-cream/85 px-3 pb-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link
            href="/play"
            className="flex min-w-0 items-center gap-2 rounded-full pr-2 focus-visible:outline-4 focus-visible:outline-primary/50"
          >
            <Avatar emoji={child.avatar} color={child.color} size={40} />
            <span className="truncate font-display text-lg font-bold">{child.displayName}</span>
          </Link>
          <span className="flex-1" />
          {status === 'reconnecting' && (
            <span className="text-xs font-semibold text-ink/50" role="status">
              {t('common.reconnecting')}
            </span>
          )}
          <span
            className="rounded-full bg-white px-3 py-1 font-display font-bold text-ink shadow-sm"
            aria-label={t('common.coins', { count: home?.coins ?? 0 })}
          >
            💰 {home?.coins ?? 0}
          </span>
          <Link
            href="/play/gifts"
            className="relative grid size-11 place-items-center rounded-full bg-white text-xl shadow-sm"
            aria-label={t('child.gifts')}
          >
            🎁
            {home && home.pendingRewards > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-xs font-bold text-white">
                {home.pendingRewards}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-white text-xl shadow-sm"
            aria-pressed={sound}
            aria-label={sound ? t('common.soundOn') : t('common.soundOff')}
            onClick={() => {
              setSoundEnabled(!sound);
              if (!sound) playSound('pop');
            }}
          >
            {sound ? '🔊' : '🔇'}
          </button>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-white text-xl shadow-sm"
            aria-label={leaveLabel}
            title={leaveLabel}
            onClick={async () => {
              if (adult) await logout();
              else await lock();
              router.push('/');
            }}
          >
            👋
          </button>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {children}
      </main>

      <nav
        aria-label="Navigation"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-ink/5 bg-white/95 px-2 pt-2 backdrop-blur"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
          {NAV.map((item) => {
            const active =
              item.href === '/play' ? pathname === '/play' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold transition',
                    active ? 'bg-primary/10 text-primary' : 'text-ink/60 hover:bg-ink/5',
                  )}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {item.emoji}
                  </span>
                  {t(item.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Réagit aux événements temps réel : célébrations et mise à jour des données. */
function useRealtimeBridge(unseenExploration: ExplorationView | null) {
  const client = useQueryClient();
  const { celebrate, celebrateOutcome } = useCelebrations();
  const toast = useToast();
  const { t } = useI18n();
  const celebrated = useRef(new Set<string>());
  const refresh = (...list: ReadonlyArray<readonly unknown[]>) =>
    list.forEach((queryKey) => void client.invalidateQueries({ queryKey }));

  /** Célèbre un retour d'exploration une seule fois (événement temps réel ou lecture de l'accueil). */
  const celebrateReturn = useCallback(
    (exploration: ExplorationView) => {
      if (celebrated.current.has(exploration.id)) return;
      celebrated.current.add(exploration.id);
      celebrate({ kind: 'exploration', exploration });
      void http
        .post(`/me/explorations/${exploration.id}/seen`)
        .then(() => client.invalidateQueries({ queryKey: keys.home }))
        .catch(() => undefined);
    },
    [celebrate, client],
  );

  // Filet de sécurité : retour constaté sans événement (socket coupé, application rouverte…).
  useEffect(() => {
    if (unseenExploration) celebrateReturn(unseenExploration);
  }, [unseenExploration, celebrateReturn]);

  useRealtimeEvent('mission:validated', (payload) => {
    refresh(keys.home, keys.missions, keys.inventory, keys.rewards, keys.dex, keys.village);
    celebrate({ kind: 'mission', payload });
    celebrateOutcome(payload.outcome);
  });
  useRealtimeEvent('missions:changed', () => refresh(keys.missions, keys.home));
  useRealtimeEvent('exploration:completed', (exploration) => {
    refresh(keys.explorations, keys.inventory, keys.zones, keys.dex, keys.village);
    celebrateReturn(exploration);
  });
  useRealtimeEvent('reward:received', () => {
    playSound('coin');
    toast(t('celebrate.gift'), 'success');
    refresh(keys.rewards, keys.home);
  });
  useRealtimeEvent('creature:updated', () => refresh(keys.home, keys.creatures));
  useRealtimeEvent('village:updated', () => refresh(keys.village));
  useRealtimeEvent('family-mission:completed', ({ title, rewardPoints }) =>
    celebrate({ kind: 'family', title, points: rewardPoints }),
  );
}
