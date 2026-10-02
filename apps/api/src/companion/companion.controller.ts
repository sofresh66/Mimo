import { Controller, Get, HttpCode, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CompanionAction, CompanionResponse, CompanionStatus } from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { CompanionService } from './companion.service';

enum Action {
  story = 'story',
  riddle = 'riddle',
  math = 'math',
  fact = 'fact',
  joke = 'joke',
}

@PlayerOnly()
@Controller('me/companion')
export class CompanionController {
  constructor(private readonly companion: CompanionService) {}

  @Get()
  status(@PlayerId() childId: string): Promise<CompanionStatus> {
    return this.companion.status(childId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':action')
  ask(
    @PlayerId() childId: string,
    @Param('action', new ParseEnumPipe(Action)) action: CompanionAction,
  ): Promise<CompanionResponse> {
    return this.companion.ask(childId, action);
  }
}
