import type { LootTable } from '../types';
import { pickWeighted, randomInt, type Rng } from './rng';

export interface LootResult {
  coins: number;
  items: Array<{ item: string; quantity: number }>;
}

/** Tire le butin d'une table (coffre ou zone d'exploration). */
export function rollLoot(table: LootTable, rng: Rng): LootResult {
  let coins = 0;
  const items = new Map<string, number>();
  const add = (item: string, quantity: number) =>
    items.set(item, (items.get(item) ?? 0) + quantity);

  for (const g of table.guaranteed ?? []) add(g.item, g.quantity);
  for (let i = 0; i < table.rolls; i += 1) {
    const entry = pickWeighted(rng, table.entries);
    if (entry.kind === 'coins') coins += randomInt(rng, entry.min, entry.max);
    else add(entry.item, randomInt(rng, entry.min ?? 1, entry.max ?? entry.min ?? 1));
  }
  return { coins, items: [...items.entries()].map(([item, quantity]) => ({ item, quantity })) };
}
