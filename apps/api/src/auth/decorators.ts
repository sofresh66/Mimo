import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { SessionMode } from '@prisma/client';
import type { Request } from 'express';
import { Errors } from '../common/errors';
import type { AuthContext } from './auth.types';

export const IS_PUBLIC = 'mimo:isPublic';
export const REQUIRED_MODES = 'mimo:requiredModes';
export const REQUIRES_FAMILY = 'mimo:requiresFamily';

/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restreint la route aux sessions dans l'un des modes donnés. */
export const Modes = (...modes: SessionMode[]) => SetMetadata(REQUIRED_MODES, modes);

/** Espace parent déverrouillé (mot de passe ou PIN parent) et famille créée. */
export const ParentOnly = () => SetMetadata(REQUIRED_MODES, ['PARENT']);

/** Tout mode authentifié (appareil, parent, enfant). */
export const AnyMode = () => SetMetadata(REQUIRED_MODES, ['DEVICE', 'PARENT', 'CHILD']);

/** Session enfant (profil sélectionné + PIN). */
export const ChildOnly = () => SetMetadata(REQUIRED_MODES, ['CHILD']);

/** Autorise une session parent sans famille (création de la famille). */
export const AllowWithoutFamily = () => SetMetadata(REQUIRES_FAMILY, false);

export type AuthenticatedRequest = Request & { auth?: AuthContext };

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth) throw Errors.unauthorized();
  return req.auth;
});

/** Identifiant de l'enfant connecté — toujours issu de la session, jamais de l'URL. */
export const ChildId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth || req.auth.mode !== 'CHILD' || !req.auth.childId) throw Errors.forbidden();
  return req.auth.childId;
});

/** Identifiant de la famille de la session. */
export const FamilyId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth?.familyId) throw Errors.forbidden('Aucune famille associée');
  return req.auth.familyId;
});
