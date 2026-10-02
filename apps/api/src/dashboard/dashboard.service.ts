import { Injectable } from '@nestjs/common';
import type { GameEventType } from '@prisma/client';
import { XP_CATEGORIES, emptyCategoryXp, isoWeekRange, type XpCategory } from '@mimo/game-data';
import type {
  ChildDetail,
  ChildOverview,
  GameEventView,
  MissionSuggestion,
  ParentDashboard,
} from '@mimo/types';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { categoryXpOf, creatureSummary, creatureView } from '../content/views';
import { EngineClient } from '../engine/engine.client';
import { EventsService } from '../events/events.service';
import { MissionsService } from '../missions/missions.service';
import { PrismaService } from '../prisma/prisma.service';
import { VillageService } from '../village/village.service';

/** Événements affichés dans l'historique parent (les gains d'XP unitaires sont masqués). */
export const PARENT_TIMELINE_TYPES: GameEventType[] = [
  'CREATURE_ADOPTED',
  'CREATURE_HATCHED',
  'MISSION_REQUESTED',
  'MISSION_COMPLETED',
  'LEVEL_UP',
  'EVOLUTION',
  'RECIPE_DISCOVERED',
  'CHEST_OPENED',
  'EXPLORATION_COMPLETED',
  'GAME_PLAYED',
  'MATERIAL_DONATED',
  'BUILDING_UNLOCKED',
  'FAMILY_MISSION_COMPLETED',
  'ITEM_BOUGHT',
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly missions: MissionsService,
    private readonly village: VillageService,
    private readonly engine: EngineClient,
  ) {}

  async dashboard(familyId: string): Promise<ParentDashboard> {
    const [family, children, pending, recent, villageView] = await Promise.all([
      this.prisma.family.findUniqueOrThrow({ where: { id: familyId } }),
      this.overviews(familyId),
      this.missions.pending(familyId),
      this.events.timeline({ familyId, types: PARENT_TIMELINE_TYPES, limit: 15 }),
      this.village.view(familyId),
    ]);
    return {
      family: { id: family.id, name: family.name },
      children,
      pending,
      recent,
      village: { points: villageView.points, level: villageView.level, next: villageView.next },
      familyMissions: villageView.familyMissions,
    };
  }

  /** Vue d'ensemble de chaque enfant — agrégats calculés en peu de requêtes groupées. */
  async overviews(familyId: string, onlyChildId?: string): Promise<ChildOverview[]> {
    const children = await this.prisma.playerProfile.findMany({
      where: { familyId, ...(onlyChildId ? { id: onlyChildId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { creatures: { where: { isActive: true }, take: 1 } },
    });
    if (children.length === 0) return [];
    const ids = children.map((c) => c.id);
    const { start } = isoWeekRange(new Date());
    const [totals, week, xpWeek, pending, explorations, recipes] = await Promise.all([
      this.prisma.missionCompletion.groupBy({
        by: ['childId'],
        where: { childId: { in: ids }, status: 'APPROVED' },
        _count: true,
      }),
      this.prisma.missionCompletion.groupBy({
        by: ['childId'],
        where: { childId: { in: ids }, status: 'APPROVED', reviewedAt: { gte: start } },
        _count: true,
      }),
      this.prisma.xPEvent.groupBy({
        by: ['childId'],
        where: { childId: { in: ids }, createdAt: { gte: start } },
        _sum: { amount: true },
      }),
      this.prisma.missionCompletion.groupBy({
        by: ['childId'],
        where: { childId: { in: ids }, status: 'PENDING' },
        _count: true,
      }),
      this.prisma.exploration.groupBy({
        by: ['childId'],
        where: { childId: { in: ids }, status: 'COMPLETED' },
        _count: true,
      }),
      this.prisma.recipeDiscovery.groupBy({
        by: ['childId'],
        where: { childId: { in: ids } },
        _count: true,
      }),
    ]);
    const count = (rows: Array<{ childId: string; _count: number }>, id: string) =>
      rows.find((r) => r.childId === id)?._count ?? 0;

    return children.map((child) => {
      const creature = child.creatures[0];
      return {
        id: child.id,
        type: child.type,
        displayName: child.displayName,
        avatar: child.avatar,
        color: child.color,
        lastSeenAt: child.lastSeenAt?.toISOString() ?? null,
        creature: creature ? creatureSummary(creature, this.catalog.index) : null,
        level: creature?.level ?? 0,
        totalXp: creature?.totalXp ?? 0,
        categoryXp: creature ? categoryXpOf(creature) : emptyCategoryXp(),
        missionsCompletedTotal: count(totals, child.id),
        missionsCompletedWeek: count(week, child.id),
        xpWeek: xpWeek.find((r) => r.childId === child.id)?._sum.amount ?? 0,
        pendingCount: count(pending, child.id),
        explorationsCompleted: count(explorations, child.id),
        recipesDiscovered: count(recipes, child.id),
      };
    });
  }

  async child(familyId: string, childId: string): Promise<ChildDetail> {
    const [overview] = await this.overviews(familyId, childId);
    if (!overview) throw Errors.notFound('Profil');
    const [creatures, recentXp, history] = await Promise.all([
      this.prisma.creature.findMany({ where: { childId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.xPEvent.findMany({
        where: { childId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.events.timeline({ familyId, childId, types: PARENT_TIMELINE_TYPES, limit: 40 }),
    ]);
    return {
      overview,
      creatures: creatures.map((c) => creatureView(c, this.catalog.index, false)),
      recentXp: recentXp.map((x) => ({
        id: x.id,
        amount: x.amount,
        category: x.category,
        source: x.source,
        createdAt: x.createdAt.toISOString(),
      })),
      history,
    };
  }

  history(familyId: string, childId?: string, before?: Date): Promise<GameEventView[]> {
    return this.events.timeline({
      familyId,
      childId,
      types: PARENT_TIMELINE_TYPES,
      limit: 50,
      before,
    });
  }

  /**
   * Suggestions de missions pour équilibrer les activités d'un enfant.
   * Calculées par le moteur Python, avec un repli local simple.
   */
  async suggestions(familyId: string, childId: string): Promise<MissionSuggestion[]> {
    const [overview] = await this.overviews(familyId, childId);
    if (!overview) throw Errors.notFound('Profil');
    const templates = this.catalog.index.catalog.missionTemplates;
    const fromEngine = await this.engine.post<{
      suggestions: Array<{ template_id: string; reason: string }>;
    }>('/v1/recommendations/missions', {
      category_xp: overview.categoryXp,
      templates: templates.map((m) => ({ id: m.key, category: m.category })),
      limit: 3,
    });
    const picks =
      fromEngine?.suggestions ??
      leastDeveloped(overview.categoryXp)
        .slice(0, 3)
        .map((category) => ({
          template_id: templates.find((m) => m.category === category)?.key ?? '',
          reason: 'Pour découvrir de nouvelles activités',
        }));
    return picks.flatMap((p) => {
      const template = this.catalog.index.missionTemplates.get(p.template_id);
      return template
        ? [
            {
              templateId: template.key,
              title: t(template.title),
              icon: template.icon,
              category: template.category,
              reason: p.reason,
            },
          ]
        : [];
    });
  }
}

function leastDeveloped(xp: Record<XpCategory, number>): XpCategory[] {
  return [...XP_CATEGORIES].sort((a, b) => xp[a] - xp[b]);
}
