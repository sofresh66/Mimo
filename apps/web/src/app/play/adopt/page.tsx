'use client';

import type { SpeciesView } from '@mimo/types';
import { Button, Card, Creature, Spinner, cx } from '@mimo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field } from '@/components/forms';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useSpecies } from '@/lib/queries';
import { playSound } from '@/lib/sound';

export default function AdoptPage() {
  const { t } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const { data: species, isPending } = useSpecies();
  const [selected, setSelected] = useState<SpeciesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const adopt = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      await http.post('/me/creature/adopt', { speciesId: selected.id, name });
      playSound('levelup');
      await client.invalidateQueries({ queryKey: keys.home });
      router.replace('/play');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (isPending || !species) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="text-center">
        <h1 className="font-display text-3xl font-bold">{t('adopt.title')}</h1>
        <p className="mt-1 text-ink/70">{t('adopt.subtitle')}</p>
      </header>

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="radiogroup"
        aria-label={t('adopt.title')}
      >
        {species.map((s, i) => (
          <motion.li
            key={s.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.06 * i }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected?.id === s.id}
              onClick={() => {
                playSound('pop');
                setSelected(s);
              }}
              className={cx(
                'flex w-full flex-col items-center rounded-3xl bg-white p-3 text-center ring-4 transition focus-visible:outline-none focus-visible:ring-primary/60',
                selected?.id === s.id ? 'ring-primary' : 'ring-transparent hover:-translate-y-1',
              )}
            >
              <Creature
                appearance={s.appearance}
                size={120}
                reaction={selected?.id === s.id ? 'happy' : 'idle'}
                reactionKey={selected?.id}
                label={s.name}
              />
              <span className="font-display text-lg font-bold">
                {s.emoji} {s.name}
              </span>
              <span className="text-xs text-ink/60">{s.description}</span>
            </button>
          </motion.li>
        ))}
      </ul>

      {selected && (
        <Card>
          <form onSubmit={adopt} className="flex flex-col gap-3">
            <Field
              label={t('adopt.nameTitle')}
              name="name"
              placeholder={t('adopt.namePlaceholder')}
              maxLength={20}
              required
              autoFocus
            />
            {error && (
              <p role="alert" className="font-semibold text-coral">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy}>
              🥚 {t('adopt.confirm')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
