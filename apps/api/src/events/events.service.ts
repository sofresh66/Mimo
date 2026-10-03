import { Injectable } from '@nestjs/common';
import type { GameEventType, Prisma } from '@prisma/client';
import type { GameEventView } from '@mimo/types';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface RecordEvent {
  familyId: string;
  childId?: string | null;
  type: GameEventType;
  payload?: Record<string, unknown>;
  /** Date de l'événement (ex. interaction survenue pendant l'absence du joueur). */
  createdAt?: Date;
}

/**
 * Journal des événements de jeu (MISSION_COMPLETED, LEVEL_UP, EVOLUTION…).
 * Il alimente l'historique parent et pourra servir de timeline enfant.
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: RecordEvent, tx: Tx = this.prisma): Promise<void> {
    await tx.gameEvent.create({
      data: {
        familyId: event.familyId,
        childId: event.childId ?? null,
        type: event.type,
        payload: (event.payload ?? {}) as Prisma.InputJsonValue,
        ...(event.createdAt ? { createdAt: event.createdAt } : {}),
      },
    });
  }

  async recordMany(events: RecordEvent[], tx: Tx = this.prisma): Promise<void> {
    if (events.length === 0) return;
    await tx.gameEvent.createMany({
      data: events.map((e) => ({
        familyId: e.familyId,
        childId: e.childId ?? null,
        type: e.type,
        payload: (e.payload ?? {}) as Prisma.InputJsonValue,
        ...(e.createdAt ? { createdAt: e.createdAt } : {}),
      })),
    });
  }

  async timeline(params: {
    familyId: string;
    childId?: string;
    types?: GameEventType[];
    limit?: number;
    before?: Date;
  }): Promise<GameEventView[]> {
    const events = await this.prisma.gameEvent.findMany({
      where: {
        familyId: params.familyId,
        ...(params.childId ? { childId: params.childId } : {}),
        ...(params.types ? { type: { in: params.types } } : {}),
        ...(params.before ? { createdAt: { lt: params.before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.limit ?? 30, 100),
      include: { child: { select: { id: true, displayName: true, avatar: true } } },
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      child: e.child,
      payload: e.payload as Record<string, unknown>,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
