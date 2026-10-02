'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';

const COLORS = ['#7c5cff', '#ff8a5c', '#4cc283', '#3fb6e8', '#ffc145', '#ff7aa2'];

/** Pluie de confettis décorative (désactivée si l'utilisateur préfère moins d'animations). */
export function Confetti({ count = 36 }: { count?: number }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: (i * 97) % 100,
        delay: (i % 12) * 0.05,
        duration: 1.6 + ((i * 37) % 10) / 10,
        rotate: (i * 53) % 360,
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 4) * 2,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: 520, rotate: p.rotate + 360, opacity: 0 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
