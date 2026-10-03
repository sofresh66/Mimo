import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FriendView, PlayTogetherResult, SocialEventView } from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { SocialService } from './social.service';

/** Amis de la créature du joueur connecté (profil issu de la session, jamais de l'URL). */
@PlayerOnly()
@Controller('me/friends')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  friends(@PlayerId() childId: string): Promise<FriendView[]> {
    return this.social.friends(childId);
  }

  @Get('journal')
  journal(@PlayerId() childId: string): Promise<SocialEventView[]> {
    return this.social.journal(childId);
  }

  @HttpCode(200)
  @Post('seen')
  async seen(@PlayerId() childId: string) {
    await this.social.markSeen(childId);
    return { ok: true };
  }

  /** « Jouer ensemble » (limité par jour et par couple côté serveur). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':creatureId/play')
  play(
    @PlayerId() childId: string,
    @Param('creatureId') creatureId: string,
  ): Promise<PlayTogetherResult> {
    return this.social.playTogether(childId, creatureId);
  }
}
