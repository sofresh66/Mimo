import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  VILLAGE_POINTS,
  applyDelta,
  startOfUtcDay,
  type MiniGameDefinition,
} from '@mimo/game-data';
import type {
  MathDifficulty,
  MiniGameInfo,
  MiniGameResult,
  MiniGameStartResponse,
  MiniGameSubmission,
} from '@mimo/types';
import { randomInt } from 'node:crypto';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { currentStats } from '../content/views';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { VillageService } from '../village/village.service';
import { generateChallenge, scoreSubmission, type StoredChallenge } from './generators';

/**
 * Mini-jeux courts (1 à 3 minutes). Anti-farm :
 * - un nombre limité de parties récompensées par jour et par jeu ;
 * - une durée minimale plausible ;
 * - le score est recalculé côté serveur à partir du défi qu'il a lui-même généré.
 */
@Injectable()
export class MinigamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly progression: ProgressionService,
    private readonly village: VillageService,
  ) {}

  private game(key: string): MiniGameDefinition {
    const game = this.catalog.index.miniGames.get(key);
    if (!game) throw Errors.notFound('Mini-jeu');
    return game;
  }

  private async rewardedToday(childId: string, gameKey: string): Promise<number> {
    return this.prisma.gameSession.count({
      where: {
        childId,
        gameKey,
        xpAwarded: { gt: 0 },
        startedAt: { gte: startOfUtcDay(new Date()) },
      },
    });
  }

  async list(childId: string): Promise<MiniGameInfo[]> {
    return Promise.all(
      this.catalog.index.catalog.miniGames.map(async (g) => ({
        key: g.key,
        name: t(g.name),
        description: t(g.description),
        emoji: g.emoji,
        category: g.category,
        maxXp: g.maxXp,
        dailyRewardedSessions: g.dailyRewardedSessions,
        rewardedSessionsLeft: Math.max(
          0,
          g.dailyRewardedSessions - (await this.rewardedToday(childId, g.key)),
        ),
      })),
    );
  }

  async start(
    childId: string,
    key: string,
    difficulty: MathDifficulty,
  ): Promise<MiniGameStartResponse> {
    const game = this.game(key);
    const challenge = generateChallenge(game.key, randomInt(2 ** 31), difficulty);
    const session = await this.prisma.gameSession.create({
      data: {
        childId,
        gameKey: game.key,
        challenge: challenge as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      sessionId: session.id,
      gameKey: game.key,
      challenge: challenge.public,
      rewarded: (await this.rewardedToday(childId, game.key)) < game.dailyRewardedSessions,
    };
  }

  async submit(
    childId: string,
    sessionId: string,
    submission: MiniGameSubmission,
  ): Promise<MiniGameResult> {
    const session = await this.prisma.gameSession.findFirst({ where: { id: sessionId, childId } });
    if (!session) throw Errors.notFound('Partie');
    if (session.status !== 'STARTED')
      throw Errors.conflict('GAME_FINISHED', 'Cette partie est terminée');
    const game = this.game(session.gameKey);
    const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
    if (elapsed > game.maxDurationSeconds) {
      await this.prisma.gameSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw Errors.badRequest('GAME_EXPIRED', 'Cette partie a expiré');
    }

    let scored;
    try {
      scored = scoreSubmission(session.challenge as unknown as StoredChallenge, submission);
    } catch {
      throw Errors.badRequest('INVALID_SUBMISSION', 'Réponse invalide');
    }
    const plausible = elapsed >= game.minDurationSeconds;
    const effects = new Effects();

    const result = await this.prisma.$transaction(async (tx) => {
      // Sérialise les soumissions d'un même enfant pour un même jeu : le plafond quotidien
      // ne peut pas être contourné en soumettant plusieurs parties en parallèle.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${childId}:${game.key}`}))`;
      const child = await tx.childProfile.findUniqueOrThrow({ where: { id: childId } });
      const rewardedCount = await tx.gameSession.count({
        where: {
          childId,
          gameKey: game.key,
          xpAwarded: { gt: 0 },
          startedAt: { gte: startOfUtcDay(new Date()) },
        },
      });
      const rewarded = plausible && scored.score > 0 && rewardedCount < game.dailyRewardedSessions;
      const xp = rewarded
        ? Math.max(1, Math.round((game.maxXp * scored.score) / scored.maxScore))
        : 0;

      const closed = await tx.gameSession.updateMany({
        where: { id: session.id, status: 'STARTED' },
        data: { status: 'COMPLETED', completedAt: new Date(), score: scored.score, xpAwarded: xp },
      });
      if (closed.count === 0) throw Errors.conflict('GAME_FINISHED', 'Cette partie est terminée');

      const creature = await tx.creature.findFirst({ where: { childId, isActive: true } });
      if (creature) {
        await tx.creature.update({
          where: { id: creature.id },
          data: {
            ...applyDelta(currentStats(creature), {
              energy: -game.energyCost,
              curiosity: 4,
              happiness: 3,
            }),
            statsUpdatedAt: new Date(),
          },
        });
      }
      const outcome = xp
        ? await this.progression.grantXp(
            tx,
            {
              familyId: child.familyId,
              childId,
              amount: xp,
              category: game.category,
              source: 'MINIGAME',
              sourceId: session.id,
            },
            effects,
          )
        : null;
      await this.events.record(
        {
          familyId: child.familyId,
          childId,
          type: 'GAME_PLAYED',
          payload: {
            gameKey: game.key,
            name: t(game.name),
            score: scored.score,
            maxScore: scored.maxScore,
            xp,
          },
        },
        tx,
      );
      if (rewarded) {
        await this.village.addPoints(
          tx,
          child.familyId,
          VILLAGE_POINTS.gamePlayed,
          effects,
          childId,
        );
        await this.village.trackGoal(tx, child.familyId, 'GAMES_PLAYED', effects, childId);
      }
      return { xp, rewarded, outcome };
    });
    await effects.flush();
    return {
      score: scored.score,
      maxScore: scored.maxScore,
      xpAwarded: result.xp,
      rewarded: result.rewarded,
      corrections: scored.corrections,
      outcome: result.outcome,
    };
  }

  /** Expire les parties abandonnées (tâche de maintenance). */
  async expireStale(): Promise<number> {
    const { count } = await this.prisma.gameSession.updateMany({
      where: { status: 'STARTED', startedAt: { lt: new Date(Date.now() - 3_600_000) } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }
}
