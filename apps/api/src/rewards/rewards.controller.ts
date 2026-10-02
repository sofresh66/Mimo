import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { ItemView, RewardOpenResult, RewardView } from '@mimo/types';
import type { AuthContext } from '../auth/auth.types';
import { Auth, PlayerId, PlayerOnly, FamilyId, ParentOnly } from '../auth/decorators';
import { CatalogService } from '../content/catalog.service';
import { itemView } from '../content/views';
import { isGiftableItem } from '../missions/missions.service';
import { CreateRewardDto, RewardsService } from './rewards.service';

@ParentOnly()
@Controller('rewards')
export class ParentRewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly catalog: CatalogService,
  ) {}

  @Get()
  sent(@FamilyId() familyId: string) {
    return this.rewards.sentByFamily(familyId);
  }

  /** Objets pouvant être offerts (coffres, nourriture, accessoires, décorations). */
  @Get('giftable-items')
  giftable(): ItemView[] {
    return this.catalog.index.catalog.items.filter(isGiftableItem).map(itemView);
  }

  @Post()
  create(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Body() dto: CreateRewardDto,
  ): Promise<RewardView> {
    return this.rewards.create(auth, familyId, dto);
  }
}

@PlayerOnly()
@Controller('me/rewards')
export class ChildRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  pending(@PlayerId() childId: string): Promise<RewardView[]> {
    return this.rewards.pendingForChild(childId);
  }

  @HttpCode(200)
  @Post(':id/open')
  open(@PlayerId() childId: string, @Param('id') id: string): Promise<RewardOpenResult> {
    return this.rewards.open(childId, id);
  }
}
