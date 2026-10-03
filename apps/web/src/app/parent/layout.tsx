'use client';

import { Spinner, cx } from '@mimo/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useToast } from '@/components/Toast';
import { useI18n, type MessageKey } from '@/i18n';
import { keys } from '@/lib/queries';
import { useRealtimeEvent } from '@/lib/realtime';
import { useSession, useSessionActions } from '@/lib/session';

const NAV: Array<{ href: string; label: MessageKey; icon: string }> = [
  { href: '/parent', label: 'parent.nav.dashboard', icon: '📊' },
  { href: '/parent/missions', label: 'parent.nav.missions', icon: '📋' },
  { href: '/parent/children', label: 'parent.nav.children', icon: '👧' },
  { href: '/parent/rewards', label: 'parent.nav.rewards', icon: '🎁' },
  { href: '/parent/history', label: 'parent.nav.history', icon: '🕒' },
  { href: '/parent/settings', label: 'parent.nav.settings', icon: '⚙️' },
];

export default function ParentLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();

  // Vrai si l'espace parent a été ouvert (PIN) pendant cette visite : un verrouillage ou une
  // expiration ramène simplement à « Qui joue ? », sans réafficher le pavé PIN.
  const wasUnlocked = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (me?.mode === 'PARENT') wasUnlocked.current = true;
    if (!me) router.replace('/login');
    else if (!me.family) router.replace('/setup');
    // Accès direct sans déverrouillage : retour à « Qui joue ? », pavé PIN ouvert.
    else if (me.mode !== 'PARENT') {
      router.replace(me.mode === 'PLAYER' ? '/play' : wasUnlocked.current ? '/' : '/?parent=1');
    }
  }, [loading, me, router]);

  if (!me || me.mode !== 'PARENT' || !me.family) {
    return (
      <main className="parent-bg grid min-h-dvh place-items-center">
        <Spinner size={36} />
      </main>
    );
  }
  return (
    <ParentShell familyName={me.family.name} expiresAt={me.parentModeExpiresAt}>
      {children}
    </ParentShell>
  );
}

function ParentShell({
  children,
  familyName,
  expiresAt,
}: {
  children: ReactNode;
  familyName: string;
  expiresAt: string | null;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { lock, logout, reload } = useSessionActions();
  const [loggingOut, setLoggingOut] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
  const minutes = useMinutesLeft(expiresAt);

  useEffect(() => {
    // L'espace parent expire : on revient à « Qui joue ? ».
    if (minutes !== null && minutes <= 0) void reload().then(() => router.replace('/'));
  }, [minutes, reload, router]);

  useRealtimeEvent('mission:requested', (pending) => {
    toast(
      `${pending.child.avatar} ${pending.child.displayName} : ${pending.mission.title}`,
      'info',
    );
    void client.invalidateQueries({ queryKey: keys.parent.pending });
    void client.invalidateQueries({ queryKey: keys.parent.dashboard });
  });
  useRealtimeEvent('security:pin-locked', ({ target, name }) =>
    toast(
      target === 'parent'
        ? t('parent.pinLockedParent')
        : t('parent.pinLockedChild', { name: name ?? '' }),
      'error',
    ),
  );
  useRealtimeEvent('missions:changed', () => {
    void client.invalidateQueries({ queryKey: keys.parent.pending });
    void client.invalidateQueries({ queryKey: keys.parent.dashboard });
  });

  return (
    <div className="parent-bg min-h-dvh text-slate-900">
      <header className="safe-top sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-2">
          <Link href="/parent" className="font-display text-xl font-bold text-primary">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'Mimo'}
          </Link>
          <span className="hidden text-sm text-slate-500 sm:inline">
            {t('parent.title')} · {familyName}
          </span>
          <span className="flex-1" />
          {minutes !== null && (
            <span className="hidden text-xs text-slate-500 md:inline" title={t('parent.lockHint')}>
              {t('parent.expiresIn', { minutes: Math.max(0, minutes) })}
            </span>
          )}
          <button
            type="button"
            onClick={async () => {
              await lock();
              router.push('/');
            }}
            className="min-h-10 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-4 focus-visible:outline-primary/50"
          >
            🔒 {t('parent.nav.lock')}
          </button>
          <button
            type="button"
            disabled={loggingOut}
            onClick={async () => {
              // Déconnexion réelle : session révoquée et cookies effacés côté serveur.
              setLoggingOut(true);
              await logout();
              router.replace('/login');
            }}
            className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-4 focus-visible:outline-primary/50 disabled:opacity-60"
          >
            {t('parent.nav.logout')}
          </button>
        </div>
        <nav
          aria-label={t('parent.title')}
          className="mx-auto max-w-6xl overflow-x-auto px-2 [scrollbar-width:none]"
        >
          <ul className="flex w-max gap-1 pb-2">
            {NAV.map((item) => {
              const active =
                item.href === '/parent' ? pathname === '/parent' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition',
                      active ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

function useMinutesLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 60_000);
}
