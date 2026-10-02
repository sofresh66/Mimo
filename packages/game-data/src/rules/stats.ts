/**
 * Statistiques de bien-être de la créature.
 *
 * Principe de design bienveillant : les statistiques ne descendent jamais vers un état
 * « malade » ou « triste ». Avec le temps elles reviennent doucement vers un état calme
 * (ligne de base) : l'énergie se recharge toujours toute seule, et un bonheur bas remonte.
 */
export interface CreatureStats {
  happiness: number;
  energy: number;
  curiosity: number;
}

export const STAT_MIN = 0;
export const STAT_MAX = 100;

/** Valeurs vers lesquelles les statistiques reviennent avec le temps. */
export const STAT_BASELINE: CreatureStats = { happiness: 60, energy: 100, curiosity: 50 };
/** Vitesse de retour vers la ligne de base, en points par heure. */
export const STAT_DRIFT_PER_HOUR: CreatureStats = { happiness: 3, energy: 12, curiosity: 2 };
/** Le bonheur ne descend jamais sous ce plancher. */
export const HAPPINESS_FLOOR = 35;

export function clampStat(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

function driftTowards(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return value;
}

/** Applique l'évolution naturelle des statistiques sur une durée écoulée. */
export function applyTimeDrift(stats: CreatureStats, elapsedMs: number): CreatureStats {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  if (hours === 0) return { ...stats };
  const drift = (key: keyof CreatureStats) =>
    clampStat(driftTowards(stats[key], STAT_BASELINE[key], STAT_DRIFT_PER_HOUR[key] * hours));
  return {
    happiness: Math.max(HAPPINESS_FLOOR, drift('happiness')),
    energy: drift('energy'),
    curiosity: drift('curiosity'),
  };
}

export function applyDelta(stats: CreatureStats, delta: Partial<CreatureStats>): CreatureStats {
  return {
    happiness: Math.max(HAPPINESS_FLOOR, clampStat(stats.happiness + (delta.happiness ?? 0))),
    energy: clampStat(stats.energy + (delta.energy ?? 0)),
    curiosity: clampStat(stats.curiosity + (delta.curiosity ?? 0)),
  };
}

export type Mood = 'radiant' | 'happy' | 'calm' | 'sleepy' | 'curious';

/** Humeur affichée : toujours positive ou neutre, jamais triste ni malade. */
export function moodOf(stats: CreatureStats): Mood {
  if (stats.energy < 20) return 'sleepy';
  if (stats.happiness >= 85) return 'radiant';
  if (stats.curiosity >= 75) return 'curious';
  if (stats.happiness >= 65) return 'happy';
  return 'calm';
}
