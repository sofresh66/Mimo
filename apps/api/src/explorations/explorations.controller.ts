import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import type { ExplorationView, ZoneView } from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { ExplorationsService } from './explorations.service';

class StartExplorationDto {
  @IsString()
  zoneId!: string;
}

@PlayerOnly()
@Controller('me')
export class ExplorationsController {
  constructor(private readonly explorations: ExplorationsService) {}

  @Get('zones')
  zones(@PlayerId() childId: string): Promise<ZoneView[]> {
    return this.explorations.zones(childId);
  }

  @Get('explorations')
  history(@PlayerId() childId: string): Promise<ExplorationView[]> {
    return this.explorations.history(childId);
  }

  @Get('explorations/current')
  async current(
    @PlayerId() childId: string,
  ): Promise<{ current: ExplorationView | null; unseen: ExplorationView | null }> {
    await this.explorations.completeDueForChild(childId);
    const [current, unseen] = await Promise.all([
      this.explorations.current(childId),
      this.explorations.unseen(childId),
    ]);
    return { current, unseen };
  }

  @Post('explorations')
  start(@PlayerId() childId: string, @Body() dto: StartExplorationDto): Promise<ExplorationView> {
    return this.explorations.start(childId, dto.zoneId);
  }

  @HttpCode(200)
  @Post('explorations/:id/seen')
  async seen(@PlayerId() childId: string, @Param('id') id: string) {
    await this.explorations.markSeen(childId, id);
    return { ok: true };
  }
}
