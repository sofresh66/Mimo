import type { Creature } from '@prisma/client';
import {
  XP_CATEGORIES,
  applyTimeDrift,
  levelProgress,
  moodOf,
  type CatalogIndex,
  type CategoryXp,
  type CreatureStats,
  type EvolutionFormDefinition,
  type ItemDefinition,
} from '@mimo/game-data';
import type {
  Appearance,
  CreatureSummary,
  CreatureView,
  Equipment,
  ItemView,
  LootView,
} from '@mimo/types';
import { t } from '../common/locale';

/** Mise en forme des réponses (traductions, apparence, statistiques à l'instant présent). */

export function itemView(def: ItemDefinition): ItemView {
  return {
    id: def.key,
    name: t(def.name),
    description: t(def.description),
    category: def.category,
    rarity: def.rarity,
    emoji: def.emoji,
    price: def.price ?? null,
    effect: def.effect ?? null,
    slot: def.slot ?? null,
    unique: def.unique ?? false,
    decor: def.decor ?? null,
  };
}

export function appearanceOf(form: EvolutionFormDefinition): Appearance {
  return {
    species: form.species,
    stage: form.stage,
    palette: form.palette,
    feature: form.feature,
    aura: form.aura ?? null,
  };
}

export function categoryXpOf(c: Creature): CategoryXp {
  return {
    LOGIC: c.xpLogic,
    CREATIVITY: c.xpCreativity,
    READING: c.xpReading,
    ADVENTURE: c.xpAdventure,
    HELPING: c.xpHelping,
    SPORT: c.xpSport,
  };
}

export const CATEGORY_COLUMN = {
  LOGIC: 'xpLogic',
  CREATIVITY: 'xpCreativity',
  READING: 'xpReading',
  ADVENTURE: 'xpAdventure',
  HELPING: 'xpHelping',
  SPORT: 'xpSport',
} as const;

/** Statistiques actuelles (avec le retour progressif vers l'état calme). */
export function currentStats(c: Creature, now = new Date()): CreatureStats {
  return applyTimeDrift(
    { happiness: c.happiness, energy: c.energy, curiosity: c.curiosity },
    now.getTime() - c.statsUpdatedAt.getTime(),
  );
}

/** Niveau 0-100 d'un attribut, dérivé de l'XP de la catégorie (échelle douce). */
function attributeScore(xp: number): number {
  return Math.min(100, Math.round(Math.sqrt(xp) * 3));
}

export function creatureView(
  c: Creature,
  catalog: CatalogIndex,
  isExploring: boolean,
): CreatureView {
  const form = catalog.form(c.formId);
  const species = catalog.species.get(c.speciesId);
  const progress = levelProgress(c.totalXp);
  const stats = currentStats(c);
  const xp = categoryXpOf(c);
  const equipment: Equipment = {};
  const slots = [
    ['HEAD', c.headItemId],
    ['FACE', c.faceItemId],
    ['NECK', c.neckItemId],
    ['BACK', c.backItemId],
  ] as const;
  for (const [slot, itemId] of slots) {
    const def = itemId ? catalog.items.get(itemId) : undefined;
    if (def) equipment[slot] = itemView(def);
  }
  return {
    id: c.id,
    name: c.name,
    speciesId: c.speciesId,
    speciesName: species ? t(species.name) : c.speciesId,
    formId: form.key,
    formName: t(form.name),
    formDescription: t(form.description),
    stage: form.stage,
    level: c.level,
    totalXp: c.totalXp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    isMaxLevel: progress.isMaxLevel,
    stats,
    attributes: Object.fromEntries(
      XP_CATEGORIES.map((cat) => [cat, attributeScore(xp[cat])]),
    ) as CreatureView['attributes'],
    mood: moodOf(stats),
    appearance: appearanceOf(form),
    equipment,
    bornAt: c.bornAt.toISOString(),
    hatchedAt: c.hatchedAt?.toISOString() ?? null,
    ageDays: Math.floor((Date.now() - c.bornAt.getTime()) / 86_400_000),
    isActive: c.isActive,
    isExploring,
  };
}

export function creatureSummary(c: Creature, catalog: CatalogIndex): CreatureSummary {
  const form = catalog.form(c.formId);
  return {
    id: c.id,
    name: c.name,
    level: c.level,
    formName: t(form.name),
    appearance: appearanceOf(form),
  };
}

export function lootView(
  loot: { coins: number; items: Array<{ item: string; quantity: number }> },
  catalog: CatalogIndex,
): LootView {
  return {
    coins: loot.coins,
    items: loot.items
      .filter(({ item }) => catalog.items.has(item))
      .map(({ item, quantity }) => ({ item: itemView(catalog.item(item)), quantity })),
  };
}
