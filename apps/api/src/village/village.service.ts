import { Injectable } from '@nestjs/common';
import type { FamilyGoalType } from '@prisma/client';
import {
  isoWeekKey,
  nextBuilding,
  unlockedBuildings,
  type BuildingDefinition,
} from '@mimo/game-data';
import type { BuildingView, CreatureSummary, FamilyMissionView, VillageView } from '@mimo/types';
import { Effects } from '../common/effects';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { creatureSummary } from '../content/views';
import { EventsService } from '../events/events.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { grantItemReward } from '../rewards/grant';

/**
 * Monde familial : village partagé et missions coopératives hebdomadaires.
 * Tous les enfants y contribuent ensemble ; aucun classement n'est calculé ni exposé.
 */
@Injectable()
export class VillageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Ajoute des points au village et débloque les bâtiments atteints. */
  async addPoints(
    tx: Tx,
    familyId: string,
    points: number,
    effects: Effects,
    childId?: string | null,
  ): Promise<string[]> {
    if (points <= 0) return [];
    const village = await tx.village.upsert({
      where: { familyId },
      create: { familyId, points },
      update: { points: { increment: points } },
      include: { buildings: true },
    });
    const owned = new Set(village.buildings.map((b) => b.buildingId));
    const reached = unlockedBuildings(this.catalog.index.catalog.buildings, village.points).filter(
      (b) => !owned.has(b.key),
    );
    for (const building of reached) {
      await tx.villageBuilding.create({
        data: { villageId: village.id, buildingId: building.key },
      });
      await this.events.record(
        {
          familyId,
          childId: childId ?? null,
          type: 'BUILDING_UNLOCKED',
          payload: { buildingId: building.key, name: t(building.name), emoji: building.emoji },
        },
        tx,
      );
    }
    const newBuildings = reached.map((b) => b.key);
    effects.add(() =>
      this.realtime.toFamily(familyId, 'village:updated', { points: village.points, newBuildings }),
    );
    return newBuildings;
  }

  /** Fait progresser les missions familiales de la semaine pour un type d'objectif. */
  async trackGoal(
    tx: Tx,
    familyId: string,
    goalType: FamilyGoalType,
    effects: Effects,
    childId?: string | null,
    amount = 1,
  ): Promise<void> {
    const weekKey = isoWeekKey(new Date());
    const missions = this.catalog.index.catalog.familyMissions.filter(
      (m) => m.goalType === goalType,
    );
    for (const mission of missions) {
      const progress = await tx.familyMissionProgress.upsert({
        where: {
          familyId_familyMissionId_weekKey: { familyId, familyMissionId: mission.key, weekKey },
        },
        create: { familyId, familyMissionId: mission.key, weekKey, progress: amount },
        update: { progress: { increment: amount } },
      });
      if (progress.completedAt || progress.progress < mission.target) continue;
      // Garde contre la double complétion en cas d'accès concurrent.
      const claimed = await tx.familyMissionProgress.updateMany({
        where: { id: progress.id, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (claimed.count === 0) continue;
      const title = t(mission.title);
      await this.events.record(
        {
          familyId,
          childId: childId ?? null,
          type: 'FAMILY_MISSION_COMPLETED',
          payload: { familyMissionId: mission.key, title, rewardPoints: mission.rewardPoints },
        },
        tx,
      );
      await this.addPoints(tx, familyId, mission.rewardPoints, effects, childId);
      // Objet offert à chaque joueur de la famille (décoration commune à toute la famille).
      const rewardDef = mission.rewardItem
        ? this.catalog.index.items.get(mission.rewardItem)
        : undefined;
      if (rewardDef) {
        const players = await tx.playerProfile.findMany({
          where: { familyId },
          select: { id: true },
        });
        for (const player of players) {
          await grantItemReward(tx, rewardDef, {
            familyId,
            childId: player.id,
            source: 'FAMILY_MISSION',
            message: title,
          });
        }
      }
      effects.add(() =>
        this.realtime.toFamily(familyId, 'family-mission:completed', {
          title,
          rewardPoints: mission.rewardPoints,
        }),
      );
    }
  }

  async familyMissions(
    familyId: string,
  ): Promise<{ weekKey: string; missions: FamilyMissionView[] }> {
    const weekKey = isoWeekKey(new Date());
    const progress = await this.prisma.familyMissionProgress.findMany({
      where: { familyId, weekKey },
    });
    const byId = new Map(progress.map((p) => [p.familyMissionId, p]));
    return {
      weekKey,
      missions: this.catalog.index.catalog.familyMissions.map((m) => {
        const p = byId.get(m.key);
        return {
          id: m.key,
          title: t(m.title),
          description: t(m.description),
          icon: m.icon,
          goalType: m.goalType,
          target: m.target,
          progress: Math.min(m.target, p?.progress ?? 0),
          completed: Boolean(p?.completedAt),
          rewardPoints: m.rewardPoints,
        };
      }),
    };
  }

  async view(familyId: string): Promise<VillageView> {
    const [family, village, children] = await Promise.all([
      this.prisma.family.findUniqueOrThrow({ where: { id: familyId } }),
      this.prisma.village.upsert({
        where: { familyId },
        create: { familyId },
        update: {},
        include: { buildings: true },
      }),
      this.prisma.playerProfile.findMany({
        where: { familyId },
        orderBy: { createdAt: 'asc' },
        include: { creatures: { where: { isActive: true }, take: 1 } },
      }),
    ]);
    const unlockedAt = new Map(village.buildings.map((b) => [b.buildingId, b.unlockedAt]));
    const toView = (b: BuildingDefinition): BuildingView => ({
      id: b.key,
      name: t(b.name),
      description: t(b.description),
      emoji: b.emoji,
      requiredPoints: b.requiredPoints,
      position: b.position,
      unlocked: unlockedAt.has(b.key) || b.requiredPoints === 0,
      unlockedAt: unlockedAt.get(b.key)?.toISOString() ?? null,
    });
    const buildings = this.catalog.index.catalog.buildings.map(toView);
    const next = nextBuilding(this.catalog.index.catalog.buildings, village.points);
    const { weekKey, missions } = await this.familyMissions(familyId);
    const companions: Array<{ childAvatar: string; creature: CreatureSummary }> = [];
    for (const child of children) {
      const creature = child.creatures[0];
      if (creature)
        companions.push({
          childAvatar: child.avatar,
          creature: creatureSummary(creature, this.catalog.index),
        });
    }
    return {
      name: family.name,
      points: village.points,
      level: buildings.filter((b) => b.unlocked).length,
      buildings,
      next: next ? toView(next) : null,
      weekKey,
      familyMissions: missions,
      companions,
    };
  }
}
