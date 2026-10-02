import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  MiniGameInfo,
  MiniGameResult,
  MiniGameStartResponse,
  MiniGameSubmission,
} from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { MinigamesService } from './minigames.service';

class StartGameDto {
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard' = 'medium';
}

class SubmissionDto {
  @IsIn(['memory', 'math', 'sequence'])
  kind!: 'memory' | 'math' | 'sequence';

  @ValidateIf((o: SubmissionDto) => o.kind === 'memory')
  @IsArray()
  @ArrayMaxSize(400)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(64, { each: true })
  flips?: number[];

  @ValidateIf((o: SubmissionDto) => o.kind !== 'memory')
  @IsArray()
  @ArrayMaxSize(20)
  answers?: Array<number | null>;
}

class SubmitGameDto {
  @ValidateNested()
  @Type(() => SubmissionDto)
  submission!: SubmissionDto;
}

@PlayerOnly()
@Controller('me/games')
export class MinigamesController {
  constructor(private readonly games: MinigamesService) {}

  @Get()
  list(@PlayerId() childId: string): Promise<MiniGameInfo[]> {
    return this.games.list(childId);
  }

  @Post(':key/start')
  start(
    @PlayerId() childId: string,
    @Param('key') key: string,
    @Body() dto: StartGameDto,
  ): Promise<MiniGameStartResponse> {
    return this.games.start(childId, key, dto.difficulty);
  }

  @HttpCode(200)
  @Post('sessions/:id/submit')
  submit(
    @PlayerId() childId: string,
    @Param('id') id: string,
    @Body() dto: SubmitGameDto,
  ): Promise<MiniGameResult> {
    const s = dto.submission;
    const submission: MiniGameSubmission =
      s.kind === 'memory'
        ? { kind: 'memory', flips: s.flips ?? [] }
        : {
            kind: s.kind,
            answers: (s.answers ?? []).map((a) => (typeof a === 'number' ? a : null)),
          };
    return this.games.submit(childId, id, submission);
  }
}
