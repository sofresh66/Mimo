'use client';

import type { DexEntryView } from '@mimo/types';
import { Card, Creature, Modal, ProgressBar, Spinner } from '@mimo/ui';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useI18n } from '@/i18n';
import { useDex } from '@/lib/queries';

const SPECIES_ORDER = ['dragon', 'fox', 'dino', 'robot', 'spirit'];
const SPECIES_EMOJI: Record<string, string> = {
  dragon: '🐉',
  fox: '🦊',
  dino: '🦖',
  robot: '🤖',
  spirit: '✨',
};

export default function CollectionPage() {
  const { t } = useI18n();
  const { data: dex, isPending } = useDex();
  const [open, setOpen] = useState<DexEntryView | null>(null);

  if (isPending || !dex) return <Spinner size={36} />;
  const bySpecies = SPECIES_ORDER.map((s) => ({
    species: s,
    entries: dex.entries.filter((e) => e.speciesId === s),
  }));

  return (
    <div>
      <PageHeader title={t('collection.title')} subtitle={t('collection.familyNote')} emoji="📚" />
      <Card className="mb-5">
        <ProgressBar
          label={t('collection.discovered', { count: dex.discovered, total: dex.total })}
          value={dex.discovered}
          max={dex.total}
          valueText={`${dex.discovered} / ${dex.total}`}
          color="linear-gradient(90deg, #a06cd5, #ff7aa2)"
          size="lg"
        />
      </Card>
      {bySpecies.map(({ species, entries }) => (
        <section key={species} className="mb-6">
          <h2 className="mb-2 font-display text-lg font-bold">
            <span aria-hidden="true">{SPECIES_EMOJI[species]}</span>{' '}
            {entries.filter((e) => e.discovered).length} / {entries.length}
          </h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className="flex w-full flex-col items-center rounded-2xl bg-white p-2 text-center shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-primary/50"
                  aria-label={e.discovered ? (e.name ?? '') : t('collection.unknown')}
                >
                  {e.discovered && e.appearance ? (
                    <Creature
                      appearance={e.appearance}
                      size={84}
                      animated={false}
                      label={e.name ?? ''}
                    />
                  ) : (
                    <span
                      className="grid h-[92px] place-items-center font-display text-3xl font-bold text-ink/25"
                      aria-hidden="true"
                    >
                      ???
                    </span>
                  )}
                  <span className="line-clamp-2 text-xs font-semibold text-ink/70">
                    {e.discovered ? e.name : t(`stages.${e.stage}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.discovered ? (open.name ?? '') : t('collection.unknown')}
        size="sm"
      >
        {open && (
          <div className="flex flex-col items-center gap-2 text-center">
            {open.discovered && open.appearance ? (
              <Creature appearance={open.appearance} size={180} label={open.name ?? ''} />
            ) : (
              <span className="text-7xl" aria-hidden="true">
                ❔
              </span>
            )}
            <p className="font-semibold text-primary">{t(`stages.${open.stage}`)}</p>
            {open.description && <p className="text-ink/75">{open.description}</p>}
            {!open.discovered && open.hint && (
              <p className="rounded-2xl bg-sun/20 p-3 text-ink/80">
                💡 {t('collection.hint')} : {open.hint}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
