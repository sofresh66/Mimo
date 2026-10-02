'use client';

import type { VillageView } from '@mimo/types';
import { Creature } from '@mimo/ui';
import { motion } from 'motion/react';
import { useI18n } from '@/i18n';

/** Représentation 2D simple du village familial (partagée enfant / parent). */
export function VillageMap({ village }: { village: VillageView }) {
  const { t } = useI18n();
  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] shadow-inner ring-1 ring-ink/10"
      style={{
        background: 'linear-gradient(180deg, #bfe9ff 0%, #dff6ff 38%, #b9e7a5 38.5%, #93d483 100%)',
      }}
      role="img"
      aria-label={`${village.name} — ${t('village.points', { count: village.points })}`}
    >
      <span className="absolute left-[8%] top-[8%] text-4xl opacity-90" aria-hidden="true">
        ☁️
      </span>
      <span className="absolute right-[12%] top-[14%] text-3xl opacity-80" aria-hidden="true">
        ☁️
      </span>
      <span className="absolute right-[6%] top-[4%] text-4xl" aria-hidden="true">
        ☀️
      </span>
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 75"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 60 Q30 50 50 58 T100 52"
          stroke="#f3dfb0"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      {village.buildings.map((b, i) => (
        <motion.div
          key={b.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: `${b.position.x}%`, top: `${b.position.y}%` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.05 * i, type: 'spring' }}
          aria-hidden="true"
        >
          {b.unlocked ? (
            <span className="block text-4xl drop-shadow sm:text-5xl">{b.emoji}</span>
          ) : (
            <span className="block text-3xl opacity-30 grayscale sm:text-4xl">🚧</span>
          )}
        </motion.div>
      ))}
      <div className="absolute bottom-[4%] left-0 right-0 flex justify-center gap-1">
        {village.companions.map(({ creature }) => (
          <Creature
            key={creature.id}
            appearance={creature.appearance}
            size={56}
            label={creature.name}
          />
        ))}
      </div>
    </div>
  );
}
