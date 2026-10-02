import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type {
  AcceptedInvitation,
  CreatedParentInvitation,
  ParentInvitationPreview,
  ParentInvitationView,
} from '@mimo/types';
import type { Request, Response } from 'express';
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
import { TokenService } from '../auth/token.service';
import { AVATARS, CHILD_COLORS } from './dto';
import { InvitationsService } from './invitations.service';

const STRICT = { default: { limit: authRateLimit, ttl: 60_000 } };
const client = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class CreateInvitationDto {
  /** Rôle proposé ; parent par défaut (compatibilité avec les clients existants). */
  @IsOptional()
  @IsIn(['PARENT', 'ADULT_PLAYER'])
  role?: 'PARENT' | 'ADULT_PLAYER';
}

class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Le code PIN doit contenir 4 chiffres' })
  parentPin?: string;

  /** Profil de jeu d'un adulte joueur (ignoré pour une invitation parent). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 24)
  @Matches(/^[\p{L}\p{N} '’-]+$/u, { message: 'Prénom ou pseudo : lettres, chiffres, espaces' })
  displayName?: string;

  @IsOptional()
  @IsIn(AVATARS)
  avatar?: string;

  @IsOptional()
  @IsIn(CHILD_COLORS)
  color?: string;
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
    @Body() dto: CreateInvitationDto,
    @Req() req: Request,
  ): Promise<CreatedParentInvitation> {
    return this.invitations.create(auth, familyId, dto.role ?? 'PARENT', client(req));
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

/** Côté adulte invité : aperçu public du lien, puis acceptation une fois connecté. */
@Controller('invitations')
export class JoinInvitationController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly tokens: TokenService,
  ) {}

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

  /**
   * Session ouverte par mot de passe requise (mode parent) ; seul un compte encore sans famille
   * peut accepter. Un adulte joueur (mode PLAYER) est donc toujours refusé ici.
   */
  @ParentOnly()
  @AllowWithoutFamily()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post(':token/accept')
  async accept(
    @Auth() auth: AuthContext,
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptedInvitation> {
    const { result, tokens } = await this.invitations.accept(auth, token, dto, client(req));
    // Adulte joueur : la session passe immédiatement en mode PLAYER (sans reconnexion).
    if (tokens) this.tokens.setCookies(res, tokens.access, tokens.refresh);
    return result;
  }
}
