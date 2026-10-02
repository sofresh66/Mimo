import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  ChildDetail,
  GameEventView,
  MissionSuggestion,
  ParentDashboard,
  VillageView,
} from '@mimo/types';
import { PlayerId, PlayerOnly, FamilyId, ParentOnly } from '../auth/decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { VillageService } from '../village/village.service';
import { DashboardService } from './dashboard.service';

@ParentOnly()
@Controller('parent')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly village: VillageService,
  ) {}

  @Get('dashboard')
  overview(@FamilyId() familyId: string): Promise<ParentDashboard> {
    return this.dashboard.dashboard(familyId);
  }

  @Get('children/:id')
  child(@FamilyId() familyId: string, @Param('id') id: string): Promise<ChildDetail> {
    return this.dashboard.child(familyId, id);
  }

  @Get('children/:id/suggestions')
  suggestions(@FamilyId() familyId: string, @Param('id') id: string): Promise<MissionSuggestion[]> {
    return this.dashboard.suggestions(familyId, id);
  }

  @Get('history')
  history(
    @FamilyId() familyId: string,
    @Query('childId') childId?: string,
    @Query('before') before?: string,
  ): Promise<GameEventView[]> {
    const date = before ? new Date(before) : undefined;
    if (date && Number.isNaN(date.getTime()))
      throw Errors.badRequest('VALIDATION_ERROR', 'Date invalide');
    return this.dashboard.history(familyId, childId, date);
  }

  @Get('village')
  villageView(@FamilyId() familyId: string): Promise<VillageView> {
    return this.village.view(familyId);
  }
}

@PlayerOnly()
@Controller('me/village')
export class ChildVillageController {
  constructor(
    private readonly village: VillageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async view(@PlayerId() childId: string): Promise<VillageView> {
    const child = await this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } });
    return this.village.view(child.familyId);
  }
}
