import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import type {
  ChildHome,
  CreatureView,
  DexView,
  FeedResult,
  HatchResult,
  SpeciesView,
} from '@mimo/types';
import { ChildId, ChildOnly } from '../auth/decorators';
import { MissionsService } from '../missions/missions.service';
import { CreaturesService } from './creatures.service';

const NAME_PATTERN = /^[\p{L}\p{N} '’-]+$/u;

class CreatureNameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 20)
  @Matches(NAME_PATTERN, { message: 'Lettres, chiffres et espaces uniquement' })
  name!: string;
}

class AdoptDto extends CreatureNameDto {
  @IsString()
  @Length(1, 40)
  speciesId!: string;
}

@ChildOnly()
@Controller('me')
export class CreaturesController {
  constructor(
    private readonly creatures: CreaturesService,
    private readonly missions: MissionsService,
  ) {}

  @Get('home')
  async home(@ChildId() childId: string): Promise<ChildHome> {
    const [home, missionsTodo] = await Promise.all([
      this.creatures.home(childId),
      this.missions.todoCount(childId),
    ]);
    return { ...home, missionsTodo };
  }

  @Get('species')
  species(): SpeciesView[] {
    return this.creatures.species();
  }

  @Post('creature/adopt')
  adopt(@ChildId() childId: string, @Body() dto: AdoptDto): Promise<CreatureView> {
    return this.creatures.adopt(childId, dto.speciesId, dto.name);
  }

  @Get('creatures')
  list(@ChildId() childId: string): Promise<CreatureView[]> {
    return this.creatures.list(childId);
  }

  @HttpCode(200)
  @Post('creatures/:id/activate')
  activate(@ChildId() childId: string, @Param('id') id: string): Promise<CreatureView> {
    return this.creatures.activate(childId, id);
  }

  @HttpCode(200)
  @Post('creature/play')
  play(@ChildId() childId: string): Promise<FeedResult> {
    return this.creatures.play(childId);
  }

  @Post('eggs/:itemId/hatch')
  hatch(
    @ChildId() childId: string,
    @Param('itemId') itemId: string,
    @Body() dto: CreatureNameDto,
  ): Promise<HatchResult> {
    return this.creatures.hatch(childId, itemId, dto.name);
  }

  @Get('dex')
  dex(@ChildId() childId: string): Promise<DexView> {
    return this.creatures.dex(childId);
  }
}
