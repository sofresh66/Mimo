import type { AccessorySlot, Equipment } from '@mimo/types';

/** Emojis des accessoires équipés, au format attendu par le composant <Creature>. */
export function equipmentEmojis(equipment: Equipment): Partial<Record<AccessorySlot, string>> {
  const result: Partial<Record<AccessorySlot, string>> = {};
  for (const [slot, item] of Object.entries(equipment) as Array<
    [AccessorySlot, Equipment[AccessorySlot]]
  >) {
    if (item) result[slot] = item.emoji;
  }
  return result;
}

/** Durée lisible (ex. « 4 min 30 s »). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m.toString().padStart(2, '0')}`;
  if (m > 0) return sec > 0 ? `${m} min ${sec} s` : `${m} min`;
  return `${sec} s`;
}
