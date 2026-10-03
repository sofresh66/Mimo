import { Injectable, Logger } from '@nestjs/common';
import { applyDelta, startOfUtcDay } from '@mimo/game-data';
import type {
  ChildHome,
  CreatureView,
  DexView,
  FeedResult,
  HatchResult,
  SpeciesView,
} from '@mimo/types';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { appearanceOf, creatureView, currentStats, itemView } from '../content/views';
import { EventsService } from '../events/events.service';
import { ExplorationsService } from '../explorations/explorations.service';
import { InventoryService } from '../inventory/inventory.service';
import { LettersService } from '../letters/letters.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { RoomService } from '../room/room.service';
import { SocialService } from '../social/social.service';

/** Jouer avec son compagnon : effets et petite XP plafonnée par jour. */
export const PLAY_EFFECT = { happiness: 10, energy: -6, curiosity: 3 };
export const PLAY_XP = 3;
export const PLAY_XP_DAILY_LIMIT = 5;
export const PLAY_MIN_ENERGY = 6;

@Injectable()
export class CreaturesService {
  private readonly logger = new Logger(CreaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly progression: ProgressionService,
    private readonly inventory: InventoryService,
    private readonly explorations: ExplorationsService,
    private readonly room: RoomService,
    private readonly social: SocialService,
    private readonly letters: LettersService,
  ) {}

  async home(childId: string): Promise<ChildHome> {
    await this.explorations.completeDueForChild(childId);
    // Interactions entre créatures survenues pendant l'absence (idempotent). Une erreur ici ne
    // doit jamais empêcher l'enfant d'ouvrir son accueil.
    await this.social.catchUp(childId).catch((error: unknown) => {
      this.logger.error(`Interactions sociales non générées : ${String(error)}`);
    });
    const [child, creature, inventory, pendingRewards, current, unseen, owned] = await Promise.all([
      this.prisma.playerProfile.update({
        where: { id: childId },
        data: { lastSeenAt: new Date() },
      }),
      this.prisma.creature.findFirst({ where: { childId, isActive: true } }),
      this.prisma.inventory.findUnique({ where: { childId } }),
      this.prisma.reward.count({ where: { childId, status: 'PENDING' } }),
      this.explorations.current(childId),
      this.explorations.unseen(childId),
      this.room.ownedCounts(childId),
    ]);
    const index = this.catalog.index;
    const room = this.room.roomView(child, owned);
    const [visit, socialUnseen, mail] = await Promise.all([
      this.social.activeVisit(childId, room.layout),
      this.social.unseen(childId, child.socialSeenAt),
      this.letters.summary({ kind: 'profile', familyId: child.familyId, profileId: childId }),
    ]);
    return {
      child: {
        id: child.id,
        displayName: child.displayName,
        avatar: child.avatar,
        color: child.color,
      },
      creature: creature ? creatureView(creature, index, current?.status === 'IN_PROGRESS') : null,
      coins: inventory?.coins ?? 0,
      pendingRewards,
      missionsTodo: 0,
      exploration: current,
      unseenExploration: unseen,
      roomDecorations: child.roomDecorations
        .filter((key) => index.items.has(key))
        .map((key) => itemView(index.item(key))),
      room,
      visit,
      socialUnseen,
      mail,
    };
  }

  species(): SpeciesView[] {
    const index = this.catalog.index;
    return index.catalog.species
      .filter((s) => s.starter)
      .map((s) => {
        const egg = index.formsOf(s.key).find((f) => f.stage === 'BABY') ?? index.formsOf(s.key)[0];
        if (!egg) throw new Error(`Espèce sans forme : ${s.key}`);
        return {
          id: s.key,
          name: t(s.name),
          description: t(s.description),
          emoji: s.emoji,
          appearance: appearanceOf(egg),
        };
      });
  }

  async adopt(childId: string, speciesId: string, name: string): Promise<CreatureView> {
    const species = this.catalog.index.species.get(speciesId);
    if (!species?.starter) throw Errors.badRequest('INVALID_SPECIES', 'Espèce inconnue');
    const egg = this.catalog.index.formsOf(speciesId).find((f) => f.stage === 'EGG');
    if (!egg) throw Errors.badRequest('INVALID_SPECIES', 'Espèce inconnue');
    const creature = await this.prisma.$transaction(async (tx) => {
      const child = await tx.playerProfile.findUniqueOrThrow({ where: { id: childId } });
      if ((await tx.creature.count({ where: { childId } })) > 0) {
        throw Errors.conflict('ALREADY_ADOPTED', 'Tu as déjà un compagnon');
      }
      const created = await tx.creature.create({
        data: { childId, speciesId, formId: egg.key, name, isActive: true },
      });
      await this.progression.discover(tx, child.familyId, egg.key, childId);
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'CREATURE_ADOPTED',
          payload: { creatureName: name, speciesId, emoji: species.emoji },
        },
        tx,
      );
      return created;
    });
    return creatureView(creature, this.catalog.index, false);
  }

  async list(childId: string): Promise<CreatureView[]> {
    const creatures = await this.prisma.creature.findMany({
      where: { childId },
      orderBy: { createdAt: 'asc' },
      include: { explorations: { where: { status: 'IN_PROGRESS' }, select: { id: true } } },
    });
    return creatures.map((c) => creatureView(c, this.catalog.index, c.explorations.length > 0));
  }

  async activate(childId: string, creatureId: string): Promise<CreatureView> {
    const creature = await this.prisma.$transaction(async (tx) => {
      const target = await tx.creature.findFirst({ where: { id: creatureId, childId } });
      if (!target) throw Errors.notFound('Compagnon');
      await tx.creature.updateMany({
        where: { childId, isActive: true },
        data: { isActive: false },
      });
      return tx.creature.update({ where: { id: target.id }, data: { isActive: true } });
    });
    return creatureView(creature, this.catalog.index, false);
  }

  /** Jouer avec son compagnon : toujours positif, un peu fatigant. */
  async play(childId: string): Promise<FeedResult> {
    const effects = new Effects();
    const result = await this.prisma.$transaction(async (tx) => {
      const child = await tx.playerProfile.findUniqueOrThrow({ where: { id: childId } });
      const creature = await this.requireActive(tx, childId);
      if (
        (await tx.exploration.count({
          where: { creatureId: creature.id, status: 'IN_PROGRESS' },
        })) > 0
      ) {
        throw Errors.badRequest('CREATURE_EXPLORING', 'Ton compagnon est en exploration');
      }
      const stats = currentStats(creature);
      if (stats.energy < PLAY_MIN_ENERGY) {
        throw Errors.badRequest('CREATURE_SLEEPY', 'Ton compagnon a besoin d’une petite sieste');
      }
      await tx.creature.update({
        where: { id: creature.id },
        data: { ...applyDelta(stats, PLAY_EFFECT), statsUpdatedAt: new Date() },
      });
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'CREATURE_PLAYED',
          payload: { creatureName: creature.name },
        },
        tx,
      );
      const playedToday = await tx.xPEvent.count({
        where: { childId, source: 'PLAY', createdAt: { gte: startOfUtcDay(new Date()) } },
      });
      const outcome =
        playedToday < PLAY_XP_DAILY_LIMIT
          ? await this.progression.grantXp(
              tx,
              {
                familyId: child.familyId,
                childId,
                amount: PLAY_XP,
                category: 'CREATIVITY',
                source: 'PLAY',
              },
              effects,
            )
          : null;
      const updated = await tx.creature.findUniqueOrThrow({ where: { id: creature.id } });
      return { updated, outcome };
    });
    await effects.flush();
    return {
      creature: creatureView(result.updated, this.catalog.index, false),
      effect: PLAY_EFFECT,
      outcome: result.outcome,
    };
  }

  /** Fait éclore un oeuf spécial trouvé en exploration : un nouveau compagnon rejoint l'enfant. */
  async hatch(childId: string, itemId: string, name: string): Promise<HatchResult> {
    const def = this.catalog.index.items.get(itemId);
    const speciesId = def?.hatchesSpecies;
    if (!def || !speciesId) throw Errors.badRequest('NOT_AN_EGG', 'Ce n’est pas un oeuf');
    const babyForm = this.catalog.index.formsOf(speciesId).find((f) => f.stage === 'EGG');
    if (!babyForm) throw Errors.badRequest('NOT_AN_EGG', 'Ce n’est pas un oeuf');
    const creature = await this.prisma.$transaction(async (tx) => {
      const child = await tx.playerProfile.findUniqueOrThrow({ where: { id: childId } });
      await this.inventory.removeItem(tx, childId, itemId, 1);
      const hasActive = (await tx.creature.count({ where: { childId, isActive: true } })) > 0;
      const created = await tx.creature.create({
        data: { childId, speciesId, formId: babyForm.key, name, isActive: !hasActive },
      });
      await this.progression.discover(tx, child.familyId, babyForm.key, childId);
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'CREATURE_ADOPTED',
          payload: { creatureName: name, speciesId, fromEgg: itemId },
        },
        tx,
      );
      return created;
    });
    return { creature: creatureView(creature, this.catalog.index, false) };
  }

  /** Créaturopédie familiale : les formes inconnues restent « ??? ». */
  async dex(childId: string): Promise<DexView> {
    const child = await this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } });
    const discovered = new Set(
      (await this.prisma.creaturedexEntry.findMany({ where: { familyId: child.familyId } })).map(
        (e) => e.formId,
      ),
    );
    const index = this.catalog.index;
    const knownSpecies = new Set(
      index.catalog.evolutions.filter((f) => discovered.has(f.key)).map((f) => f.species),
    );
    const entries = index.catalog.evolutions.map((f) => {
      const known = discovered.has(f.key);
      return {
        id: f.key,
        speciesId: f.species,
        stage: f.stage,
        discovered: known,
        name: known ? t(f.name) : null,
        description: known ? t(f.description) : null,
        hint: !known && knownSpecies.has(f.species) ? t(f.hint) : null,
        appearance: known ? appearanceOf(f) : null,
      };
    });
    return {
      discovered: entries.filter((e) => e.discovered).length,
      total: entries.length,
      entries,
    };
  }

  private async requireActive(tx: Tx, childId: string) {
    const creature = await tx.creature.findFirst({ where: { childId, isActive: true } });
    if (!creature) throw Errors.badRequest('NO_CREATURE', 'Adopte d’abord un compagnon');
    return creature;
  }
}
