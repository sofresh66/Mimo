import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { COMPANION_ACTIONS } from '@mimo/types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const PIN = /^\d{4}$/;
const PIN_MESSAGE = 'Le code PIN doit contenir 4 chiffres';

export const AVATARS = [
  '🦊',
  '🐉',
  '🐼',
  '🦄',
  '🐱',
  '🐶',
  '🐸',
  '🦁',
  '🐰',
  '🐨',
  '🐯',
  '🐙',
  '🦉',
  '🐢',
  '🚀',
  '⭐',
];
export const CHILD_COLORS = [
  '#ff8a5c',
  '#5ccf8f',
  '#7c5cff',
  '#3fb6e8',
  '#ff5d8f',
  '#ffc145',
  '#26c6da',
  '#a06cd5',
];

export class CreateFamilyDto {
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name!: string;

  @IsString()
  @Matches(PIN, { message: PIN_MESSAGE })
  parentPin!: string;
}

export class UpdateFamilyDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name?: string;

  @IsOptional()
  @IsBoolean()
  companionEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMPANION_ACTIONS.length)
  @IsIn(COMPANION_ACTIONS as string[], { each: true })
  companionAllowedActions?: string[];
}

export class ParentPinDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @Matches(PIN, { message: PIN_MESSAGE })
  pin!: string;
}

export class CreateChildDto {
  @Transform(trim)
  @IsString()
  @Length(1, 24)
  @Matches(/^[\p{L}\p{N} '’-]+$/u, { message: 'Prénom ou pseudo : lettres, chiffres, espaces' })
  displayName!: string;

  @IsIn(AVATARS)
  avatar!: string;

  @IsIn(CHILD_COLORS)
  color!: string;

  @IsString()
  @Matches(PIN, { message: PIN_MESSAGE })
  pin!: string;
}

export class UpdateChildDto {
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

export class ChildPinDto {
  @IsString()
  @Matches(PIN, { message: PIN_MESSAGE })
  pin!: string;
}
