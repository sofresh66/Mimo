export const MAX_LEVEL = 50;

/** XP nécessaire pour passer du niveau `level` au niveau suivant. */
export function xpToNextLevel(level: number): number {
  return 40 + 20 * (Math.max(1, level) - 1);
}

/** XP totale nécessaire pour atteindre `level` depuis le niveau 1. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l += 1) total += xpToNextLevel(l);
  return total;
}

export function levelFromTotalXp(totalXp: number): number {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (level < MAX_LEVEL && remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level += 1;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** Avancement dans le niveau courant, entre 0 et 1. */
  ratio: number;
  isMaxLevel: boolean;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelFromTotalXp(totalXp);
  const isMaxLevel = level >= MAX_LEVEL;
  const xpIntoLevel = Math.max(0, totalXp) - totalXpForLevel(level);
  const xpForNextLevel = xpToNextLevel(level);
  return {
    level,
    xpIntoLevel: isMaxLevel ? xpForNextLevel : xpIntoLevel,
    xpForNextLevel,
    ratio: isMaxLevel ? 1 : Math.min(1, xpIntoLevel / xpForNextLevel),
    isMaxLevel,
  };
}
