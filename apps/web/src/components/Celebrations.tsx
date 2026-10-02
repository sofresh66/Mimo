'use client';

import type {
  ChildHome,
  ExplorationView,
  LootView,
  MissionValidatedPayload,
  ProgressOutcome,
} from '@mimo/types';
import { Button, Creature, RewardCard } from '@mimo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { equipmentEmojis } from '@/lib/creature';
import { playSound } from '@/lib/sound';
import { Confetti } from './Confetti';

export type Celebration =
  | { kind: 'mission'; payload: MissionValidatedPayload }
  | { kind: 'levelup'; level: number }
  | { kind: 'hatch'; formName: string }
  | { kind: 'evolution'; formName: string }
  | { kind: 'loot'; title: string; subtitle?: string; loot: LootView; xp?: number | null }
  | { kind: 'exploration'; exploration: ExplorationView }
  | { kind: 'family'; title: string; points: number };

interface CelebrationApi {
  celebrate: (item: Celebration) => void;
  /** Ajoute les célébrations liées à un gain d'XP (niveau, éclosion, évolution). */
  celebrateOutcome: (outcome: ProgressOutcome | null | undefined) => void;
}

const CelebrationContext = createContext<CelebrationApi>({
  celebrate: () => undefined,
  celebrateOutcome: () => undefined,
});

export function useCelebrations(): CelebrationApi {
  return useContext(CelebrationContext);
}

export function outcomeCelebrations(outcome: ProgressOutcome | null | undefined): Celebration[] {
  if (!outcome) return [];
  const list: Celebration[] = [];
  if (outcome.leveledUp) list.push({ kind: 'levelup', level: outcome.levelAfter });
  if (outcome.hatched && outcome.evolution)
    list.push({ kind: 'hatch', formName: outcome.evolution.toName });
  else if (outcome.evolution) list.push({ kind: 'evolution', formName: outcome.evolution.toName });
  return list;
}

/** File de célébrations affichées une par une, par-dessus l'interface enfant. */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const celebrate = useCallback((item: Celebration) => setQueue((q) => [...q, item]), []);
  const celebrateOutcome = useCallback(
    (outcome: ProgressOutcome | null | undefined) =>
      setQueue((q) => [...q, ...outcomeCelebrations(outcome)]),
    [],
  );
  const api = useMemo(() => ({ celebrate, celebrateOutcome }), [celebrate, celebrateOutcome]);
  const current = queue[0];
  return (
    <CelebrationContext.Provider value={api}>
      {children}
      <CelebrationOverlay item={current} onDone={() => setQueue((q) => q.slice(1))} />
    </CelebrationContext.Provider>
  );
}

function CelebrationOverlay({
  item,
  onDone,
}: {
  item: Celebration | undefined;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const home = client.getQueryData<ChildHome>(['home']);
  const creature = home?.creature;

  useEffect(() => {
    if (!item) return;
    playSound(
      item.kind === 'levelup' || item.kind === 'evolution' || item.kind === 'hatch'
        ? 'levelup'
        : 'success',
    );
  }, [item]);

  if (typeof document === 'undefined') return null;

  const content = (() => {
    if (!item) return null;
    switch (item.kind) {
      case 'mission':
        return {
          emoji: item.payload.missionIcon,
          title: t('celebrate.missionTitle'),
          text: t('celebrate.missionValidated', {
            parent: item.payload.parentName,
            mission: item.payload.missionTitle,
          }),
          big: `+${item.payload.xp} XP`,
          extra:
            item.payload.coins > 0
              ? t('celebrate.coinsEarned', { count: item.payload.coins })
              : null,
        };
      case 'levelup':
        return {
          creature: true,
          title: t('celebrate.levelUp', { level: item.level }),
          text: creature ? t('celebrate.levelUpText', { name: creature.name }) : '',
        };
      case 'hatch':
        return {
          creature: true,
          title: t('celebrate.hatched'),
          text: t('celebrate.hatchedText', { form: item.formName }),
        };
      case 'evolution':
        return {
          creature: true,
          title: t('celebrate.evolution'),
          text: t('celebrate.evolutionText', { name: creature?.name ?? '', form: item.formName }),
        };
      case 'loot':
        return {
          emoji: '🎁',
          title: item.title,
          text: item.subtitle ?? '',
          loot: item.loot,
          big: item.xp ? `+${item.xp} XP` : null,
        };
      case 'exploration':
        return {
          emoji: item.exploration.zone.emoji,
          title: t('child.isBack', { name: item.exploration.creatureName }),
          text: t('celebrate.explorationBack', {
            name: item.exploration.creatureName,
            zone: item.exploration.zone.name,
          }),
          loot: item.exploration.rewards ?? undefined,
          big: item.exploration.xp ? `+${item.exploration.xp} XP` : null,
        };
      case 'family':
        return {
          emoji: '🏡',
          title: t('celebrate.familyMission'),
          text: t('celebrate.familyMissionText', { title: item.title, points: item.points }),
        };
    }
  })();

  return createPortal(
    <AnimatePresence mode="wait">
      {item && content && (
        <motion.div
          key={JSON.stringify(item).slice(0, 200)}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="celebration-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Confetti />
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-[32px] bg-white p-6 text-center shadow-2xl"
            initial={{ scale: 0.6, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 18 }}
          >
            {'creature' in content && content.creature && creature ? (
              <div className="flex justify-center">
                <Creature
                  appearance={creature.appearance}
                  equipment={equipmentEmojis(creature.equipment)}
                  mood="radiant"
                  reaction="levelup"
                  reactionKey={JSON.stringify(item)}
                  size={180}
                  label={`${creature.name}, ${creature.formName}`}
                />
              </div>
            ) : (
              <motion.div
                className="text-7xl"
                aria-hidden="true"
                initial={{ rotate: -20, scale: 0.3 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12 }}
              >
                {'emoji' in content ? content.emoji : '⭐'}
              </motion.div>
            )}
            <h2 id="celebration-title" className="mt-3 font-display text-3xl font-bold text-ink">
              {content.title}
            </h2>
            {content.text && <p className="mt-2 text-lg text-ink/75">{content.text}</p>}
            {'big' in content && content.big && (
              <motion.p
                className="mt-3 font-display text-4xl font-bold text-primary"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                {content.big}
              </motion.p>
            )}
            {'extra' in content && content.extra && (
              <p className="mt-1 font-semibold text-sun">💰 {content.extra}</p>
            )}
            {'loot' in content && content.loot && <LootGrid loot={content.loot} />}
            <Button size="lg" block className="mt-6" onClick={onDone} autoFocus>
              {t('celebrate.awesome')}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function LootGrid({ loot }: { loot: LootView }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {loot.coins > 0 && <RewardCard emoji="💰" title={t('common.coins', { count: loot.coins })} />}
      {loot.items.map(({ item, quantity }, i) => (
        <RewardCard
          key={item.id}
          emoji={item.emoji}
          title={item.name}
          rarity={item.rarity}
          rarityLabel={t(`rarities.${item.rarity}`)}
          quantity={quantity}
          delay={0.15 * (i + 1)}
        />
      ))}
    </div>
  );
}
