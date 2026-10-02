import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { FamilySettings, PlayerProfile } from '@mimo/types';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { AllowWithoutFamily, AnyMode, Auth, FamilyId, ParentOnly } from '../auth/decorators';
import {
  ChildPinDto,
  CreateChildDto,
  CreateFamilyDto,
  ParentPinDto,
  UpdateChildDto,
  UpdateFamilyDto,
} from './dto';
import { FamilyService } from './family.service';

const client = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

@Controller()
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @ParentOnly()
  @AllowWithoutFamily()
  @Post('family')
  create(
    @Auth() auth: AuthContext,
    @Body() dto: CreateFamilyDto,
    @Req() req: Request,
  ): Promise<FamilySettings> {
    return this.family.create(auth, dto, client(req));
  }

  @ParentOnly()
  @Get('family')
  settings(@FamilyId() familyId: string): Promise<FamilySettings> {
    return this.family.settings(familyId);
  }

  @ParentOnly()
  @Patch('family')
  update(@FamilyId() familyId: string, @Body() dto: UpdateFamilyDto): Promise<FamilySettings> {
    return this.family.update(familyId, dto);
  }

  @ParentOnly()
  @HttpCode(200)
  @Put('family/parent-pin')
  async parentPin(@Auth() auth: AuthContext, @Body() dto: ParentPinDto, @Req() req: Request) {
    await this.family.setParentPin(auth, dto, client(req));
    return { ok: true };
  }

  /** « Qui joue ? » — accessible à tout appareil connecté à la famille. */
  @AnyMode()
  @Get('profiles')
  profiles(@FamilyId() familyId: string): Promise<PlayerProfile[]> {
    return this.family.profiles(familyId);
  }

  @ParentOnly()
  @Post('children')
  createChild(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Body() dto: CreateChildDto,
    @Req() req: Request,
  ) {
    return this.family.createChild(auth, familyId, dto, client(req));
  }

  @ParentOnly()
  @Patch('children/:id')
  async updateChild(
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChildDto,
  ) {
    await this.family.updateChild(familyId, id, dto);
    return { ok: true };
  }

  @ParentOnly()
  @HttpCode(200)
  @Put('children/:id/pin')
  async childPin(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Body() dto: ChildPinDto,
    @Req() req: Request,
  ) {
    await this.family.changeChildPin(auth, familyId, id, dto.pin, client(req));
    return { ok: true };
  }

  @ParentOnly()
  @Delete('children/:id')
  async deleteChild(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.family.deleteChild(auth, familyId, id, client(req));
    return { ok: true };
  }
}
