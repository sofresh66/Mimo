import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Exploration, Prisma } from '@prisma/client';
import { VILLAGE_POINTS, applyDelta, createRng, rollLoot, type LootResult } from '@mimo/game-data';
import type { ExplorationView, ZoneView } from '@mimo/types';
import { createHash } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { currentStats, lootView } from '../content/views';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { QUEUES, QueueService } from '../jobs/queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { RealtimeService } from '../realtime/realtime.service';
import { VillageService } from '../village/village.service';

const CURIOSITY_BONUS = 10;

type ExplorationWithNames = Exploration & { creature: { name: string } };

/**
 * Exploration passive : le compagnon part dans une zone pendant une durée donnée.
 * La fin est déclenchée par une tâche différée (BullMQ ou minuterie), avec deux filets
 * de sécurité : un balayage périodique et une complétion « paresseuse » à la lecture.
 * La complétion est idempotente (transition IN_PROGRESS → COMPLETED gardée).
 */
@Injectable()
export class ExplorationsService implements OnModuleInit {
  private readonly logger = new Logger(ExplorationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly inventory: InventoryService,
    private readonly progression: ProgressionService,
    private readonly village: VillageService,
    private readonly realtime: RealtimeService,
    private readonly queue: QueueService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(QUEUES.exploration, 'complete', async (data) => {
      await this.complete(String(data.explorationId));
    });
    this.queue.register(QUEUES.maintenance, 'sweep-explorations', () =>
      this.sweep().then(() => undefined),
    );
    await this.queue.every(QUEUES.maintenance, 'sweep-explorations', 60_000);
  }

  durationMs(durationMinutes: number): number {
    return Math.max(5_000, Math.round(durationMinutes * 60_000 * this.config.explorationTimeScale));
  }

  async zones(childId: string): Promise<ZoneView[]> {
    const creature = await this.prisma.creature.findFirst({ where: { childId, isActive: true } });
    const level = creature?.level ?? 1;
    return this.catalog.index.catalog.zones.map((z) => ({
      id: z.key,
      name: t(z.name),
      description: t(z.description),
      emoji: z.emoji,
      colors: z.colors,
      durationSeconds: Math.round(this.durationMs(z.durationMinutes) / 1000),
      minLevel: z.minLevel,
      energyCost: z.energyCost,
      xpCategory: z.xp.category,
      xpAmount: z.xp.amount,
      locked: level < z.minLevel,
    }));
  }

  async start(childId: string, zoneId: string): Promise<ExplorationView> {
    const zone = this.catalog.index.zones.get(zoneId);
    if (!zone) throw Errors.notFound('Zone');
    const exploration = await this.prisma.$transaction(async (tx) => {
      const child = await tx.childProfile.findUniqueOrThrow({ where: { id: childId } });
      const creature = await tx.creature.findFirst({ where: { childId, isActive: true } });
      if (!creature) throw Errors.badRequest('NO_CREATURE', 'Adopte d’abord un compagnon');
      if (this.catalog.index.form(creature.formId).stage === 'EGG') {
        throw Errors.badRequest('EGG_CANNOT_EXPLORE', 'Ton oeuf doit d’abord éclore');
      }
      if (creature.level < zone.minLevel) {
        throw Errors.badRequest('ZONE_LOCKED', `Niveau ${zone.minLevel} nécessaire`, {
          minLevel: zone.minLevel,
        });
      }
      if ((await tx.exploration.count({ where: { childId, status: 'IN_PROGRESS' } })) > 0) {
        throw Errors.conflict('ALREADY_EXPLORING', 'Ton compagnon est déjà en exploration');
      }
      const stats = currentStats(creature);
      if (stats.energy < zone.energyCost) {
        throw Errors.badRequest(
          'NOT_ENOUGH_ENERGY',
          'Ton compagnon a besoin de reprendre des forces',
          {
            energy: stats.energy,
            required: zone.energyCost,
          },
        );
      }
      await tx.creature.update({
        where: { id: creature.id },
        data: { ...applyDelta(stats, { energy: -zone.energyCost }), statsUpdatedAt: new Date() },
      });
      const created = await tx.exploration.create({
        data: {
          childId,
          creatureId: creature.id,
          zoneId,
          endsAt: new Date(Date.now() + this.durationMs(zone.durationMinutes)),
        },
        include: { creature: { select: { name: true } } },
      });
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'EXPLORATION_STARTED',
          payload: {
            creatureName: creature.name,
            zoneId,
            zoneName: t(zone.name),
            emoji: zone.emoji,
          },
        },
        tx,
      );
      return created;
    });
    await this.queue.schedule(
      QUEUES.exploration,
      'complete',
      { explorationId: exploration.id },
      {
        delayMs: exploration.endsAt.getTime() - Date.now(),
        jobId: `exploration-${exploration.id}`,
      },
    );
    return this.view(exploration);
  }

  /** Termine une exploration arrivée à échéance. Sans effet si déjà terminée ou pas encore due. */
  async complete(explorationId: string): Promise<boolean> {
    const effects = new Effects();
    const done = await this.prisma.$transaction(async (tx) => {
      const exploration = await tx.exploration.findUnique({
        where: { id: explorationId },
        include: { child: true, creature: true },
      });
      if (!exploration || exploration.status !== 'IN_PROGRESS') return null;
      if (exploration.endsAt.getTime() > Date.now() + 1_000) return null;
      const zone = this.catalog.index.zones.get(exploration.zoneId);
      if (!zone) return null;

      // Tirage déterministe (graine dérivée de l'identifiant) : rejouable et vérifiable.
      const loot: LootResult = rollLoot(zone.loot, createRng(seedFrom(exploration.id)));
      const claimed = await tx.exploration.updateMany({
        where: { id: exploration.id, status: 'IN_PROGRESS' },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          rewards: { ...loot, xp: zone.xp.amount } as unknown as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) return null;

      const { familyId } = exploration.child;
      const childId = exploration.childId;
      await this.inventory.grantLoot(tx, familyId, childId, loot, { zoneId: zone.key });
      const creature = await tx.creature.findUniqueOrThrow({
        where: { id: exploration.creatureId },
      });
      await tx.creature.update({
        where: { id: creature.id },
        data: {
          ...applyDelta(currentStats(creature), { curiosity: CURIOSITY_BONUS, happiness: 5 }),
          statsUpdatedAt: new Date(),
        },
      });
      await this.events.record(
        {
          familyId,
          childId,
          type: 'EXPLORATION_COMPLETED',
          payload: {
            creatureName: creature.name,
            zoneId: zone.key,
            zoneName: t(zone.name),
            emoji: zone.emoji,
            coins: loot.coins,
            items: loot.items.length,
          },
        },
        tx,
      );
      // L'XP n'est accordée qu'au compagnon parti, même si l'enfant en a activé un autre entre-temps.
      if (creature.isActive) {
        await this.progression.grantXp(
          tx,
          {
            familyId,
            childId,
            amount: zone.xp.amount,
            category: zone.xp.category,
            source: 'EXPLORATION',
            sourceId: exploration.id,
          },
          effects,
        );
      }
      await this.village.addPoints(
        tx,
        familyId,
        VILLAGE_POINTS.explorationCompleted,
        effects,
        childId,
      );
      await this.village.trackGoal(tx, familyId, 'EXPLORATIONS_COMPLETED', effects, childId);
      return tx.exploration.findUniqueOrThrow({
        where: { id: exploration.id },
        include: { creature: { select: { name: true } } },
      });
    });
    if (!done) return false;
    effects.add(() =>
      this.realtime.toChild(done.childId, 'exploration:completed', this.view(done)),
    );
    await effects.flush();
    return true;
  }

  /** Rattrape les explorations échues (tâche perdue, redémarrage…). */
  async sweep(): Promise<number> {
    const due = await this.prisma.exploration.findMany({
      where: { status: 'IN_PROGRESS', endsAt: { lte: new Date() } },
      select: { id: true },
      take: 200,
    });
    let count = 0;
    for (const { id } of due) {
      try {
        if (await this.complete(id)) count += 1;
      } catch (error) {
        this.logger.error(`Exploration ${id} non terminée : ${String(error)}`);
      }
    }
    return count;
  }

  async completeDueForChild(childId: string): Promise<void> {
    const due = await this.prisma.exploration.findMany({
      where: { childId, status: 'IN_PROGRESS', endsAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const { id } of due) await this.complete(id);
  }

  async current(childId: string): Promise<ExplorationView | null> {
    const exploration = await this.prisma.exploration.findFirst({
      where: { childId, status: 'IN_PROGRESS' },
      include: { creature: { select: { name: true } } },
    });
    return exploration ? this.view(exploration) : null;
  }

  async unseen(childId: string): Promise<ExplorationView | null> {
    const exploration = await this.prisma.exploration.findFirst({
      where: { childId, status: 'COMPLETED', seenAt: null },
      orderBy: { completedAt: 'desc' },
      include: { creature: { select: { name: true } } },
    });
    return exploration ? this.view(exploration) : null;
  }

  async markSeen(childId: string, explorationId: string): Promise<void> {
    await this.prisma.exploration.updateMany({
      where: { id: explorationId, childId, status: 'COMPLETED' },
      data: { seenAt: new Date() },
    });
  }

  async history(childId: string): Promise<ExplorationView[]> {
    await this.completeDueForChild(childId);
    const list = await this.prisma.exploration.findMany({
      where: { childId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: { creature: { select: { name: true } } },
    });
    return list.map((e) => this.view(e));
  }

  view(e: ExplorationWithNames): ExplorationView {
    const zone = this.catalog.index.zones.get(e.zoneId);
    const rewards = e.rewards as (LootResult & { xp: number }) | null;
    return {
      id: e.id,
      zone: {
        id: e.zoneId,
        name: zone ? t(zone.name) : e.zoneId,
        emoji: zone?.emoji ?? '🧭',
        colors: zone?.colors ?? ['#5ccf8f', '#1f7a5a'],
      },
      creatureName: e.creature.name,
      status: e.status,
      startedAt: e.startedAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      completedAt: e.completedAt?.toISOString() ?? null,
      seen: Boolean(e.seenAt),
      rewards: rewards ? lootView(rewards, this.catalog.index) : null,
      xp: rewards?.xp ?? null,
    };
  }
}

function seedFrom(id: string): number {
  return createHash('sha256').update(id).digest().readUInt32LE(0);
}
