import type { Rarity } from '../types';

/**
 * Niveaux d'amitié entre deux créatures. Les seuils sont des points cumulés ; une fois un
 * niveau atteint, il n'est jamais perdu (les chamailleries ne descendent pas sous son seuil).
 */
export const FRIENDSHIP_LEVELS = [
  { key: 'STRANGERS', min: 0, hearts: 0 },
  { key: 'ACQUAINTANCES', min: 10, hearts: 1 },
  { key: 'BUDDIES', min: 30, hearts: 2 },
  { key: 'FRIENDS', min: 60, hearts: 3 },
  { key: 'BEST_FRIENDS', min: 100, hearts: 4 },
] as const;
export type FriendshipLevelKey = (typeof FRIENDSHIP_LEVELS)[number]['key'];

/** Points maximum : au-delà, l'amitié est déjà au plus haut. */
export const FRIENDSHIP_MAX_POINTS = 150;

/** Niveau (index de FRIENDSHIP_LEVELS) correspondant à un nombre de points. */
export function friendshipLevel(points: number): number {
  let level = 0;
  FRIENDSHIP_LEVELS.forEach((l, i) => {
    if (points >= l.min) level = i;
  });
  return level;
}

export interface FriendshipState {
  points: number;
  /** Plus haut niveau jamais atteint (plancher non punitif). */
  bestLevel: number;
}

export interface FriendshipChange extends FriendshipState {
  level: number;
  /** Niveaux nouvellement atteints (pour les récompenses), du plus bas au plus haut. */
  reachedLevels: number[];
}

/**
 * Applique une variation. Une baisse ne fait jamais repasser sous le seuil du meilleur niveau
 * atteint ; une hausse peut franchir plusieurs niveaux d'un coup.
 */
export function applyFriendshipDelta(state: FriendshipState, delta: number): FriendshipChange {
  const best = Math.max(0, Math.min(state.bestLevel, FRIENDSHIP_LEVELS.length - 1));
  const floor = FRIENDSHIP_LEVELS[best]?.min ?? 0;
  const points = Math.max(floor, Math.min(FRIENDSHIP_MAX_POINTS, state.points + delta));
  const level = friendshipLevel(points);
  const bestLevel = Math.max(best, level);
  const reachedLevels: number[] = [];
  for (let l = best + 1; l <= bestLevel; l += 1) reachedLevels.push(l);
  return { points, bestLevel, level: Math.max(level, best), reachedLevels };
}

/** Points restants avant le niveau suivant (null au niveau maximum). */
export function pointsToNextLevel(points: number): number | null {
  const next = FRIENDSHIP_LEVELS[friendshipLevel(points) + 1];
  return next ? next.min - points : null;
}

/** Compensation en pièces quand un objet unique déjà possédé est obtenu à nouveau. */
export const UNIQUE_DUPLICATE_COINS: Record<Rarity, number> = {
  COMMON: 10,
  RARE: 25,
  EPIC: 50,
  LEGENDARY: 100,
};
