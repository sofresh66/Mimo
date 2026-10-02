import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches } from 'class-validator';
import type {
  CreatedParentInvitation,
  ParentInvitationPreview,
  ParentInvitationView,
} from '@mimo/types';
import type { Request } from 'express';
import { authRateLimit } from '../auth/auth.controller';
import type { AuthContext } from '../auth/auth.types';
import {
  AllowWithoutFamily,
  Auth,
  FamilyId,
  ParentOnly,
  Public,
  type AuthenticatedRequest,
} from '../auth/decorators';
import { InvitationsService } from './invitations.service';

const STRICT = { default: { limit: authRateLimit, ttl: 60_000 } };
const client = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Le code PIN doit contenir 4 chiffres' })
  parentPin?: string;
}

/** Gestion des invitations par un parent déjà membre de la famille. */
@ParentOnly()
@Controller('family/invitations')
export class FamilyInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  list(@FamilyId() familyId: string): Promise<ParentInvitationView[]> {
    return this.invitations.list(familyId);
  }

  @Throttle(STRICT)
  @Post()
  create(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Req() req: Request,
  ): Promise<CreatedParentInvitation> {
    return this.invitations.create(auth, familyId, client(req));
  }

  @Delete(':id')
  async revoke(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    await this.invitations.revoke(auth, familyId, id, client(req));
    return { ok: true };
  }
}

/** Côté parent invité : aperçu public du lien, puis acceptation une fois connecté. */
@Controller('invitations')
export class JoinInvitationController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Throttle(STRICT)
  @Get(':token')
  preview(
    @Param('token') token: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ParentInvitationPreview> {
    // Route publique : la session, si elle existe, sert seulement à indiquer « déjà membre ».
    return this.invitations.preview(token, req.auth?.familyId ?? null);
  }

  /** Mode parent requis (mot de passe ou PIN parent) ; seul un compte encore sans famille peut accepter. */
  @ParentOnly()
  @AllowWithoutFamily()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post(':token/accept')
  accept(
    @Auth() auth: AuthContext,
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
  ) {
    return this.invitations.accept(auth, token, dto.parentPin, client(req));
  }
}
