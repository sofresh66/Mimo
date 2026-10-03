import type { SocialEventView } from '@mimo/types';

type Tx = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Phrase d'une interaction entre créatures, du point de vue du joueur. Une interaction
 * ajoutée au contenu sans texte dédié retombe sur une phrase générique (aucun plantage).
 */
export function socialText(event: SocialEventView, tx: Tx): string {
  const table = event.outgoing ? 'socialOut' : 'socialIn';
  const vars = {
    friend: event.friend.creatureName,
    owner: event.friend.ownerName,
    item: event.item?.name ?? '',
    level: tx(`friendshipLevels.${event.levelKey}`),
  };
  const key = `${table}.${event.eventKey}`;
  const text = tx(key, vars);
  return text === key ? tx(`${table}.visit_hello`, vars) : text;
}

/** Résumé du butin (« 🍓 ×3 · 💰 10 »), vide s'il n'y en a pas. */
export function lootText(event: SocialEventView): string {
  const parts = event.loot.items.map((i) => `${i.emoji} ×${i.quantity}`);
  if (event.loot.coins > 0) parts.push(`💰 ${event.loot.coins}`);
  return parts.join(' · ');
}

/** Cœurs d'amitié (0 à 4). */
export function hearts(count: number, max = 4): string {
  return '❤️'.repeat(count) + '🤍'.repeat(Math.max(0, max - count));
}
