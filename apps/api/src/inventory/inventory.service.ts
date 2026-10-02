import { Injectable } from '@nestjs/common';
import type { AccessorySlot } from '@prisma/client';
import {
  MATERIAL_DONATION_POINTS,
  VILLAGE_POINTS,
  applyDelta,
  createRng,
  matchRecipe,
  rollLoot,
  type LootResult,
} from '@mimo/game-data';
import type {
  CookResult,
  FeedResult,
  InventoryView,
  ItemView,
  LootView,
  RecipeView,
} from '@mimo/types';
import { randomInt } from 'node:crypto';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { creatureView, currentStats, itemView, lootView } from '../content/views';
import { EventsService } from '../events/events.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { VillageService } from '../village/village.service';

const SLOT_COLUMN = {
  HEAD: 'headItemId',
  FACE: 'faceItemId',
  NECK: 'neckItemId',
  BACK: 'backItemId',
} as const;

export const MAX_ROOM_DECORATIONS = 3;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly village: VillageService,
  ) {}

  // ─── Primitives (utilisées dans les transactions des autres modules) ──────

  async ensureInventory(tx: Tx, childId: string) {
    return tx.inventory.upsert({ where: { childId }, create: { childId }, update: {} });
  }

  async addCoins(tx: Tx, childId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    await tx.inventory.upsert({
      where: { childId },
      create: { childId, coins: amount },
      update: { coins: { increment: amount } },
    });
  }

  async addItems(
    tx: Tx,
    childId: string,
    items: Array<{ item: string; quantity: number }>,
  ): Promise<void> {
    if (items.length === 0) return;
    const inventory = await this.ensureInventory(tx, childId);
    for (const { item, quantity } of items) {
      if (quantity <= 0 || !this.catalog.index.items.has(item)) continue;
      await tx.inventoryItem.upsert({
        where: { inventoryId_itemId: { inventoryId: inventory.id, itemId: item } },
        create: { inventoryId: inventory.id, itemId: item, quantity },
        update: { quantity: { increment: quantity } },
      });
    }
  }

  /** Retire des objets ; échoue proprement si la quantité est insuffisante. */
  async removeItem(tx: Tx, childId: string, itemId: string, quantity = 1): Promise<void> {
    const inventory = await this.ensureInventory(tx, childId);
    const updated = await tx.inventoryItem.updateMany({
      where: { inventoryId: inventory.id, itemId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count === 0) throw Errors.badRequest('NOT_ENOUGH_ITEMS', 'Tu n’en as pas assez');
    await tx.inventoryItem.deleteMany({
      where: { inventoryId: inventory.id, itemId, quantity: { lte: 0 } },
    });
  }

  async owns(tx: Tx, childId: string, itemId: string): Promise<boolean> {
    const entry = await tx.inventoryItem.findFirst({
      where: { inventory: { childId }, itemId, quantity: { gt: 0 } },
    });
    return Boolean(entry);
  }

  /** Applique un butin (pièces + objets) et journalise les trouvailles notables. */
  async grantLoot(
    tx: Tx,
    familyId: string,
    childId: string,
    loot: LootResult,
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.addCoins(tx, childId, loot.coins);
    await this.addItems(tx, childId, loot.items);
    for (const { item, quantity } of loot.items) {
      const def = this.catalog.index.items.get(item);
      if (!def) continue;
      await this.events.record(
        {
          familyId,
          childId,
          type: 'ITEM_FOUND',
          payload: {
            itemId: item,
            name: t(def.name),
            emoji: def.emoji,
            rarity: def.rarity,
            quantity,
            ...context,
          },
        },
        tx,
      );
    }
  }

  // ─── Lecture ───────────────────────────────────────────────────────────────

  async view(childId: string): Promise<InventoryView> {
    const [inventory, child, creature] = await Promise.all([
      this.prisma.inventory.upsert({
        where: { childId },
        create: { childId },
        update: {},
        include: { items: { orderBy: { acquiredAt: 'asc' } } },
      }),
      this.prisma.childProfile.findUniqueOrThrow({ where: { id: childId } }),
      this.prisma.creature.findFirst({ where: { childId, isActive: true } }),
    ]);
    const index = this.catalog.index;
    return {
      coins: inventory.coins,
      entries: inventory.items
        .filter((e) => index.items.has(e.itemId) && e.quantity > 0)
        .map((e) => ({ item: itemView(index.item(e.itemId)), quantity: e.quantity })),
      equipment: creature ? creatureView(creature, index, false).equipment : {},
      roomDecorations: child.roomDecorations,
    };
  }

  shop(): ItemView[] {
    return this.catalog.index.catalog.items
      .filter((i) => i.price !== undefined)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .map(itemView);
  }

  async recipes(childId: string): Promise<RecipeView[]> {
    const discovered = new Set(
      (await this.prisma.recipeDiscovery.findMany({ where: { childId } })).map((d) => d.recipeId),
    );
    const index = this.catalog.index;
    return index.catalog.recipes.map((r) => {
      const known = discovered.has(r.key);
      return {
        id: r.key,
        discovered: known,
        name: known ? t(r.name) : null,
        hint: t(r.hint),
        ingredients: known ? r.ingredients.map((i) => itemView(index.item(i))) : null,
        result: known ? itemView(index.item(r.result)) : null,
      };
    });
  }

  // ─── Actions enfant ────────────────────────────────────────────────────────

  async buy(childId: string, itemId: string, quantity: number): Promise<InventoryView> {
    const def = this.catalog.index.items.get(itemId);
    if (!def || def.price === undefined) throw Errors.notFound('Article');
    const total = def.price * quantity;
    const child = await this.prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    await this.prisma.$transaction(async (tx) => {
      const inventory = await this.ensureInventory(tx, childId);
      const paid = await tx.inventory.updateMany({
        where: { id: inventory.id, coins: { gte: total } },
        data: { coins: { decrement: total } },
      });
      if (paid.count === 0) throw Errors.badRequest('NOT_ENOUGH_COINS', 'Pas assez de pièces');
      await this.addItems(tx, childId, [{ item: itemId, quantity }]);
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'ITEM_BOUGHT',
          payload: { itemId, name: t(def.name), emoji: def.emoji, quantity, price: total },
        },
        tx,
      );
    });
    return this.view(childId);
  }

  async feed(childId: string, itemId: string): Promise<FeedResult> {
    const def = this.catalog.index.items.get(itemId);
    if (!def || def.category !== 'FOOD' || !def.effect) {
      throw Errors.badRequest('NOT_FOOD', 'Ça ne se mange pas !');
    }
    const effect = def.effect;
    const effects = new Effects();
    const result = await this.prisma.$transaction(async (tx) => {
      const child = await tx.childProfile.findUniqueOrThrow({ where: { id: childId } });
      const creature = await this.activeCreature(tx, childId);
      if (await this.isExploring(tx, creature.id)) {
        throw Errors.badRequest('CREATURE_EXPLORING', 'Ton compagnon est en exploration');
      }
      await this.removeItem(tx, childId, itemId, 1);
      const stats = applyDelta(currentStats(creature), effect);
      const updated = await tx.creature.update({
        where: { id: creature.id },
        data: { ...stats, statsUpdatedAt: new Date() },
      });
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'CREATURE_FED',
          payload: { creatureName: creature.name, itemId, name: t(def.name), emoji: def.emoji },
        },
        tx,
      );
      await this.village.addPoints(
        tx,
        child.familyId,
        VILLAGE_POINTS.creatureFed,
        effects,
        childId,
      );
      await this.village.trackGoal(tx, child.familyId, 'CREATURES_FED', effects, childId);
      return updated;
    });
    await effects.flush();
    return { creature: creatureView(result, this.catalog.index, false), effect, outcome: null };
  }

  async cook(childId: string, ingredients: string[]): Promise<CookResult> {
    const index = this.catalog.index;
    for (const key of ingredients) {
      const def = index.items.get(key);
      if (!def || def.category !== 'FOOD')
        throw Errors.badRequest('NOT_FOOD', 'Ingrédient invalide');
    }
    const recipe = matchRecipe(index.catalog.recipes, ingredients);
    // Une combinaison inconnue ne consomme rien : on peut expérimenter sans rien perdre.
    if (!recipe) return { success: false, recipe: null, newlyDiscovered: false, result: null };
    const child = await this.prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    return this.prisma.$transaction(async (tx) => {
      const counts = new Map<string, number>();
      for (const key of ingredients) counts.set(key, (counts.get(key) ?? 0) + 1);
      for (const [key, qty] of counts) await this.removeItem(tx, childId, key, qty);
      await this.addItems(tx, childId, [{ item: recipe.result, quantity: 1 }]);
      const existing = await tx.recipeDiscovery.findUnique({
        where: { childId_recipeId: { childId, recipeId: recipe.key } },
      });
      if (!existing) {
        await tx.recipeDiscovery.create({ data: { childId, recipeId: recipe.key } });
        await this.events.record(
          {
            familyId: child.familyId,
            childId,
            type: 'RECIPE_DISCOVERED',
            payload: {
              recipeId: recipe.key,
              name: t(recipe.name),
              emoji: index.item(recipe.result).emoji,
            },
          },
          tx,
        );
      }
      return {
        success: true,
        recipe: {
          id: recipe.key,
          discovered: true,
          name: t(recipe.name),
          hint: t(recipe.hint),
          ingredients: recipe.ingredients.map((i) => itemView(index.item(i))),
          result: itemView(index.item(recipe.result)),
        },
        newlyDiscovered: !existing,
        result: itemView(index.item(recipe.result)),
      };
    });
  }

  /** Ouvre un coffre de l'inventaire et attribue son contenu. */
  async openChest(childId: string, itemId: string): Promise<LootView> {
    const def = this.catalog.index.items.get(itemId);
    if (!def || def.category !== 'CHEST' || !def.loot)
      throw Errors.badRequest('NOT_A_CHEST', 'Ce n’est pas un coffre');
    const lootTable = def.loot;
    const child = await this.prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    const loot = await this.prisma.$transaction(async (tx) => {
      await this.removeItem(tx, childId, itemId, 1);
      const rolled = rollLoot(lootTable, createRng(randomInt(2 ** 31)));
      await this.grantLoot(tx, child.familyId, childId, rolled, { from: itemId });
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'CHEST_OPENED',
          payload: { itemId, name: t(def.name), emoji: def.emoji, rarity: def.rarity },
        },
        tx,
      );
      return rolled;
    });
    return lootView(loot, this.catalog.index);
  }

  /** Équipe (ou retire) un accessoire sur le compagnon actif. */
  async equip(childId: string, slot: AccessorySlot, itemId: string | null): Promise<InventoryView> {
    await this.prisma.$transaction(async (tx) => {
      const creature = await this.activeCreature(tx, childId);
      if (itemId) {
        const def = this.catalog.index.items.get(itemId);
        if (!def || def.category !== 'ACCESSORY' || def.slot !== slot) {
          throw Errors.badRequest('INVALID_ACCESSORY', 'Cet accessoire ne va pas ici');
        }
        if (!(await this.owns(tx, childId, itemId)))
          throw Errors.badRequest('NOT_OWNED', 'Tu ne possèdes pas cet objet');
      }
      await tx.creature.update({
        where: { id: creature.id },
        data: { [SLOT_COLUMN[slot]]: itemId },
      });
    });
    return this.view(childId);
  }

  async setRoom(childId: string, decorations: string[]): Promise<InventoryView> {
    const unique = [...new Set(decorations)].slice(0, MAX_ROOM_DECORATIONS);
    await this.prisma.$transaction(async (tx) => {
      for (const key of unique) {
        const def = this.catalog.index.items.get(key);
        if (!def || def.category !== 'DECORATION')
          throw Errors.badRequest('NOT_DECORATION', 'Objet invalide');
        if (!(await this.owns(tx, childId, key)))
          throw Errors.badRequest('NOT_OWNED', 'Tu ne possèdes pas cet objet');
      }
      await tx.childProfile.update({ where: { id: childId }, data: { roomDecorations: unique } });
    });
    return this.view(childId);
  }

  /** Don de matériaux au village familial (contribution coopérative). */
  async donate(childId: string, itemId: string, quantity: number): Promise<{ points: number }> {
    const def = this.catalog.index.items.get(itemId);
    if (!def || def.category !== 'MATERIAL')
      throw Errors.badRequest('NOT_MATERIAL', 'Seuls les matériaux peuvent être donnés');
    const points = MATERIAL_DONATION_POINTS[def.rarity] * quantity;
    const child = await this.prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    const effects = new Effects();
    await this.prisma.$transaction(async (tx) => {
      await this.removeItem(tx, childId, itemId, quantity);
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'MATERIAL_DONATED',
          payload: { itemId, name: t(def.name), emoji: def.emoji, quantity, points },
        },
        tx,
      );
      await this.village.addPoints(tx, child.familyId, points, effects, childId);
    });
    await effects.flush();
    return { points };
  }

  private async activeCreature(tx: Tx, childId: string) {
    const creature = await tx.creature.findFirst({ where: { childId, isActive: true } });
    if (!creature) throw Errors.badRequest('NO_CREATURE', 'Adopte d’abord un compagnon');
    return creature;
  }

  private async isExploring(tx: Tx, creatureId: string): Promise<boolean> {
    return (await tx.exploration.count({ where: { creatureId, status: 'IN_PROGRESS' } })) > 0;
  }
}
