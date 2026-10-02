import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type {
  ChildMissionView,
  MissionTemplateView,
  MissionValidatedPayload,
  MissionView,
  PendingCompletionView,
} from '@mimo/types';
import type { AuthContext } from '../auth/auth.types';
import { Auth, ChildId, ChildOnly, FamilyId, ParentOnly } from '../auth/decorators';
import { CreateMissionDto, UpdateMissionDto, ValidateForChildDto } from './dto';
import { MissionsService } from './missions.service';

@ParentOnly()
@Controller('missions')
export class ParentMissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@FamilyId() familyId: string): Promise<MissionView[]> {
    return this.missions.list(familyId);
  }

  @Get('templates')
  templates(): MissionTemplateView[] {
    return this.missions.templates();
  }

  @Get('pending')
  pending(@FamilyId() familyId: string): Promise<PendingCompletionView[]> {
    return this.missions.pending(familyId);
  }

  @Post()
  create(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Body() dto: CreateMissionDto,
  ): Promise<MissionView> {
    return this.missions.create(auth, familyId, dto);
  }

  @Patch(':id')
  update(
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMissionDto,
  ): Promise<MissionView> {
    return this.missions.update(familyId, id, dto);
  }

  @Delete(':id')
  async remove(@FamilyId() familyId: string, @Param('id') id: string) {
    await this.missions.remove(familyId, id);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('completions/:id/approve')
  approve(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
  ): Promise<MissionValidatedPayload> {
    return this.missions.approve(auth, familyId, id);
  }

  @HttpCode(200)
  @Post('completions/:id/decline')
  async decline(@Auth() auth: AuthContext, @FamilyId() familyId: string, @Param('id') id: string) {
    await this.missions.decline(auth, familyId, id);
    return { ok: true };
  }

  @HttpCode(200)
  @Post(':id/validate')
  validate(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Body() dto: ValidateForChildDto,
  ): Promise<MissionValidatedPayload> {
    return this.missions.validateForChild(auth, familyId, id, dto.childId);
  }
}

@ChildOnly()
@Controller('me/missions')
export class ChildMissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@ChildId() childId: string): Promise<ChildMissionView[]> {
    return this.missions.forChild(childId);
  }

  @HttpCode(200)
  @Post(':id/done')
  done(@ChildId() childId: string, @Param('id') id: string): Promise<ChildMissionView[]> {
    return this.missions.requestValidation(childId, id);
  }
}
