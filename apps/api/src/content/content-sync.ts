import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameCatalog } from '@mimo/game-data';

type Json = Prisma.InputJsonValue;
const json = (value: unknown): Json => value as Json;

/**
 * Synchronise les définitions versionnées (packages/game-data) vers les tables de définition.
 * Idempotent : peut être relancé à chaque déploiement (`pnpm db:sync-content`).
 * Les définitions ne sont jamais supprimées (des données de jeu peuvent y faire référence).
 */
export async function syncContent(prisma: PrismaClient, catalog: GameCatalog): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      for (const s of catalog.species) {
        const data = {
          name: json(s.name),
          description: json(s.description),
          emoji: s.emoji,
          affinity: s.affinity,
          palette: json(s.palette),
          starter: s.starter,
        };
        await tx.creatureSpecies.upsert({
          where: { id: s.key },
          create: { id: s.key, ...data },
          update: data,
        });
      }
      for (const [i, f] of catalog.evolutions.entries()) {
        const data = {
          speciesId: f.species,
          stage: f.stage,
          name: json(f.name),
          description: json(f.description),
          hint: json(f.hint),
          palette: json(f.palette),
          feature: f.feature,
          aura: f.aura ?? null,
          conditions: json(f.conditions),
          sortOrder: i,
        };
        await tx.creatureEvolution.upsert({
          where: { id: f.key },
          create: { id: f.key, ...data },
          update: data,
        });
      }
      for (const item of catalog.items) {
        const data = {
          name: json(item.name),
          description: json(item.description),
          category: item.category,
          rarity: item.rarity,
          emoji: item.emoji,
          price: item.price ?? null,
          effect: item.effect ? json(item.effect) : undefined,
          slot: item.slot ?? null,
          loot: item.loot ? json(item.loot) : undefined,
          hatchesSpeciesId: item.hatchesSpecies ?? null,
        };
        await tx.itemDefinition.upsert({
          where: { id: item.key },
          create: { id: item.key, ...data },
          update: data,
        });
      }
      for (const r of catalog.recipes) {
        const data = {
          name: json(r.name),
          ingredients: r.ingredients,
          resultItemId: r.result,
          hint: json(r.hint),
        };
        await tx.recipe.upsert({
          where: { id: r.key },
          create: { id: r.key, ...data },
          update: data,
        });
      }
      for (const [i, z] of catalog.zones.entries()) {
        const data = {
          name: json(z.name),
          description: json(z.description),
          emoji: z.emoji,
          colors: z.colors,
          durationMinutes: z.durationMinutes,
          minLevel: z.minLevel,
          energyCost: z.energyCost,
          xpCategory: z.xp.category,
          xpAmount: z.xp.amount,
          loot: json(z.loot),
          sortOrder: i,
        };
        await tx.explorationZone.upsert({
          where: { id: z.key },
          create: { id: z.key, ...data },
          update: data,
        });
      }
      for (const [i, m] of catalog.missionTemplates.entries()) {
        const data = {
          title: json(m.title),
          description: json(m.description),
          category: m.category,
          xp: m.xp,
          coins: m.coins,
          icon: m.icon,
          sortOrder: i,
        };
        await tx.missionTemplate.upsert({
          where: { id: m.key },
          create: { id: m.key, ...data },
          update: data,
        });
      }
      for (const b of catalog.buildings) {
        const data = {
          name: json(b.name),
          description: json(b.description),
          emoji: b.emoji,
          requiredPoints: b.requiredPoints,
          positionX: b.position.x,
          positionY: b.position.y,
        };
        await tx.buildingDefinition.upsert({
          where: { id: b.key },
          create: { id: b.key, ...data },
          update: data,
        });
      }
      for (const fm of catalog.familyMissions) {
        const data = {
          title: json(fm.title),
          description: json(fm.description),
          goalType: fm.goalType,
          target: fm.target,
          rewardPoints: fm.rewardPoints,
          icon: fm.icon,
        };
        await tx.familyMission.upsert({
          where: { id: fm.key },
          create: { id: fm.key, ...data },
          update: data,
        });
      }
    },
    { timeout: 60_000 },
  );
}
