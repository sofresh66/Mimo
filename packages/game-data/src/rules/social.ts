import type { SocialEventDefinition } from '../types';
import { pickWeighted, type Rng } from './rng';

/** Une interaction hors connexion toutes les 4 heures environ. */
export const SOCIAL_TICK_HOURS = 4;
/** Au retour, au plus 3 interactions générées d'un coup (pas d'avalanche). */
export const SOCIAL_MAX_CATCH_UP = 3;
/** Une chamaillerie au plus par semaine et par couple de créatures. */
export const SQUABBLE_COOLDOWN_DAYS = 7;
/** « Jouer ensemble » à l'initiative du joueur : 3 fois par jour et par couple. */
export const SOCIAL_DAILY_PLAYS = 3;

const HOUR = 3_600_000;

/**
 * Nombre d'interactions à générer depuis le dernier passage. Un profil qui n'en a jamais eu
 * (ancienne sauvegarde) reçoit une première interaction, sans rattrapage.
 */
export function socialTicksDue(last: Date | null, now: Date): number {
  if (!last) return 1;
  const elapsed = now.getTime() - last.getTime();
  if (elapsed <= 0) return 0;
  return Math.min(SOCIAL_MAX_CATCH_UP, Math.floor(elapsed / (SOCIAL_TICK_HOURS * HOUR)));
}

/**
 * Horodatages répartis sur la période d'absence (le plus récent en dernier), toujours
 * strictement postérieurs à `last` et au plus égaux à `now`.
 */
export function socialTickTimes(last: Date | null, now: Date, count: number): Date[] {
  if (count <= 0) return [];
  const start = Math.min(last ? last.getTime() : now.getTime(), now.getTime());
  const span = now.getTime() - start;
  return Array.from({ length: count }, (_, i) => {
    const at = start + Math.round((span * (i + 1)) / count);
    return new Date(Math.min(now.getTime(), Math.max(at, start + 1)));
  });
}

export interface SocialContext {
  /** Niveau d'amitié actuel du couple. */
  level: number;
  /** Étiquettes des objets placés chez l'hôte. */
  hostTags: ReadonlySet<string>;
  /** Une chamaillerie attend une réconciliation. */
  needsReconcile: boolean;
  /** Une chamaillerie est possible (délai écoulé). */
  canSquabble: boolean;
  /** Interaction proposée par le joueur (seules les interactions `playerInitiated`). */
  playerInitiated?: boolean;
}

/** Interactions possibles dans ce contexte (avant tirage). */
export function eligibleSocialEvents(
  events: readonly SocialEventDefinition[],
  ctx: SocialContext,
): SocialEventDefinition[] {
  return events.filter(
    (e) =>
      e.weight > 0 &&
      e.minLevel <= ctx.level &&
      e.kind !== 'RECONCILE' &&
      (e.kind !== 'SQUABBLE' || (ctx.canSquabble && !ctx.playerInitiated)) &&
      (!e.requiresTag || ctx.hostTags.has(e.requiresTag)) &&
      (!ctx.playerInitiated || e.playerInitiated),
  );
}

/**
 * Choisit l'interaction suivante. Après une chamaillerie, la suivante est TOUJOURS une
 * réconciliation (et rapporte plus que la chamaillerie n'a coûté).
 */
export function pickSocialEvent(
  events: readonly SocialEventDefinition[],
  ctx: SocialContext,
  rng: Rng,
): SocialEventDefinition | null {
  if (ctx.needsReconcile) return events.find((e) => e.kind === 'RECONCILE') ?? null;
  const eligible = eligibleSocialEvents(events, ctx);
  return eligible.length > 0 ? pickWeighted(rng, eligible) : null;
}

/** Graine stable à partir d'une chaîne (tirages reproductibles et rejouables). */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
