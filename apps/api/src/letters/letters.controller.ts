import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  LETTER_BOXES,
  type LetterBox,
  type LetterComposeView,
  type LetterPage,
  type LetterPartyKind,
  type LetterView,
  type MailSummary,
  type SendLetterInput,
} from '@mimo/types';
import { LETTER_MAX_RAW_LENGTH } from '@mimo/game-data';
import type { AuthContext } from '../auth/auth.types';
import { Auth, FamilyId, ParentOnly, PlayerId, PlayerOnly } from '../auth/decorators';
import { LettersService, type Mailbox } from './letters.service';

/** Limite d'envoi simple (par minute) ; réglable pour les tests. */
export const letterRateLimit = () => Number(process.env.LETTER_RATE_LIMIT ?? 10);
const SEND_LIMIT = { default: { limit: letterRateLimit, ttl: 60_000 } };
const ID = /^[A-Za-z0-9_-]{1,64}$/;

class LetterTargetDto {
  @IsIn(['profile', 'parent'])
  kind!: LetterPartyKind;

  @Matches(ID)
  id!: string;
}

class SendLetterDto implements SendLetterInput {
  @IsDefined({ message: 'Choisis un destinataire' })
  @ValidateNested()
  @Type(() => LetterTargetDto)
  to!: LetterTargetDto;

  // Les messages de validation ne reprennent jamais la valeur (texte privé).
  @IsString()
  @MaxLength(LETTER_MAX_RAW_LENGTH, { message: 'Ta lettre est trop longue' })
  content!: string;

  @Matches(ID)
  stationeryId!: string;

  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  requestId!: string;
}

class LetterListQuery {
  @IsOptional()
  @IsIn(LETTER_BOXES)
  box?: LetterBox;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

class SupervisionQuery {
  @IsOptional()
  @IsIn(['received', 'sent'])
  box?: 'received' | 'sent';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

/** Boîte aux lettres du joueur connecté (profil issu de la session, jamais de l'URL). */
@PlayerOnly()
@Controller('me/letters')
export class PlayerLettersController {
  constructor(private readonly letters: LettersService) {}

  private box(familyId: string, profileId: string): Mailbox {
    return { kind: 'profile', familyId, profileId };
  }

  @Get()
  list(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Query() query: LetterListQuery,
  ): Promise<LetterPage> {
    return this.letters.list(this.box(familyId, profileId), query.box ?? 'received', query.cursor);
  }

  @Get('compose')
  compose(@FamilyId() familyId: string, @PlayerId() profileId: string): Promise<LetterComposeView> {
    return this.letters.compose(this.box(familyId, profileId));
  }

  @Get(':id')
  get(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.get(this.box(familyId, profileId), id);
  }

  @Throttle(SEND_LIMIT)
  @Post()
  send(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Body() body: SendLetterDto,
  ): Promise<LetterView> {
    return this.letters.send(this.box(familyId, profileId), body);
  }

  @HttpCode(200)
  @Post(':id/read')
  read(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.markRead(this.box(familyId, profileId), id);
  }

  @Put(':id/cherish')
  cherish(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.cherish(this.box(familyId, profileId), id, true);
  }

  @Delete(':id/cherish')
  uncherish(
    @FamilyId() familyId: string,
    @PlayerId() profileId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.cherish(this.box(familyId, profileId), id, false);
  }
}

/**
 * Espace parent (PIN réellement déverrouillé) : boîte aux lettres personnelle du parent et
 * supervision, en lecture seule, des courriers de ses profils enfants.
 */
@ParentOnly()
@Controller('parent')
export class ParentLettersController {
  constructor(private readonly letters: LettersService) {}

  private box(auth: AuthContext, familyId: string): Mailbox {
    return { kind: 'parent', familyId, userId: auth.userId };
  }

  @Get('letters')
  list(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Query() query: LetterListQuery,
  ): Promise<LetterPage> {
    return this.letters.list(this.box(auth, familyId), query.box ?? 'received', query.cursor);
  }

  @Get('letters/summary')
  summary(@Auth() auth: AuthContext, @FamilyId() familyId: string): Promise<MailSummary> {
    return this.letters.summary(this.box(auth, familyId));
  }

  @Get('letters/compose')
  compose(@Auth() auth: AuthContext, @FamilyId() familyId: string): Promise<LetterComposeView> {
    return this.letters.compose(this.box(auth, familyId));
  }

  @Get('letters/:id')
  get(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.get(this.box(auth, familyId), id);
  }

  @Throttle(SEND_LIMIT)
  @Post('letters')
  send(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Body() body: SendLetterDto,
  ): Promise<LetterView> {
    return this.letters.send(this.box(auth, familyId), body);
  }

  @HttpCode(200)
  @Post('letters/:id/read')
  read(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.markRead(this.box(auth, familyId), id);
  }

  @Put('letters/:id/cherish')
  cherish(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.cherish(this.box(auth, familyId), id, true);
  }

  @Delete('letters/:id/cherish')
  uncherish(
    @Auth() auth: AuthContext,
    @FamilyId() familyId: string,
    @Param('id') id: string,
  ): Promise<LetterView> {
    return this.letters.cherish(this.box(auth, familyId), id, false);
  }

  /** Supervision en lecture seule : ne marque jamais une lettre comme lue pour l'enfant. */
  @Get('children/:id/letters')
  supervise(
    @FamilyId() familyId: string,
    @Param('id') childId: string,
    @Query() query: SupervisionQuery,
  ): Promise<LetterPage> {
    return this.letters.supervise(familyId, childId, query.box ?? 'received', query.cursor);
  }
}
