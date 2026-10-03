import { Body, Controller, Get, HttpCode, Put } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ROOM_MAX_ITEMS } from '@mimo/game-data';
import type { RoomEditorView, RoomView } from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { RoomService } from './room.service';

class BackgroundDto {
  @IsString()
  @Length(1, 64)
  itemId!: string;
}

class PlacementDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,40}$/)
  id!: string;

  @IsString()
  @Length(1, 64)
  item!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  x!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  y!: number;

  @IsIn(['back', 'front'])
  layer!: 'back' | 'front';

  @IsBoolean()
  flip!: boolean;
}

class LayoutDto {
  @IsArray()
  @ArrayMaxSize(ROOM_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PlacementDto)
  placements!: PlacementDto[];
}

/** Espace de la créature du joueur connecté (profil issu de la session, jamais de l'URL). */
@PlayerOnly()
@Controller('me/room')
export class RoomController {
  constructor(private readonly room: RoomService) {}

  @Get()
  editor(@PlayerId() childId: string): Promise<RoomEditorView> {
    return this.room.editor(childId);
  }

  @HttpCode(200)
  @Put('background')
  background(@PlayerId() childId: string, @Body() dto: BackgroundDto): Promise<RoomView> {
    return this.room.setBackground(childId, dto.itemId);
  }

  @HttpCode(200)
  @Put('layout')
  layout(@PlayerId() childId: string, @Body() dto: LayoutDto): Promise<RoomView> {
    return this.room.setLayout(childId, dto.placements);
  }
}
