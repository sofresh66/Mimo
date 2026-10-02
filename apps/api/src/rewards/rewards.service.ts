import { Injectable } from '@nestjs/common';
import type { Reward, User } from '@prisma/client';
import { XP_CATEGORIES, createRng, rollLoot, type LootResult } from '@mimo/game-data';
import type { RewardOpenResult, RewardView } from '@mimo/types';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { randomInt } from 'node:crypto';
import type { AuthContext } from '../auth/auth.types';
import { Effects } from '../common/effects';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { itemView, lootView } from '../content/views';
import { EventsService } from '../events/events.service';
import { InventoryService } from '../inventory/inventory.service';
import { isGiftableItem } from '../missions/missions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { RealtimeService } from '../realtime/realtime.service';

export class CreateRewardDto {
  @IsString()
  childId!: string;

  @IsIn(['XP', 'COINS', 'ITEM'])
  type!: 'XP' | 'COINS' | 'ITEM';

  @ValidateIf((o: CreateRewardDto) => o.type === 'ITEM')
  @IsString()
  itemId?: string;

  @ValidateIf((o: CreateRewardDto) => o.type === 'XP')
  @IsIn(XP_CATEGORIES)
  category?: (typeof XP_CATEGORIES)[number];

  @IsInt()
  @Min(1)
  @Max(100)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  message?: string;
}

type RewardWithCreator = Reward & { createdBy: Pick<User, 'displayName'> | null };

/** Cadeaux à ouvrir : envoyés par un parent ou gagnés (mission, niveau, mission familiale). */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
    private readonly inventory: InventoryService,
    private readonly progression: ProgressionService,
    private readonly realtime: RealtimeService,
  ) {}

  private view(r: RewardWithCreator): RewardView {
    const def = r.itemId ? this.catalog.index.items.get(r.itemId) : undefined;
    return {
      id: r.id,
      type: r.type,
      source: r.source,
      item: def ? itemView(def) : null,
      amount: r.amount,
      message: r.message,
      fromName: r.createdBy?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async create(auth: AuthContext, familyId: string, dto: CreateRewardDto): Promise<RewardView> {
    const child = await this.prisma.playerProfile.findFirst({
      where: { id: dto.childId, familyId },
    });
    if (!child) throw Errors.notFound('Profil');
    if (dto.type === 'ITEM' && !isGiftableItem(this.catalog.index.items.get(dto.itemId ?? ''))) {
      throw Errors.badRequest('INVALID_ITEM', 'Objet invalide');
    }
    const amount = dto.type === 'ITEM' ? Math.min(dto.amount, 10) : dto.amount;
    const reward = await this.prisma.reward.create({
      data: {
        familyId,
        childId: child.id,
        type: dto.type,
        source: 'PARENT',
        itemId: dto.type === 'ITEM' ? dto.itemId : null,
        xpCategory: dto.type === 'XP' ? (dto.category ?? 'HELPING') : null,
        amount,
        message: dto.message || null,
        createdById: auth.userId,
      },
      include: { createdBy: { select: { displayName: true } } },
    });
    const view = this.view(reward);
    this.realtime.toChild(child.id, 'reward:received', view);
    return view;
  }

  async sentByFamily(
    familyId: string,
  ): Promise<Array<RewardView & { childId: string; claimed: boolean }>> {
    const list = await this.prisma.reward.findMany({
      where: { familyId, source: 'PARENT' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { createdBy: { select: { displayName: true } } },
    });
    return list.map((r) => ({
      ...this.view(r),
      childId: r.childId,
      claimed: r.status === 'CLAIMED',
    }));
  }

  async pendingForChild(childId: string): Promise<RewardView[]> {
    const list = await this.prisma.reward.findMany({
      where: { childId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { displayName: true } } },
    });
    return list.map((r) => this.view(r));
  }

  /** Ouvre un cadeau. Un coffre est ouvert directement (une seule animation). */
  async open(childId: string, rewardId: string): Promise<RewardOpenResult> {
    const effects = new Effects();
    const result = await this.prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findFirst({
        where: { id: rewardId, childId },
        include: { createdBy: { select: { displayName: true } } },
      });
      if (!reward) throw Errors.notFound('Cadeau');
      const claimed = await tx.reward.updateMany({
        where: { id: reward.id, status: 'PENDING' },
        data: { status: 'CLAIMED', claimedAt: new Date() },
      });
      if (claimed.count === 0) throw Errors.conflict('ALREADY_OPENED', 'Ce cadeau est déjà ouvert');

      let loot: LootResult = { coins: 0, items: [] };
      let outcome = null;
      if (reward.type === 'COINS') {
        loot = { coins: reward.amount, items: [] };
        await this.inventory.addCoins(tx, childId, reward.amount);
      } else if (reward.type === 'XP') {
        outcome = await this.progression.grantXp(
          tx,
          {
            familyId: reward.familyId,
            childId,
            amount: reward.amount,
            category: reward.xpCategory ?? 'HELPING',
            source: 'REWARD',
            sourceId: reward.id,
          },
          effects,
        );
      } else if (reward.itemId) {
        const def = this.catalog.index.items.get(reward.itemId);
        if (def?.category === 'CHEST' && def.loot) {
          loot = rollLoot(def.loot, createRng(randomInt(2 ** 31)));
          for (let i = 1; i < reward.amount; i += 1) {
            const extra = rollLoot(def.loot, createRng(randomInt(2 ** 31)));
            loot = { coins: loot.coins + extra.coins, items: [...loot.items, ...extra.items] };
          }
          await this.events.record(
            {
              familyId: reward.familyId,
              childId,
              type: 'CHEST_OPENED',
              payload: { itemId: def.key, name: t(def.name), emoji: def.emoji, rarity: def.rarity },
            },
            tx,
          );
        } else {
          loot = { coins: 0, items: [{ item: reward.itemId, quantity: reward.amount }] };
        }
        await this.inventory.grantLoot(tx, reward.familyId, childId, loot, { rewardId: reward.id });
      }
      await this.events.record(
        {
          familyId: reward.familyId,
          childId,
          type: 'REWARD_RECEIVED',
          payload: {
            rewardId: reward.id,
            type: reward.type,
            source: reward.source,
            amount: reward.amount,
          },
        },
        tx,
      );
      return { reward, loot, outcome };
    });
    await effects.flush();
    return {
      reward: this.view(result.reward),
      loot: lootView(result.loot, this.catalog.index),
      outcome: result.outcome,
    };
  }
}
