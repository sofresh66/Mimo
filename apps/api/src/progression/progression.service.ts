import { Injectable } from '@nestjs/common';
import type { XpCategory, XpSource } from '@prisma/client';
import { levelFromTotalXp, resolveEvolution, stageRank } from '@mimo/game-data';
import type { ProgressOutcome } from '@mimo/types';
import { Effects } from '../common/effects';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { CATEGORY_COLUMN, categoryXpOf } from '../content/views';
import { EventsService } from '../events/events.service';
import type { Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface GrantXpInput {
  familyId: string;
  childId: string;
  amount: number;
  category: XpCategory;
  source: XpSource;
  sourceId?: string | null;
}

/** Pièces offertes à chaque niveau, et coffre offert tous les LEVEL_CHEST_EVERY niveaux. */
export const LEVEL_UP_COINS = 10;
export const LEVEL_CHEST_EVERY = 5;

/**
 * Cœur de la progression : gain d'XP → niveau → évolution → Créaturopédie.
 * Toutes les opérations se font dans la transaction de l'appelant.
 */
@Injectable()
export class ProgressionService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly realtime: RealtimeService,
  ) {}

  async grantXp(tx: Tx, input: GrantXpInput, effects: Effects): Promise<ProgressOutcome | null> {
    const amount = Math.max(0, Math.round(input.amount));
    // Verrou de ligne : deux gains simultanés (mission + mini-jeu…) ne s'écrasent pas.
    const active = await tx.creature.findFirst({
      where: { childId: input.childId, isActive: true },
      select: { id: true },
    });
    if (active) await tx.$queryRaw`SELECT id FROM "Creature" WHERE id = ${active.id} FOR UPDATE`;
    const creature = active ? await tx.creature.findUnique({ where: { id: active.id } }) : null;
    await tx.xPEvent.create({
      data: {
        childId: input.childId,
        creatureId: creature?.id ?? null,
        amount,
        category: input.category,
        source: input.source,
        sourceId: input.sourceId ?? null,
      },
    });
    if (!creature || amount === 0) return null;

    const totalXp = creature.totalXp + amount;
    const levelBefore = creature.level;
    const levelAfter = levelFromTotalXp(totalXp);
    const column = CATEGORY_COLUMN[input.category];
    const categoryXp = { ...categoryXpOf(creature), [input.category]: creature[column] + amount };

    // L'évolution n'est réévaluée que si le niveau change ou si une forme spéciale est possible.
    const index = this.catalog.index;
    const currentForm = index.form(creature.formId);
    let nextFormId = creature.formId;
    if (levelAfter !== levelBefore || (levelAfter >= 12 && currentForm.stage !== 'SPECIAL')) {
      const [recipesDiscovered, explorationsCompleted, missionsCompleted] = await Promise.all([
        tx.recipeDiscovery.count({ where: { childId: input.childId } }),
        tx.exploration.count({ where: { childId: input.childId, status: 'COMPLETED' } }),
        tx.missionCompletion.count({ where: { childId: input.childId, status: 'APPROVED' } }),
      ]);
      nextFormId = resolveEvolution(index.catalog.evolutions, {
        species: creature.speciesId,
        currentFormKey: creature.formId,
        level: levelAfter,
        categoryXp,
        recipesDiscovered,
        explorationsCompleted,
        missionsCompleted,
      }).key;
    }
    const nextForm = index.form(nextFormId);
    const evolved = nextFormId !== creature.formId;
    const hatched = evolved && currentForm.stage === 'EGG';

    await tx.creature.update({
      where: { id: creature.id },
      data: {
        totalXp,
        level: levelAfter,
        [column]: { increment: amount },
        ...(evolved ? { formId: nextFormId } : {}),
        ...(hatched ? { hatchedAt: new Date() } : {}),
      },
    });

    const base = { familyId: input.familyId, childId: input.childId };
    await this.events.record(
      {
        ...base,
        type: 'XP_GAINED',
        payload: { amount, category: input.category, source: input.source },
      },
      tx,
    );

    if (levelAfter > levelBefore) {
      await this.events.record(
        { ...base, type: 'LEVEL_UP', payload: { creatureName: creature.name, level: levelAfter } },
        tx,
      );
      await tx.inventory.upsert({
        where: { childId: input.childId },
        create: { childId: input.childId, coins: LEVEL_UP_COINS * (levelAfter - levelBefore) },
        update: { coins: { increment: LEVEL_UP_COINS * (levelAfter - levelBefore) } },
      });
      for (let level = levelBefore + 1; level <= levelAfter; level += 1) {
        if (level % LEVEL_CHEST_EVERY === 0) {
          await tx.reward.create({
            data: {
              ...base,
              type: 'ITEM',
              source: 'LEVEL_UP',
              itemId: level >= 20 ? 'chest_epic' : 'chest_rare',
              amount: 1,
              message: `Niveau ${level} !`,
            },
          });
        }
      }
    }

    if (evolved) {
      await this.discover(tx, input.familyId, nextFormId, input.childId);
      await this.events.record(
        {
          ...base,
          type: hatched ? 'CREATURE_HATCHED' : 'EVOLUTION',
          payload: {
            creatureName: creature.name,
            fromFormId: creature.formId,
            toFormId: nextFormId,
            toName: t(nextForm.name),
            stage: nextForm.stage,
          },
        },
        tx,
      );
    }

    effects.add(() =>
      this.realtime.toChild(input.childId, 'creature:updated', { childId: input.childId }),
    );

    return {
      xpGained: amount,
      category: input.category,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
      hatched,
      evolution:
        evolved && stageRank(nextForm.stage) >= stageRank(currentForm.stage)
          ? {
              fromFormId: creature.formId,
              toFormId: nextFormId,
              toName: t(nextForm.name),
              stage: nextForm.stage,
            }
          : null,
    };
  }

  /** Ajoute une forme à la Créaturopédie familiale (sans effet si déjà connue). */
  async discover(tx: Tx, familyId: string, formId: string, childId: string | null): Promise<void> {
    await tx.creaturedexEntry.upsert({
      where: { familyId_formId: { familyId, formId } },
      create: { familyId, formId, discoveredByChildId: childId },
      update: {},
    });
  }
}
