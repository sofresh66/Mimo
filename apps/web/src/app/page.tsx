'use client';

import type { PlayerProfile } from '@mimo/types';
import { Avatar, Creature, Modal, PinPad, Spinner, buttonClassName } from '@mimo/ui';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useErrorMessage } from '@/lib/errors';
import { useProfiles } from '@/lib/queries';
import { useSession, useSessionActions } from '@/lib/session';
import { playSound } from '@/lib/sound';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Mimo';

const SHOWCASE = [
  { species: 'dragon', palette: { body: '#5ccf8f', belly: '#fff1c1', accent: '#ff8a5c' } },
  { species: 'fox', palette: { body: '#ff9a4d', belly: '#fff6ea', accent: '#7a4a2b' } },
  { species: 'dino', palette: { body: '#7cb7ff', belly: '#e6f3ff', accent: '#ffcd4d' } },
  { species: 'robot', palette: { body: '#b8c4d6', belly: '#eef3fa', accent: '#26c6da' } },
  { species: 'spirit', palette: { body: '#c59bff', belly: '#f6edff', accent: '#ffd6f5' } },
] as const;

export default function WelcomePage() {
  const { me, loading } = useSession();
  const router = useRouter();

  // Un adulte joueur n'a pas d'écran « Qui joue ? » : il entre directement dans le jeu.
  const player = me?.mode === 'PLAYER';
  useEffect(() => {
    if (me && !me.family) router.replace('/setup');
    else if (player) router.replace('/play');
  }, [me, player, router]);

  if (loading) {
    return (
      <main id="main" className="kid-bg grid min-h-dvh place-items-center">
        <Spinner size={40} label="…" />
      </main>
    );
  }
  if (!me) return <Landing />;
  if (!me.family || player) return null;
  return <WhoPlays familyName={me.family.name} parentMode={me.mode === 'PARENT'} />;
}

function Landing() {
  const { t } = useI18n();
  return (
    <main
      id="main"
      className="kid-bg flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10 text-center"
    >
      <motion.h1
        className="font-display text-4xl font-bold text-ink sm:text-5xl"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        {t('welcome.title', { app: APP_NAME })}
      </motion.h1>
      <p className="max-w-md text-lg text-ink/70">{t('welcome.tagline')}</p>
      <div className="flex max-w-full flex-wrap items-end justify-center gap-1" aria-hidden="true">
        {SHOWCASE.map((s, i) => (
          <motion.div
            key={s.species}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 * i, type: 'spring' }}
          >
            <Creature
              appearance={{
                species: s.species,
                stage: 'BABY',
                palette: s.palette,
                feature: 'none',
                aura: null,
              }}
              size={i === 2 ? 110 : 84}
              label={s.species}
            />
          </motion.div>
        ))}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/login" className={buttonClassName({ size: 'lg', block: true })}>
          {t('welcome.login')}
        </Link>
        <Link
          href="/register"
          className={buttonClassName({ size: 'lg', variant: 'secondary', block: true })}
        >
          {t('welcome.register')}
        </Link>
      </div>
      <p className="max-w-sm text-sm text-ink/60">{t('auth.privacyNote')}</p>
    </main>
  );
}

type Target = { kind: 'child'; profile: PlayerProfile } | { kind: 'parent' };

function WhoPlays({ familyName, parentMode }: { familyName: string; parentMode: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { data: all, isPending } = useProfiles();
  // Seuls les enfants se sélectionnent ici (un adulte joueur se connecte avec son compte).
  const profiles = all?.filter((p) => p.type === 'CHILD');
  const { unlockChild, unlockParent } = useSessionActions();
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const open = (next: Target) => {
    playSound('pop');
    if (next.kind === 'parent' && parentMode) {
      router.push('/parent');
      return;
    }
    setError(null);
    setTarget(next);
  };

  const submit = async (pin: string) => {
    if (!target) return;
    setBusy(true);
    try {
      if (target.kind === 'child') {
        await unlockChild(target.profile.id, pin);
        playSound('success');
        router.push(target.profile.creature ? '/play' : '/play/adopt');
      } else {
        await unlockParent(pin);
        router.push('/parent');
      }
    } catch (e) {
      playSound('error');
      setError(errorMessage(e));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="kid-bg flex min-h-dvh flex-col items-center px-4 py-10">
      <h1 className="text-center font-display text-3xl font-bold text-ink sm:text-4xl">
        {t('welcome.title', { app: APP_NAME })}
      </h1>
      <p className="mt-6 font-display text-2xl font-semibold text-ink/80">
        {t('welcome.whoPlays')}
      </p>

      {isPending ? (
        <Spinner size={36} />
      ) : (
        <ul className="mt-6 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
          {profiles?.map((p, i) => (
            <motion.li
              key={p.id}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200, damping: 18 }}
            >
              <button
                type="button"
                onClick={() => open({ kind: 'child', profile: p })}
                className="group flex w-full flex-col items-center gap-2 rounded-[28px] bg-white p-4 shadow-[0_8px_0_0_rgba(45,42,62,0.08)] ring-4 ring-transparent transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-primary/50"
                style={{ borderTop: `8px solid ${p.color}` }}
              >
                {p.creature ? (
                  <Creature appearance={p.creature.appearance} size={110} label={p.creature.name} />
                ) : (
                  <div className="grid h-[121px] place-items-center text-6xl" aria-hidden="true">
                    🥚
                  </div>
                )}
                <span className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                  <Avatar emoji={p.avatar} color={p.color} size={34} />
                  {p.displayName}
                </span>
                <span className="text-sm text-ink/60">
                  {p.creature
                    ? `${p.creature.name} · ${t('common.level', { level: p.creature.level })}`
                    : t('welcome.eggWaiting')}
                </span>
              </button>
            </motion.li>
          ))}
          <motion.li
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08 * (profiles?.length ?? 0) }}
          >
            <button
              type="button"
              onClick={() => open({ kind: 'parent' })}
              className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-3 rounded-[28px] border-4 border-dashed border-ink/15 bg-white/60 p-4 font-display text-lg font-bold text-ink/70 transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
            >
              <span className="text-5xl" aria-hidden="true">
                🔐
              </span>
              {t('welcome.parentSpace')}
            </button>
          </motion.li>
        </ul>
      )}

      {profiles?.length === 0 && (
        <p className="mt-6 max-w-sm text-center text-ink/70">
          {t('welcome.noChildren')} — {t('welcome.noChildrenHint')}
        </p>
      )}
      <p className="mt-10 text-center text-sm text-ink/50">
        {t('welcome.deviceExplanation', { family: familyName })}
      </p>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={
          target?.kind === 'child'
            ? t('welcome.enterPin', { name: target.profile.displayName })
            : t('welcome.parentPin')
        }
        size="sm"
      >
        <div className="py-2">
          <PinPad
            onComplete={submit}
            error={error}
            disabled={busy}
            resetKey={attempt}
            label={t('welcome.parentPin')}
            deleteLabel={t('common.delete')}
          />
        </div>
      </Modal>
    </main>
  );
}
