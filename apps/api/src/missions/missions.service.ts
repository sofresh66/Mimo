import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Mission, type MissionCompletion, type PlayerType } from '@prisma/client';
import { VILLAGE_POINTS, type ItemDefinition } from '@mimo/game-data';
import type {
  ChildMissionView,
  MissionTemplateView,
  MissionValidatedPayload,
  MissionView,
  PendingCompletionView,
} from '@mimo/types';
import { APP_CONFIG, type AppConfig } from '../config/env';
import type { AuthContext } from '../auth/auth.types';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { itemView } from '../content/views';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { RealtimeService } from '../realtime/realtime.service';
import { VillageService } from '../village/village.service';
import type { CreateMissionDto, UpdateMissionDto } from './dto';
import { periodKey } from './period';

/**
 * Missions visibles par un profil : un enfant voit les missions familiales (sans destinataire)
 * et les siennes ; un adulte joueur ne voit QUE les missions qui lui sont attribuées.
 */
export function assignedTo(profile: { id: string; type: PlayerType }): Prisma.MissionWhereInput {
  return profile.type === 'CHILD'
    ? { OR: [{ assignedChildId: null }, { assignedChildId: profile.id }] }
    : { assignedChildId: profile.id };
}

/**
 * Objets qu'un parent peut attacher en récompense (les légendaires restent à découvrir).
 * Les décors et papiers à lettres restent des récompenses de progression : seuls ceux prévus
 * comme récompense de quête (source « mission ») peuvent être offerts ; les souvenirs jamais.
 */
export function isGiftableItem(def: ItemDefinition | undefined): def is ItemDefinition {
  if (!def || def.rarity === 'LEGENDARY') return false;
  if (def.category === 'BACKGROUND' || def.category === 'STATIONERY') {
    return def.scene?.unlock.some((u) => u.kind === 'mission') ?? false;
  }
  return (
    ['CHEST', 'FOOD', 'ACCESSORY', 'DECORATION', 'OBJECT'].includes(def.category) && !def.unique
  );
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly progression: ProgressionService,
    private readonly inventory: InventoryService,
    private readonly village: VillageService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ─── Vues ──────────────────────────────────────────────────────────────────

  private view(m: Mission): MissionView {
    const reward = m.rewardItemId ? this.catalog.index.items.get(m.rewardItemId) : undefined;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      category: m.category,
      icon: m.icon,
      xp: m.xp,
      coins: m.coins,
      recurrence: m.recurrence,
      rewardItem: reward ? itemView(reward) : null,
      assignedChildId: m.assignedChildId,
      isActive: m.isActive,
      templateId: m.templateId,
    };
  }

  templates(): MissionTemplateView[] {
    return this.catalog.index.catalog.missionTemplates.map((m) => ({
      id: m.key,
      title: t(m.title),
      description: t(m.description),
      category: m.category,
      xp: m.xp,
      coins: m.coins,
      icon: m.icon,
    }));
  }

  // ─── Parent ────────────────────────────────────────────────────────────────

  async list(familyId: string): Promise<MissionView[]> {
    const missions = await this.prisma.mission.findMany({
      where: { familyId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return missions.map((m) => this.view(m));
  }

  async create(auth: AuthContext, familyId: string, dto: CreateMissionDto): Promise<MissionView> {
    await this.validateRefs(familyId, dto.assignedChildId, dto.rewardItemId, dto.templateId);
    const mission = await this.prisma.mission.create({
      data: {
        familyId,
        createdById: auth.userId,
        title: dto.title,
        description: dto.description || null,
        category: dto.category,
        icon: dto.icon,
        xp: dto.xp,
        coins: dto.coins,
        recurrence: dto.recurrence,
        assignedChildId: dto.assignedChildId ?? null,
        rewardItemId: dto.rewardItemId ?? null,
        templateId: dto.templateId ?? null,
      },
    });
    this.realtime.toFamily(familyId, 'missions:changed');
    return this.view(mission);
  }

  async update(familyId: string, id: string, dto: UpdateMissionDto): Promise<MissionView> {
    await this.findMission(familyId, id);
    await this.validateRefs(familyId, dto.assignedChildId, dto.rewardItemId, undefined);
    const mission = await this.prisma.mission.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description === undefined ? undefined : dto.description || null,
        category: dto.category,
        icon: dto.icon,
        xp: dto.xp,
        coins: dto.coins,
        recurrence: dto.recurrence,
        assignedChildId: dto.assignedChildId,
        rewardItemId: dto.rewardItemId,
        isActive: dto.isActive,
      },
    });
    this.realtime.toFamily(familyId, 'missions:changed');
    return this.view(mission);
  }

  async remove(familyId: string, id: string): Promise<void> {
    await this.findMission(familyId, id);
    await this.prisma.mission.delete({ where: { id } });
    this.realtime.toFamily(familyId, 'missions:changed');
  }

  async pending(familyId: string): Promise<PendingCompletionView[]> {
    const list = await this.prisma.missionCompletion.findMany({
      where: { status: 'PENDING', mission: { familyId } },
      orderBy: { requestedAt: 'asc' },
      include: { mission: true, child: true },
    });
    return list.map((c) => this.pendingView(c, c.mission, c.child));
  }

  /** Validation d'une demande « C'est fait ! » envoyée par l'enfant. */
  async approve(
    auth: AuthContext,
    familyId: string,
    completionId: string,
  ): Promise<MissionValidatedPayload> {
    const completion = await this.prisma.missionCompletion.findFirst({
      where: { id: completionId, mission: { familyId } },
    });
    if (!completion) throw Errors.notFound('Demande');
    if (completion.status !== 'PENDING') {
      throw Errors.conflict('ALREADY_REVIEWED', 'Cette mission a déjà été traitée');
    }
    return this.validate(auth, familyId, completion.missionId, completion.childId, completion.id);
  }

  /** Validation directe par le parent (sans demande préalable de l'enfant). */
  async validateForChild(
    auth: AuthContext,
    familyId: string,
    missionId: string,
    childId: string,
  ): Promise<MissionValidatedPayload> {
    return this.validate(auth, familyId, missionId, childId, null);
  }

  /** Refus bienveillant : la mission redevient simplement disponible. */
  async decline(auth: AuthContext, familyId: string, completionId: string): Promise<void> {
    const completion = await this.prisma.missionCompletion.findFirst({
      where: { id: completionId, mission: { familyId }, status: 'PENDING' },
    });
    if (!completion) throw Errors.notFound('Demande');
    await this.prisma.missionCompletion.update({
      where: { id: completion.id },
      data: { status: 'DECLINED', reviewedAt: new Date(), reviewedById: auth.userId },
    });
    this.realtime.toChild(completion.childId, 'missions:changed');
    this.realtime.toParents(familyId, 'missions:changed');
  }

  private async validate(
    auth: AuthContext,
    familyId: string,
    missionId: string,
    childId: string,
    completionId: string | null,
  ): Promise<MissionValidatedPayload> {
    const mission = await this.findMission(familyId, missionId);
    if (mission.assignedChildId && mission.assignedChildId !== childId) {
      throw Errors.badRequest('NOT_ASSIGNED', 'Cette mission est destinée à un autre enfant');
    }
    const child = await this.prisma.playerProfile.findFirst({ where: { id: childId, familyId } });
    if (!child) throw Errors.notFound('Profil');
    if (!mission.assignedChildId && child.type !== 'CHILD') {
      throw Errors.badRequest('NOT_ASSIGNED', 'Cette mission est destinée aux enfants');
    }
    const parent = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const period = periodKey(mission.recurrence, new Date(), this.config.timezone);
    const effects = new Effects();

    const payload = await this.prisma.$transaction(async (tx) => {
      const data = {
        status: 'APPROVED' as const,
        reviewedAt: new Date(),
        reviewedById: auth.userId,
        xpAwarded: mission.xp,
        coinsAwarded: mission.coins,
      };
      let completion: MissionCompletion;
      if (completionId) {
        // Transition gardée : impossible de valider deux fois la même demande.
        const claimed = await tx.missionCompletion.updateMany({
          where: { id: completionId, status: 'PENDING' },
          data,
        });
        if (claimed.count === 0)
          throw Errors.conflict('ALREADY_REVIEWED', 'Cette mission a déjà été traitée');
        completion = await tx.missionCompletion.findUniqueOrThrow({ where: { id: completionId } });
      } else {
        const existing = await tx.missionCompletion.findUnique({
          where: { missionId_childId_periodKey: { missionId, childId, periodKey: period } },
        });
        if (existing?.status === 'APPROVED') {
          throw Errors.conflict('ALREADY_COMPLETED', 'Mission déjà validée pour cette période');
        }
        if (existing) {
          // Transition gardée : deux validations simultanées ne peuvent pas aboutir toutes les deux.
          const claimed = await tx.missionCompletion.updateMany({
            where: { id: existing.id, status: { not: 'APPROVED' } },
            data,
          });
          if (claimed.count === 0) {
            throw Errors.conflict('ALREADY_COMPLETED', 'Mission déjà validée pour cette période');
          }
          completion = await tx.missionCompletion.findUniqueOrThrow({ where: { id: existing.id } });
        } else {
          try {
            completion = await tx.missionCompletion.create({
              data: { missionId, childId, periodKey: period, ...data },
            });
          } catch (error) {
            // Création concurrente pour la même période (contrainte d'unicité).
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              throw Errors.conflict('ALREADY_COMPLETED', 'Mission déjà validée pour cette période');
            }
            throw error;
          }
        }
      }

      const outcome = await this.progression.grantXp(
        tx,
        {
          familyId,
          childId,
          amount: mission.xp,
          category: mission.category,
          source: 'MISSION',
          sourceId: completion.id,
        },
        effects,
      );
      await this.inventory.addCoins(tx, childId, mission.coins);
      let rewardCreated = false;
      if (mission.rewardItemId && this.catalog.index.items.has(mission.rewardItemId)) {
        await tx.reward.create({
          data: {
            familyId,
            childId,
            type: 'ITEM',
            source: 'MISSION',
            itemId: mission.rewardItemId,
            amount: 1,
            message: mission.title,
            createdById: auth.userId,
          },
        });
        rewardCreated = true;
      }
      await this.events.record(
        {
          familyId,
          childId,
          type: 'MISSION_COMPLETED',
          payload: {
            missionId,
            missionTitle: mission.title,
            icon: mission.icon,
            xp: mission.xp,
            coins: mission.coins,
            category: mission.category,
            parentName: parent.displayName,
          },
        },
        tx,
      );
      await this.village.addPoints(tx, familyId, VILLAGE_POINTS.missionCompleted, effects, childId);
      await this.village.trackGoal(tx, familyId, 'MISSIONS_COMPLETED', effects, childId);

      const result: MissionValidatedPayload = {
        completionId: completion.id,
        missionTitle: mission.title,
        missionIcon: mission.icon,
        parentName: parent.displayName,
        xp: mission.xp,
        coins: mission.coins,
        category: mission.category,
        outcome,
        rewardCreated,
      };
      return result;
    });

    effects.add(() => this.realtime.toChild(childId, 'mission:validated', payload));
    effects.add(() => this.realtime.toParents(familyId, 'missions:changed'));
    await effects.flush();
    return payload;
  }

  // ─── Enfant ────────────────────────────────────────────────────────────────

  async forChild(childId: string): Promise<ChildMissionView[]> {
    const child = await this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } });
    const missions = await this.prisma.mission.findMany({
      where: { familyId: child.familyId, isActive: true, ...assignedTo(child) },
      orderBy: { createdAt: 'asc' },
    });
    const now = new Date();
    const keys = missions.map((m) => ({
      missionId: m.id,
      periodKey: periodKey(m.recurrence, now, this.config.timezone),
    }));
    const completions = keys.length
      ? await this.prisma.missionCompletion.findMany({ where: { childId, OR: keys } })
      : [];
    const byKey = new Map(completions.map((c) => [`${c.missionId}|${c.periodKey}`, c]));
    return (
      missions
        .map((m, i) => {
          const completion = byKey.get(`${m.id}|${keys[i]?.periodKey}`);
          const status = completion?.status ?? 'TODO';
          return {
            ...this.view(m),
            status,
            completionId: completion?.id ?? null,
          } as ChildMissionView;
        })
        // Une mission unique déjà validée disparaît de la liste.
        .filter((m, i) => !(missions[i]?.recurrence === 'ONCE' && m.status === 'APPROVED'))
    );
  }

  async todoCount(childId: string): Promise<number> {
    return (await this.forChild(childId)).filter(
      (m) => m.status === 'TODO' || m.status === 'DECLINED',
    ).length;
  }

  /**
   * Le joueur (enfant ou adulte joueur) indique qu'il a réalisé la mission : un PARENT doit
   * valider. Seul l'espace parent peut valider ; un joueur ne valide jamais sa propre mission.
   */
  async requestValidation(childId: string, missionId: string): Promise<ChildMissionView[]> {
    const child = await this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } });
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, familyId: child.familyId, isActive: true, ...assignedTo(child) },
    });
    if (!mission) throw Errors.notFound('Mission');
    const period = periodKey(mission.recurrence, new Date(), this.config.timezone);
    const completion = await this.prisma.$transaction(async (tx: Tx) => {
      const existing = await tx.missionCompletion.findUnique({
        where: { missionId_childId_periodKey: { missionId, childId, periodKey: period } },
      });
      if (existing?.status === 'APPROVED')
        throw Errors.conflict('ALREADY_COMPLETED', 'Déjà validée, bravo !');
      if (existing?.status === 'PENDING') return existing;
      const saved = existing
        ? await tx.missionCompletion.update({
            where: { id: existing.id },
            data: {
              status: 'PENDING',
              requestedAt: new Date(),
              reviewedAt: null,
              reviewedById: null,
            },
          })
        : await tx.missionCompletion.create({
            data: {
              missionId,
              childId,
              periodKey: period,
              status: 'PENDING',
              requestedAt: new Date(),
            },
          });
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'MISSION_REQUESTED',
          payload: { missionId, missionTitle: mission.title, icon: mission.icon },
        },
        tx,
      );
      return saved;
    });
    this.realtime.toParents(
      child.familyId,
      'mission:requested',
      this.pendingView(completion, mission, child),
    );
    return this.forChild(childId);
  }

  // ─── Utilitaires ───────────────────────────────────────────────────────────

  private pendingView(
    c: MissionCompletion,
    m: Mission,
    child: { id: string; displayName: string; avatar: string; color: string; type: PlayerType },
  ): PendingCompletionView {
    return {
      id: c.id,
      mission: {
        id: m.id,
        title: m.title,
        icon: m.icon,
        xp: m.xp,
        coins: m.coins,
        category: m.category,
      },
      child: {
        id: child.id,
        displayName: child.displayName,
        avatar: child.avatar,
        color: child.color,
        type: child.type,
      },
      requestedAt: c.requestedAt?.toISOString() ?? null,
    };
  }

  private async findMission(familyId: string, id: string): Promise<Mission> {
    const mission = await this.prisma.mission.findFirst({ where: { id, familyId } });
    if (!mission) throw Errors.notFound('Mission');
    return mission;
  }

  private async validateRefs(
    familyId: string,
    childId: string | null | undefined,
    rewardItemId: string | null | undefined,
    templateId: string | undefined,
  ): Promise<void> {
    if (childId) {
      const child = await this.prisma.playerProfile.findFirst({ where: { id: childId, familyId } });
      if (!child) throw Errors.badRequest('INVALID_CHILD', 'Profil inconnu');
    }
    if (rewardItemId && !isGiftableItem(this.catalog.index.items.get(rewardItemId))) {
      throw Errors.badRequest('INVALID_ITEM', 'Récompense invalide');
    }
    if (templateId && !this.catalog.index.missionTemplates.has(templateId)) {
      throw Errors.badRequest('INVALID_TEMPLATE', 'Modèle inconnu');
    }
  }
}
