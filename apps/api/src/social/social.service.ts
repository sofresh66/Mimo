import { Injectable } from '@nestjs/common';
import type { Creature, PlayerProfile, Prisma } from '@prisma/client';
import {
  FRIENDSHIP_LEVELS,
  SOCIAL_DAILY_PLAYS,
  SQUABBLE_COOLDOWN_DAYS,
  applyFriendshipDelta,
  createRng,
  friendshipLevel,
  pickSocialEvent,
  pointsToNextLevel,
  rollLoot,
  seedFrom,
  socialTickTimes,
  socialTicksDue,
  type FriendshipLevelKey,
  type Rng,
} from '@mimo/game-data';
import type {
  FriendView,
  PlayTogetherResult,
  PlayerType,
  SocialEventView,
  VisitView,
} from '@mimo/types';
import { randomInt } from 'node:crypto';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { creatureSummary } from '../content/views';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { grantItemReward } from '../rewards/grant';
import { RoomService } from '../room/room.service';

const DAY = 86_400_000;
/** Événements du journal social (les plus anciens sont nettoyés). */
export const SOCIAL_EVENT_TYPES = ['SOCIAL_INTERACTION', 'FRIENDSHIP_UP'] as const;
/** Taille maximale du journal social par profil. */
export const SOCIAL_JOURNAL_LIMIT = 50;

type CreatureWithOwner = Creature & {
  child: Pick<PlayerProfile, 'id' | 'displayName' | 'avatar' | 'color' | 'type' | 'familyId'>;
};

/** Données stockées dans `GameEvent.payload` (affichage figé au moment de l'interaction). */
interface SocialPayload {
  kind: SocialEventView['kind'];
  eventKey: string;
  icon: string;
  outgoing: boolean;
  friend: { creatureName: string; ownerName: string; profileId: string };
  item: SocialEventView['item'];
  loot: SocialEventView['loot'];
  delta: number;
  level: number;
  /** Interaction lancée par ce joueur lui-même (vécue en direct : pas « pendant ton absence »). */
  self?: boolean;
}

const levelKey = (level: number): FriendshipLevelKey =>
  FRIENDSHIP_LEVELS[Math.max(0, Math.min(level, FRIENDSHIP_LEVELS.length - 1))]?.key ?? 'STRANGERS';

/** Couple ordonné (ordre des octets, identique à la contrainte CHECK en base). */
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const includeOwner = {
  child: {
    select: { id: true, displayName: true, avatar: true, color: true, type: true, familyId: true },
  },
} as const;

/**
 * Relations et interactions entre les créatures d'une même famille. Tout est calculé côté
 * serveur : le client ne propose jamais de points, de butin ni de récompense. Les interactions
 * hors connexion sont générées à l'ouverture de l'accueil (comme la dérive des statistiques),
 * de façon idempotente : un rejeu ou deux ouvertures simultanées ne génèrent rien deux fois.
 */
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly inventory: InventoryService,
    private readonly room: RoomService,
    private readonly realtime: RealtimeService,
  ) {}

  // ─── Génération pendant l'absence ─────────────────────────────────────────

  async catchUp(childId: string, now = new Date()): Promise<void> {
    const profile = await this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } });
    const ticks = socialTicksDue(profile.socialTickAt, now);
    if (ticks === 0) return;
    const host = await this.prisma.creature.findFirst({
      where: { childId, isActive: true },
      include: includeOwner,
    });
    // Pas encore de compagnon : l'horloge démarre à l'adoption (rien à rattraper).
    if (!host) return;
    const partners = await this.partnersOf(profile.familyId, childId);
    // Transition gardée : une seule requête « réclame » ces interactions.
    const claimed = await this.prisma.playerProfile.updateMany({
      where: { id: childId, socialTickAt: profile.socialTickAt },
      data: { socialTickAt: now },
    });
    if (claimed.count === 0 || partners.length === 0) return;
    // Datées après la dernière consultation : elles apparaissent toujours dans « Pendant ton
    // absence… », même si le joueur est revenu entre deux générations.
    const seen = profile.socialSeenAt;
    const start =
      seen && (!profile.socialTickAt || seen > profile.socialTickAt) ? seen : profile.socialTickAt;
    for (const at of socialTickTimes(start, now, ticks)) {
      const rng = createRng(seedFrom(`${childId}|${at.toISOString()}`));
      const visitor = partners[Math.floor(rng() * partners.length)];
      if (!visitor) continue;
      await this.interact({ host, visitor, at, rng, playerInitiated: false });
    }
  }

  /** Créatures actives des AUTRES membres de la famille. */
  private partnersOf(familyId: string, childId: string): Promise<CreatureWithOwner[]> {
    return this.prisma.creature.findMany({
      where: { isActive: true, child: { familyId, id: { not: childId } } },
      include: includeOwner,
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Interaction ───────────────────────────────────────────────────────────

  /**
   * La créature `visitor` rend visite à `host` : choix de l'interaction, amitié, butin pour
   * l'hôte (généré par le jeu, jamais retiré au visiteur), visite, journal des deux joueurs.
   */
  private async interact(params: {
    host: CreatureWithOwner;
    visitor: CreatureWithOwner;
    at: Date;
    rng: Rng;
    playerInitiated: boolean;
  }): Promise<SocialEventView | null> {
    const { host, visitor, at, rng, playerInitiated } = params;
    const familyId = host.child.familyId;
    if (visitor.child.familyId !== familyId || visitor.childId === host.childId) {
      throw Errors.notFound('Créature');
    }
    const [aId, bId] = orderedPair(host.id, visitor.id);
    const index = this.catalog.index;
    const effects = new Effects();

    const views = await this.prisma.$transaction(async (tx) => {
      await tx.creatureRelation.createMany({
        data: [{ familyId, creatureAId: aId, creatureBId: bId }],
        skipDuplicates: true,
      });
      // Verrou de ligne : les interactions d'un même couple sont sérialisées.
      await tx.$queryRaw`SELECT id FROM "CreatureRelation"
        WHERE "creatureAId" = ${aId} AND "creatureBId" = ${bId} FOR UPDATE`;
      const relation = await tx.creatureRelation.findUniqueOrThrow({
        where: { creatureAId_creatureBId: { creatureAId: aId, creatureBId: bId } },
      });

      const day = at.toISOString().slice(0, 10);
      const playsToday = relation.playDay === day ? relation.playCount : 0;
      if (playerInitiated && playsToday >= SOCIAL_DAILY_PLAYS) {
        throw Errors.tooMany('SOCIAL_DAILY_LIMIT', 'Ils ont déjà beaucoup joué aujourd’hui !');
      }

      const hostProfile = await tx.playerProfile.findUniqueOrThrow({ where: { id: host.childId } });
      const owned = await this.room.ownedCounts(host.childId, tx);
      const byTag = this.room.tagsOf(this.room.layoutOf(hostProfile, owned));
      const level = Math.max(friendshipLevel(relation.points), relation.bestLevel);
      const event = pickSocialEvent(
        index.catalog.social.events,
        {
          level,
          hostTags: new Set(byTag.keys()),
          needsReconcile: relation.needsReconcile,
          canSquabble:
            !relation.lastSquabbleAt ||
            at.getTime() - relation.lastSquabbleAt.getTime() >= SQUABBLE_COOLDOWN_DAYS * DAY,
          playerInitiated,
        },
        rng,
      );
      if (!event) return null;

      const change = applyFriendshipDelta(
        { points: relation.points, bestLevel: relation.bestLevel },
        event.delta,
      );
      await tx.creatureRelation.update({
        where: { id: relation.id },
        data: {
          points: change.points,
          bestLevel: change.bestLevel,
          interactions: { increment: 1 },
          lastInteractionAt: at,
          ...(event.kind === 'SQUABBLE' ? { needsReconcile: true, lastSquabbleAt: at } : {}),
          ...(event.kind === 'RECONCILE' ? { needsReconcile: false } : {}),
          ...(playerInitiated ? { playDay: day, playCount: playsToday + 1 } : {}),
        },
      });

      // Objet placé auquel le visiteur réagit.
      const spots = event.requiresTag ? (byTag.get(event.requiresTag) ?? []) : [];
      const spot = spots.length > 0 ? spots[Math.floor(rng() * spots.length)] : undefined;
      const spotDef = spot ? index.items.get(spot.item) : undefined;
      const item = spotDef
        ? { id: spotDef.key, name: t(spotDef.name), emoji: spotDef.emoji }
        : null;

      // Cadeau ou trouvaille pour l'hôte, généré par le jeu.
      const loot = event.loot ? rollLoot(event.loot, rng) : { coins: 0, items: [] };
      await this.inventory.addCoins(tx, host.childId, loot.coins);
      await this.inventory.addItems(tx, host.childId, loot.items);
      const lootView = {
        coins: loot.coins,
        items: loot.items.flatMap(({ item: key, quantity }) => {
          const def = index.items.get(key);
          return def ? [{ id: key, name: t(def.name), emoji: def.emoji, quantity }] : [];
        }),
      };

      if (event.visitMinutes) {
        await tx.creatureVisit.create({
          data: {
            familyId,
            hostProfileId: host.childId,
            visitorCreatureId: visitor.id,
            eventKey: event.key,
            itemId: item?.id ?? null,
            startsAt: at,
            endsAt: new Date(at.getTime() + event.visitMinutes * 60_000),
          },
        });
      }

      const delta = change.points - relation.points;
      const common = { eventKey: event.key, icon: event.icon, item, delta, level: change.level };
      const hostPayload: SocialPayload = {
        ...common,
        kind: event.kind,
        outgoing: false,
        friend: friendOf(visitor),
        loot: lootView,
        ...(playerInitiated ? { self: true } : {}),
      };
      const visitorPayload: SocialPayload = {
        ...common,
        kind: event.kind,
        outgoing: true,
        friend: friendOf(host),
        loot: { coins: 0, items: [] },
      };
      const [hostEvent, visitorEvent] = await Promise.all([
        this.recordSocial(tx, familyId, host.childId, 'SOCIAL_INTERACTION', hostPayload, at),
        this.recordSocial(tx, familyId, visitor.childId, 'SOCIAL_INTERACTION', visitorPayload, at),
      ]);
      await this.reachLevels(tx, change.reachedLevels, { host, visitor, at });
      return { hostEvent, visitorEvent };
    });

    if (!views) return null;
    // L'autre joueur, s'il est connecté, voit l'interaction immédiatement.
    effects.add(() => this.realtime.toChild(visitor.childId, 'social:event', views.visitorEvent));
    await effects.flush();
    return views.hostEvent;
  }

  /** Nouveaux niveaux d'amitié : journal des deux joueurs + récompenses éventuelles. */
  private async reachLevels(
    tx: Tx,
    levels: number[],
    ctx: { host: CreatureWithOwner; visitor: CreatureWithOwner; at: Date },
  ): Promise<void> {
    const familyId = ctx.host.child.familyId;
    for (const level of levels) {
      const reward = this.catalog.index.catalog.social.levelRewards.find((r) => r.level === level);
      const rewardDef = reward ? this.catalog.index.items.get(reward.item) : undefined;
      for (const [self, other] of [
        [ctx.host, ctx.visitor],
        [ctx.visitor, ctx.host],
      ] as const) {
        await this.recordSocial(
          tx,
          familyId,
          self.childId,
          'FRIENDSHIP_UP',
          {
            kind: 'FRIENDSHIP_UP',
            eventKey: 'friendship_up',
            icon: '❤️',
            outgoing: false,
            friend: friendOf(other),
            item: rewardDef
              ? { id: rewardDef.key, name: t(rewardDef.name), emoji: rewardDef.emoji }
              : null,
            loot: { coins: 0, items: [] },
            delta: 0,
            level,
          },
          ctx.at,
        );
        if (rewardDef) {
          await grantItemReward(tx, rewardDef, {
            familyId,
            childId: self.childId,
            source: 'FRIENDSHIP',
            message: `${self.name} ❤️ ${other.name}`,
          });
        }
      }
    }
  }

  private async recordSocial(
    tx: Tx,
    familyId: string,
    childId: string,
    type: (typeof SOCIAL_EVENT_TYPES)[number],
    payload: SocialPayload,
    at: Date,
  ): Promise<SocialEventView> {
    const row = await tx.gameEvent.create({
      data: {
        familyId,
        childId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdAt: at,
      },
    });
    return toView(row.id, payload, row.createdAt);
  }

  // ─── Actions du joueur ─────────────────────────────────────────────────────

  /** « Jouer ensemble » : la créature d'un autre membre de la famille vient jouer chez soi. */
  async playTogether(childId: string, friendCreatureId: string): Promise<PlayTogetherResult> {
    const host = await this.prisma.creature.findFirst({
      where: { childId, isActive: true },
      include: includeOwner,
    });
    if (!host) throw Errors.badRequest('NO_CREATURE', 'Adopte d’abord ton compagnon');
    const visitor = await this.prisma.creature.findFirst({
      where: {
        id: friendCreatureId,
        isActive: true,
        child: { familyId: host.child.familyId, id: { not: childId } },
      },
      include: includeOwner,
    });
    // Même réponse pour une créature inconnue, inactive ou d'une autre famille.
    if (!visitor) throw Errors.notFound('Créature');
    const event = await this.interact({
      host,
      visitor,
      at: new Date(),
      rng: createRng(randomInt(0, 2 ** 31)),
      playerInitiated: true,
    });
    if (!event) throw Errors.badRequest('NO_INTERACTION', 'Pas d’envie de jouer pour le moment');
    const friend = (await this.friends(childId)).find((f) => f.creature.id === visitor.id);
    if (!friend) throw Errors.notFound('Créature');
    return { event, friend };
  }

  // ─── Lecture ───────────────────────────────────────────────────────────────

  /** Relations de la créature active avec celles des autres membres de la famille. */
  async friends(childId: string): Promise<FriendView[]> {
    const host = await this.prisma.creature.findFirst({
      where: { childId, isActive: true },
      include: includeOwner,
    });
    if (!host) return [];
    const partners = await this.partnersOf(host.child.familyId, childId);
    if (partners.length === 0) return [];
    const relations = await this.prisma.creatureRelation.findMany({
      where: { OR: [{ creatureAId: host.id }, { creatureBId: host.id }] },
    });
    const byOther = new Map(
      relations.map((r) => [r.creatureAId === host.id ? r.creatureBId : r.creatureAId, r]),
    );
    const today = new Date().toISOString().slice(0, 10);
    const index = this.catalog.index;
    return partners
      .map((p): FriendView => {
        const r = byOther.get(p.id);
        const points = r?.points ?? 0;
        const level = Math.max(friendshipLevel(points), r?.bestLevel ?? 0);
        const played = r && r.playDay === today ? r.playCount : 0;
        return {
          creature: creatureSummary(p, index),
          owner: {
            id: p.child.id,
            displayName: p.child.displayName,
            avatar: p.child.avatar,
            color: p.child.color,
            type: p.child.type as PlayerType,
          },
          level,
          levelKey: levelKey(level),
          hearts: FRIENDSHIP_LEVELS[level]?.hearts ?? 0,
          points,
          toNextLevel: pointsToNextLevel(points),
          playsLeft: Math.max(0, SOCIAL_DAILY_PLAYS - played),
        };
      })
      .sort((a, b) => a.owner.displayName.localeCompare(b.owner.displayName, 'fr'));
  }

  /** Journal social récent du joueur. */
  async journal(childId: string, limit = 30): Promise<SocialEventView[]> {
    const rows = await this.prisma.gameEvent.findMany({
      where: { childId, type: { in: [...SOCIAL_EVENT_TYPES] } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, SOCIAL_JOURNAL_LIMIT),
    });
    return rows.map((r) => toView(r.id, r.payload as unknown as SocialPayload, r.createdAt));
  }

  /** Interactions survenues depuis la dernière consultation (« Pendant ton absence… »). */
  async unseen(childId: string, seenAt: Date | null): Promise<SocialEventView[]> {
    const rows = await this.prisma.gameEvent.findMany({
      where: {
        childId,
        type: { in: [...SOCIAL_EVENT_TYPES] },
        ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    return rows
      .filter((r) => (r.payload as unknown as SocialPayload).self !== true)
      .slice(0, 8)
      .reverse()
      .map((r) => toView(r.id, r.payload as unknown as SocialPayload, r.createdAt));
  }

  async markSeen(childId: string): Promise<void> {
    await this.prisma.playerProfile.update({
      where: { id: childId },
      data: { socialSeenAt: new Date() },
    });
  }

  /** Visite en cours dans l'espace du joueur (la plus récente). */
  async activeVisit(
    childId: string,
    layout: Array<{ item: { id: string }; x: number; y: number }>,
    now = new Date(),
  ): Promise<VisitView | null> {
    const host = await this.prisma.playerProfile.findUniqueOrThrow({
      where: { id: childId },
      select: { familyId: true },
    });
    const visit = await this.prisma.creatureVisit.findFirst({
      where: {
        hostProfileId: childId,
        startsAt: { lte: now },
        endsAt: { gt: now },
        // Isolation : le visiteur appartient toujours à la famille de l'hôte.
        familyId: host.familyId,
        visitorCreature: { child: { familyId: host.familyId, id: { not: childId } } },
      },
      orderBy: { startsAt: 'desc' },
      include: { visitorCreature: { include: includeOwner } },
    });
    if (!visit) return null;
    const visitor = visit.visitorCreature;
    const def = this.catalog.index.socialEvents.get(visit.eventKey);
    const spot = visit.itemId ? layout.find((p) => p.item.id === visit.itemId) : undefined;
    const itemDef = spot ? this.catalog.index.items.get(spot.item.id) : undefined;
    return {
      id: visit.id,
      visitor: creatureSummary(visitor, this.catalog.index),
      owner: { displayName: visitor.child.displayName, type: visitor.child.type as PlayerType },
      eventKey: visit.eventKey,
      icon: def?.icon ?? '💌',
      item:
        spot && itemDef
          ? { id: itemDef.key, name: t(itemDef.name), emoji: itemDef.emoji, x: spot.x, y: spot.y }
          : null,
      endsAt: visit.endsAt.toISOString(),
    };
  }

  // ─── Nettoyage ─────────────────────────────────────────────────────────────

  /**
   * Visites terminées depuis 7 jours ; interactions au-delà de 60 jours ou de 50 entrées par
   * profil. Les paliers d'amitié (rares, visibles dans l'historique parent) sont conservés.
   */
  async prune(now = new Date()): Promise<{ visits: number; events: number }> {
    const visits = await this.prisma.creatureVisit.deleteMany({
      where: { endsAt: { lt: new Date(now.getTime() - 7 * DAY) } },
    });
    const old = await this.prisma.gameEvent.deleteMany({
      where: {
        type: 'SOCIAL_INTERACTION',
        createdAt: { lt: new Date(now.getTime() - 60 * DAY) },
      },
    });
    const capped = await this.prisma.$executeRaw`
      DELETE FROM "GameEvent" WHERE id IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY "childId" ORDER BY "createdAt" DESC) AS rank
          FROM "GameEvent"
          WHERE type = 'SOCIAL_INTERACTION' AND "childId" IS NOT NULL
        ) ranked WHERE rank > ${SOCIAL_JOURNAL_LIMIT}
      )`;
    return { visits: visits.count, events: old.count + capped };
  }
}

function friendOf(c: CreatureWithOwner): SocialPayload['friend'] {
  return { creatureName: c.name, ownerName: c.child.displayName, profileId: c.child.id };
}

function toView(id: string, p: SocialPayload, createdAt: Date): SocialEventView {
  return {
    id,
    kind: p.kind,
    eventKey: p.eventKey,
    icon: p.icon,
    outgoing: p.outgoing,
    friend: { creatureName: p.friend.creatureName, ownerName: p.friend.ownerName },
    item: p.item ?? null,
    loot: p.loot ?? { coins: 0, items: [] },
    delta: p.delta ?? 0,
    level: p.level ?? 0,
    levelKey: levelKey(p.level ?? 0),
    createdAt: createdAt.toISOString(),
  };
}
