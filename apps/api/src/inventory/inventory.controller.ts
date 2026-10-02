import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ACCESSORY_SLOTS } from '@mimo/game-data';
import type {
  CookResult,
  FeedResult,
  InventoryView,
  ItemView,
  LootView,
  RecipeView,
} from '@mimo/types';
import { PlayerId, PlayerOnly } from '../auth/decorators';
import { InventoryService, MAX_ROOM_DECORATIONS } from './inventory.service';

class ItemDto {
  @IsString()
  itemId!: string;
}

class QuantityItemDto extends ItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number = 1;
}

class CookDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  ingredients!: string[];
}

class EquipDto {
  @IsIn(ACCESSORY_SLOTS)
  slot!: (typeof ACCESSORY_SLOTS)[number];

  @ValidateIf((_, v) => v !== null)
  @IsString()
  itemId!: string | null;
}

class RoomDto {
  @IsArray()
  @ArrayMaxSize(MAX_ROOM_DECORATIONS)
  @IsString({ each: true })
  decorations!: string[];
}

@PlayerOnly()
@Controller('me')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventory')
  view(@PlayerId() childId: string): Promise<InventoryView> {
    return this.inventory.view(childId);
  }

  @Get('shop')
  shop(): ItemView[] {
    return this.inventory.shop();
  }

  @HttpCode(200)
  @Post('shop/buy')
  buy(@PlayerId() childId: string, @Body() dto: QuantityItemDto): Promise<InventoryView> {
    return this.inventory.buy(childId, dto.itemId, dto.quantity);
  }

  @HttpCode(200)
  @Post('feed')
  feed(@PlayerId() childId: string, @Body() dto: ItemDto): Promise<FeedResult> {
    return this.inventory.feed(childId, dto.itemId);
  }

  @HttpCode(200)
  @Post('cook')
  cook(@PlayerId() childId: string, @Body() dto: CookDto): Promise<CookResult> {
    return this.inventory.cook(childId, dto.ingredients);
  }

  @Get('recipes')
  recipes(@PlayerId() childId: string): Promise<RecipeView[]> {
    return this.inventory.recipes(childId);
  }

  @HttpCode(200)
  @Post('chests/:itemId/open')
  openChest(@PlayerId() childId: string, @Param('itemId') itemId: string): Promise<LootView> {
    return this.inventory.openChest(childId, itemId);
  }

  @Put('equipment')
  equip(@PlayerId() childId: string, @Body() dto: EquipDto): Promise<InventoryView> {
    return this.inventory.equip(childId, dto.slot, dto.itemId);
  }

  @Put('room')
  room(@PlayerId() childId: string, @Body() dto: RoomDto): Promise<InventoryView> {
    return this.inventory.setRoom(childId, dto.decorations);
  }

  @HttpCode(200)
  @Post('village/donate')
  donate(@PlayerId() childId: string, @Body() dto: QuantityItemDto): Promise<{ points: number }> {
    return this.inventory.donate(childId, dto.itemId, dto.quantity);
  }
}
