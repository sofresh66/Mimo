import { Injectable } from '@nestjs/common';
import { startOfUtcDay } from '@mimo/game-data';
import type { CompanionAction, CompanionResponse, CompanionStatus } from '@mimo/types';
import { randomInt } from 'node:crypto';
import { currentLocale, t } from '../common/locale';
import { Errors } from '../common/errors';
import { CatalogService } from '../content/catalog.service';
import { EngineClient } from '../engine/engine.client';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

export const COMPANION_DAILY_LIMIT = 20;

interface EngineCompanionResponse {
  title: string;
  text: string;
  answer: string | null;
}

/** Contenu de repli, utilisé si le moteur Python est indisponible. */
const FALLBACK: Record<CompanionAction, EngineCompanionResponse[]> = {
  story: [
    {
      title: 'La graine magique',
      text: 'Un matin, {creature} trouva une graine qui brillait. {child} et {creature} la plantèrent ensemble, l’arrosèrent chaque jour… et un arbre couvert de fruits étoilés poussa jusqu’aux nuages !',
      answer: null,
    },
  ],
  riddle: [
    {
      title: 'Énigme',
      text: 'Plus j’ai de gardiens, moins je suis gardé. Qui suis-je ?',
      answer: 'Un secret',
    },
    {
      title: 'Énigme',
      text: 'Je commence la nuit et je termine le matin. Qui suis-je ?',
      answer: 'La lettre N',
    },
  ],
  math: [
    {
      title: 'Défi de maths',
      text: 'Si {creature} a 3 pommes et en trouve 4 autres, combien en a-t-il ?',
      answer: '7',
    },
  ],
  fact: [
    {
      title: 'Le savais-tu ?',
      text: 'Les pieuvres ont trois cœurs et du sang bleu !',
      answer: null,
    },
    {
      title: 'Le savais-tu ?',
      text: 'Le miel ne se périme presque jamais : on en a trouvé de très ancien encore mangeable.',
      answer: null,
    },
  ],
  joke: [
    {
      title: 'Blague',
      text: 'Pourquoi les poissons détestent-ils l’ordinateur ? Parce qu’ils ont peur du net !',
      answer: null,
    },
  ],
};

/**
 * Compagnon « intelligent » à actions prédéfinies : jamais de chat libre.
 * Le contrôle parental (activation et actions autorisées) est vérifié côté serveur.
 */
@Injectable()
export class CompanionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly engine: EngineClient,
    private readonly events: EventsService,
  ) {}

  async status(childId: string): Promise<CompanionStatus> {
    const child = await this.prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      include: { family: true },
    });
    return {
      enabled: child.family.companionEnabled,
      allowedActions: child.family.companionAllowedActions as CompanionAction[],
    };
  }

  async ask(childId: string, action: CompanionAction): Promise<CompanionResponse> {
    const child = await this.prisma.childProfile.findUniqueOrThrow({
      where: { id: childId },
      include: { family: true, creatures: { where: { isActive: true }, take: 1 } },
    });
    if (!child.family.companionEnabled || !child.family.companionAllowedActions.includes(action)) {
      throw Errors.forbidden('Cette activité n’est pas activée par tes parents');
    }
    const usedToday = await this.prisma.gameEvent.count({
      where: { childId, type: 'COMPANION_USED', createdAt: { gte: startOfUtcDay(new Date()) } },
    });
    if (usedToday >= COMPANION_DAILY_LIMIT) {
      throw Errors.tooMany('COMPANION_LIMIT', 'Ton compagnon se repose, reviens demain !');
    }
    const creature = child.creatures[0];
    const species = creature ? this.catalog.index.species.get(creature.speciesId) : undefined;
    const context = {
      child_name: child.displayName,
      creature_name: creature?.name ?? 'Mimo',
      species: species ? t(species.name) : null,
      level: creature?.level ?? 1,
      locale: currentLocale(),
      seed: randomInt(2 ** 31),
    };
    const fromEngine = await this.engine.post<EngineCompanionResponse>(
      `/v1/companion/${action}`,
      context,
    );
    const content = fromEngine ?? this.fallback(action, context.creature_name, child.displayName);
    await this.events.record({
      familyId: child.familyId,
      childId,
      type: 'COMPANION_USED',
      payload: { action, source: fromEngine ? 'engine' : 'fallback' },
    });
    return { action, ...content, source: fromEngine ? 'engine' : 'fallback' };
  }

  private fallback(
    action: CompanionAction,
    creature: string,
    child: string,
  ): EngineCompanionResponse {
    const options = FALLBACK[action];
    const picked = options[randomInt(options.length)] as EngineCompanionResponse;
    const fill = (s: string) => s.replaceAll('{creature}', creature).replaceAll('{child}', child);
    return { title: picked.title, text: fill(picked.text), answer: picked.answer };
  }
}
