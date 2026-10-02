import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { XP_CATEGORIES } from '@mimo/game-data';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const RECURRENCES = ['ONCE', 'DAILY', 'WEEKLY'] as const;

export const MISSION_MAX_XP = 100;
export const MISSION_MAX_COINS = 100;

export class CreateMissionDto {
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsIn(XP_CATEGORIES)
  category!: (typeof XP_CATEGORIES)[number];

  @IsString()
  @Length(1, 8)
  icon!: string;

  @IsInt()
  @Min(1)
  @Max(MISSION_MAX_XP)
  xp!: number;

  @IsInt()
  @Min(0)
  @Max(MISSION_MAX_COINS)
  coins!: number;

  @IsIn(RECURRENCES)
  recurrence!: (typeof RECURRENCES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  assignedChildId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  rewardItemId?: string | null;

  @IsOptional()
  @IsString()
  templateId?: string;
}

export class UpdateMissionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @IsOptional()
  @IsIn(XP_CATEGORIES)
  category?: (typeof XP_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  @Length(1, 8)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MISSION_MAX_XP)
  xp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MISSION_MAX_COINS)
  coins?: number;

  @IsOptional()
  @IsIn(RECURRENCES)
  recurrence?: (typeof RECURRENCES)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  assignedChildId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  rewardItemId?: string | null;

  @IsOptional()
  @IsIn([true, false])
  isActive?: boolean;
}

export class ValidateForChildDto {
  @IsString()
  childId!: string;
}
