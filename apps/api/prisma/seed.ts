/**
 * Données de démonstration — NE JAMAIS UTILISER EN PRODUCTION.
 *
 * - synchronise le contenu du jeu (packages/game-data) ;
 * - recrée la famille de démo « Les Étoiles » (parent demo@mimo.local) et 3 enfants fictifs.
 *
 * Relançable : la famille de démo est supprimée puis recréée.
 */
import { PrismaClient, type MissionRecurrence, type XpCategory } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  STAGE_MIN_LEVEL,
  defaultCatalog,
  emptyCategoryXp,
  isoWeekKey,
  levelFromTotalXp,
  resolveEvolution,
  stageRank,
  totalXpForLevel,
  validateCatalog,
  type CategoryXp,
} from '@mimo/game-data';
import { assertLocalDatabase } from '@mimo/config';
import { syncContent } from '../src/content/content-sync';
import { periodKey } from '../src/missions/period';

export const DEMO = {
  email: 'demo@mimo.local',
  password: 'MimoDemo2026!',
  parentPin: '1234',
  children: [
    { name: 'Haylie', avatar: '🦊', color: '#ff8a5c', pin: '1111' },
    { name: 'Emilia', avatar: '🐉', color: '#7c5cff', pin: '2222' },
    { name: 'Jude', avatar: '🐼', color: '#3fb6e8', pin: '3333' },
  ],
} as const;

const prisma = new PrismaClient();
const hash = (s: string) =>
  argon2.hash(s, { type: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000);

interface CreatureSeed {
  species: string;
  name: string;
  categoryXp: Partial<CategoryXp>;
  recipes: number;
  explorations: number;
  missions: number;
}

async function main(): Promise<void> {
  // Garde-fou principal : l'URL de la base doit être locale (NODE_ENV ne suffit pas).
  assertLocalDatabase('db:seed', {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed de démonstration est interdit en production.');
  }
  const problems = validateCatalog(defaultCatalog);
  if (problems.length) throw new Error(`Catalogue invalide :\n${problems.join('\n')}`);

  console.log('→ Synchronisation du contenu du jeu…');
  await syncContent(prisma, defaultCatalog);

  console.log('→ Réinitialisation de la famille de démonstration…');
  const existing = await prisma.user.findUnique({ where: { email: DEMO.email } });
  if (existing?.familyId) await prisma.family.delete({ where: { id: existing.familyId } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const family = await prisma.family.create({
    data: { name: 'Les Étoiles', village: { create: { points: 0 } } },
    include: { village: true },
  });
  const parent = await prisma.user.create({
    data: {
      email: DEMO.email,
      passwordHash: await hash(DEMO.password),
      displayName: 'Papa',
      familyId: family.id,
      parentPinHash: await hash(DEMO.parentPin),
    },
  });

  // ─── Enfants et créatures ───────────────────────────────────────────────
  const creatureSeeds: CreatureSeed[] = [
    {
      species: 'fox',
      name: 'Luna',
      categoryXp: { READING: 380, CREATIVITY: 160, HELPING: 120, LOGIC: 40 },
      recipes: 3,
      explorations: 6,
      missions: 18,
    },
    {
      species: 'dragon',
      name: 'Braise',
      categoryXp: { LOGIC: 900, ADVENTURE: 450, READING: 220, HELPING: 180, SPORT: 60 },
      recipes: 5,
      explorations: 14,
      missions: 40,
    },
    { species: 'dino', name: 'Pépite', categoryXp: {}, recipes: 0, explorations: 0, missions: 0 },
  ];

  const children = [];
  for (const [i, c] of DEMO.children.entries()) {
    const child = await prisma.childProfile.create({
      data: {
        familyId: family.id,
        displayName: c.name,
        avatar: c.avatar,
        color: c.color,
        pinHash: await hash(c.pin),
        lastSeenAt: daysAgo(i, 2),
        roomDecorations: i === 0 ? ['potted_plant', 'lantern'] : [],
        inventory: { create: { coins: [180, 320, 50][i] ?? 50 } },
      },
      include: { inventory: true },
    });
    children.push(child);
    const seed = creatureSeeds[i] as CreatureSeed;
    const categoryXp: CategoryXp = { ...emptyCategoryXp(), ...seed.categoryXp };
    const totalXp = Object.values(categoryXp).reduce((a, b) => a + b, 0);
    const level = levelFromTotalXp(totalXp);
    // Simule la croissance stade par stade pour obtenir une forme cohérente.
    let formKey: string | null = null;
    for (const lvl of [
      1,
      STAGE_MIN_LEVEL.BABY,
      STAGE_MIN_LEVEL.YOUNG,
      STAGE_MIN_LEVEL.ADULT,
      level,
    ]) {
      if (lvl > level) break;
      const form = resolveEvolution(defaultCatalog.evolutions, {
        species: seed.species,
        currentFormKey: formKey,
        level: lvl,
        categoryXp,
        recipesDiscovered: seed.recipes,
        explorationsCompleted: seed.explorations,
        missionsCompleted: seed.missions,
      });
      formKey = form.key;
      await prisma.creaturedexEntry.upsert({
        where: { familyId_formId: { familyId: family.id, formId: form.key } },
        create: {
          familyId: family.id,
          formId: form.key,
          discoveredByChildId: child.id,
          discoveredAt: daysAgo(30 - lvl),
        },
        update: {},
      });
    }
    const form = defaultCatalog.evolutions.find((f) => f.key === formKey);
    await prisma.creature.create({
      data: {
        childId: child.id,
        speciesId: seed.species,
        formId: formKey as string,
        name: seed.name,
        level,
        totalXp: Math.max(totalXp, totalXpForLevel(level)),
        xpLogic: categoryXp.LOGIC,
        xpCreativity: categoryXp.CREATIVITY,
        xpReading: categoryXp.READING,
        xpAdventure: categoryXp.ADVENTURE,
        xpHelping: categoryXp.HELPING,
        xpSport: categoryXp.SPORT,
        happiness: 78,
        energy: 85,
        curiosity: 64,
        bornAt: daysAgo(i === 2 ? 1 : 40 - i * 5),
        hatchedAt: form && stageRank(form.stage) > 0 ? daysAgo(38 - i * 5) : null,
        neckItemId: i === 0 ? 'red_scarf' : null,
        faceItemId: i === 1 ? 'round_glasses' : null,
      },
    });
    await prisma.gameEvent.create({
      data: {
        familyId: family.id,
        childId: child.id,
        type: 'CREATURE_ADOPTED',
        payload: { creatureName: seed.name, speciesId: seed.species },
        createdAt: daysAgo(40 - i * 5),
      },
    });
  }
  const [haylie, emilia, jude] = children as [
    (typeof children)[0],
    (typeof children)[0],
    (typeof children)[0],
  ];

  // ─── Inventaires et recettes ────────────────────────────────────────────
  const inventories: Array<[typeof haylie, Array<[string, number]>]> = [
    [
      haylie,
      [
        ['apple', 4],
        ['strawberry', 3],
        ['milk', 3],
        ['honey', 1],
        ['banana', 2],
        ['red_scarf', 1],
        ['red_cap', 1],
        ['potted_plant', 1],
        ['lantern', 1],
        ['wood', 5],
        ['flower', 3],
        ['chest_common', 1],
        ['ball', 1],
      ],
    ],
    [
      emilia,
      [
        ['apple', 2],
        ['bread', 2],
        ['honey', 2],
        ['mushroom', 3],
        ['carrot', 2],
        ['round_glasses', 1],
        ['backpack', 1],
        ['crystal', 2],
        ['stone', 4],
        ['feather', 3],
        ['chest_rare', 1],
        ['egg_robot', 1],
        ['ball', 1],
      ],
    ],
    [
      jude,
      [
        ['apple', 3],
        ['strawberry', 2],
        ['milk', 2],
        ['ball', 1],
      ],
    ],
  ];
  for (const [child, items] of inventories) {
    const inventoryId = child.inventory?.id as string;
    await prisma.inventoryItem.createMany({
      data: items.map(([itemId, quantity]) => ({ inventoryId, itemId, quantity })),
    });
  }
  const discoveries: Array<[string, string[]]> = [
    [haylie.id, ['recipe_magic_milkshake', 'recipe_caramel_apple', 'recipe_banana_smoothie']],
    [
      emilia.id,
      [
        'recipe_magic_milkshake',
        'recipe_golden_toast',
        'recipe_forest_soup',
        'recipe_grape_pie',
        'recipe_fruit_salad',
      ],
    ],
  ];
  for (const [childId, recipes] of discoveries) {
    await prisma.recipeDiscovery.createMany({
      data: recipes.map((recipeId, i) => ({
        childId,
        recipeId,
        discoveredAt: daysAgo(20 - i * 3),
      })),
    });
  }

  // ─── Missions ───────────────────────────────────────────────────────────
  const template = (key: string) => {
    const t = defaultCatalog.missionTemplates.find((m) => m.key === key);
    if (!t) throw new Error(`Modèle manquant : ${key}`);
    return t;
  };
  const missionDefs: Array<{
    key: string;
    recurrence: MissionRecurrence;
    assigned?: string;
    rewardItemId?: string;
  }> = [
    { key: 'read_15', recurrence: 'DAILY' },
    { key: 'tidy_toys', recurrence: 'DAILY' },
    { key: 'math_exercise', recurrence: 'DAILY', assigned: emilia.id },
    { key: 'school_bag', recurrence: 'DAILY' },
    { key: 'set_table', recurrence: 'DAILY' },
    { key: 'play_outside', recurrence: 'WEEKLY', rewardItemId: 'chest_common' },
    { key: 'creative_activity', recurrence: 'WEEKLY' },
    { key: 'music_practice', recurrence: 'DAILY', assigned: haylie.id },
  ];
  const missions = [];
  for (const def of missionDefs) {
    const t = template(def.key);
    missions.push(
      await prisma.mission.create({
        data: {
          familyId: family.id,
          createdById: parent.id,
          templateId: t.key,
          title: t.title.fr,
          description: t.description.fr,
          category: t.category as XpCategory,
          icon: t.icon,
          xp: t.xp,
          coins: t.coins,
          recurrence: def.recurrence,
          assignedChildId: def.assigned ?? null,
          rewardItemId: def.rewardItemId ?? null,
          createdAt: daysAgo(30),
        },
      }),
    );
  }
  const [readMission, tidyMission] = missions;
  const timezone = process.env.APP_TIMEZONE ?? 'Europe/Paris';

  // Historique : missions validées les jours précédents.
  for (let d = 1; d <= 6; d += 1) {
    for (const [child, mission] of [
      [haylie, readMission],
      [emilia, readMission],
      [emilia, tidyMission],
    ] as const) {
      if (!mission) continue;
      const when = daysAgo(d, 3);
      const completion = await prisma.missionCompletion.create({
        data: {
          missionId: mission.id,
          childId: child.id,
          periodKey: periodKey('DAILY', when, timezone),
          status: 'APPROVED',
          requestedAt: when,
          reviewedAt: when,
          reviewedById: parent.id,
          xpAwarded: mission.xp,
          coinsAwarded: mission.coins,
          createdAt: when,
        },
      });
      await prisma.xPEvent.create({
        data: {
          childId: child.id,
          amount: mission.xp,
          category: mission.category,
          source: 'MISSION',
          sourceId: completion.id,
          createdAt: when,
        },
      });
      await prisma.gameEvent.create({
        data: {
          familyId: family.id,
          childId: child.id,
          type: 'MISSION_COMPLETED',
          payload: {
            missionTitle: mission.title,
            icon: mission.icon,
            xp: mission.xp,
            coins: mission.coins,
            category: mission.category,
            parentName: parent.displayName,
          },
          createdAt: when,
        },
      });
    }
  }
  // Demandes en attente aujourd'hui (à valider par le parent).
  const now = new Date();
  for (const [child, mission] of [
    [haylie, readMission],
    [jude, tidyMission],
  ] as const) {
    if (!mission) continue;
    await prisma.missionCompletion.create({
      data: {
        missionId: mission.id,
        childId: child.id,
        periodKey: periodKey('DAILY', now, timezone),
        status: 'PENDING',
        requestedAt: daysAgo(0, 1),
      },
    });
    await prisma.gameEvent.create({
      data: {
        familyId: family.id,
        childId: child.id,
        type: 'MISSION_REQUESTED',
        payload: { missionTitle: mission.title, icon: mission.icon },
        createdAt: daysAgo(0, 1),
      },
    });
  }

  // ─── Explorations passées ───────────────────────────────────────────────
  const pastExplorations: Array<[typeof haylie, string, number]> = [
    [haylie, 'glowing_forest', 3],
    [haylie, 'shell_beach', 2],
    [emilia, 'cloud_mountain', 2],
    [emilia, 'crystal_cave', 1],
  ];
  for (const [child, zoneId, d] of pastExplorations) {
    const creature = await prisma.creature.findFirstOrThrow({ where: { childId: child.id } });
    const zone = defaultCatalog.zones.find((z) => z.key === zoneId);
    if (!zone) continue;
    const startedAt = daysAgo(d, 5);
    const firstItem = zone.loot.entries.find((e) => e.kind === 'item');
    const rewards = {
      coins: 18,
      items: firstItem?.kind === 'item' ? [{ item: firstItem.item, quantity: 2 }] : [],
      xp: zone.xp.amount,
    };
    await prisma.exploration.create({
      data: {
        childId: child.id,
        creatureId: creature.id,
        zoneId,
        status: 'COMPLETED',
        startedAt,
        endsAt: new Date(startedAt.getTime() + zone.durationMinutes * 60_000),
        completedAt: new Date(startedAt.getTime() + zone.durationMinutes * 60_000),
        seenAt: new Date(startedAt.getTime() + zone.durationMinutes * 60_000 + 60_000),
        rewards,
      },
    });
    await prisma.gameEvent.create({
      data: {
        familyId: family.id,
        childId: child.id,
        type: 'EXPLORATION_COMPLETED',
        payload: {
          creatureName: creature.name,
          zoneId,
          zoneName: zone.name.fr,
          emoji: zone.emoji,
          coins: 18,
          items: 1,
        },
        createdAt: new Date(startedAt.getTime() + zone.durationMinutes * 60_000),
      },
    });
  }

  // ─── Cadeaux en attente ────────────────────────────────────────────────
  await prisma.reward.createMany({
    data: [
      {
        familyId: family.id,
        childId: haylie.id,
        type: 'ITEM',
        source: 'PARENT',
        itemId: 'chest_rare',
        amount: 1,
        message: 'Bravo pour ta semaine de lecture !',
        createdById: parent.id,
      },
      {
        familyId: family.id,
        childId: jude.id,
        type: 'COINS',
        source: 'PARENT',
        amount: 30,
        message: 'Bienvenue dans Mimo !',
        createdById: parent.id,
      },
    ],
  });

  // ─── Village et missions familiales ─────────────────────────────────────
  const villagePoints = 320;
  const village = await prisma.village.update({
    where: { id: family.village?.id },
    data: { points: villagePoints },
  });
  for (const b of defaultCatalog.buildings.filter((b) => b.requiredPoints <= villagePoints)) {
    await prisma.villageBuilding.create({
      data: {
        villageId: village.id,
        buildingId: b.key,
        unlockedAt: daysAgo(Math.max(0, 25 - b.requiredPoints / 15)),
      },
    });
    if (b.requiredPoints > 0) {
      await prisma.gameEvent.create({
        data: {
          familyId: family.id,
          type: 'BUILDING_UNLOCKED',
          payload: { buildingId: b.key, name: b.name.fr, emoji: b.emoji },
          createdAt: daysAgo(Math.max(0, 25 - b.requiredPoints / 15)),
        },
      });
    }
  }
  const weekKey = isoWeekKey(new Date());
  await prisma.familyMissionProgress.createMany({
    data: [
      { familyId: family.id, familyMissionId: 'weekly_missions', weekKey, progress: 6 },
      { familyId: family.id, familyMissionId: 'weekly_explorations', weekKey, progress: 3 },
      { familyId: family.id, familyMissionId: 'weekly_games', weekKey, progress: 4 },
      { familyId: family.id, familyMissionId: 'weekly_meals', weekKey, progress: 9 },
    ],
  });

  console.log('✔ Données de démonstration prêtes.');
  console.log(`  Parent : ${DEMO.email} / ${DEMO.password} (PIN parent ${DEMO.parentPin})`);
  for (const c of DEMO.children) console.log(`  Enfant : ${c.avatar} ${c.name} — PIN ${c.pin}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
