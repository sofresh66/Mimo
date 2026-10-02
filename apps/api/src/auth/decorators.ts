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

/**
 * Modes d'un appareil familial (appareil, parent, enfant). Exclut volontairement PLAYER :
 * un adulte joueur ne peut ni déverrouiller l'espace parent ni sélectionner un profil enfant.
 */
export const AnyMode = () => SetMetadata(REQUIRED_MODES, ['DEVICE', 'PARENT', 'CHILD']);

/** Toute session authentifiée, adulte joueur compris (profil, déconnexion). */
export const AnySession = () =>
  SetMetadata(REQUIRED_MODES, ['DEVICE', 'PARENT', 'CHILD', 'PLAYER']);

/** Session de jeu : enfant (profil + PIN) ou adulte joueur (son propre compte). */
export const PlayerOnly = () => SetMetadata(REQUIRED_MODES, ['CHILD', 'PLAYER']);

/** Autorise une session parent sans famille (création de la famille). */
export const AllowWithoutFamily = () => SetMetadata(REQUIRES_FAMILY, false);

export type AuthenticatedRequest = Request & { auth?: AuthContext };

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth) throw Errors.unauthorized();
  return req.auth;
});

/**
 * Identifiant du profil de jeu connecté (enfant ou adulte joueur) — toujours issu de la
 * session vérifiée en base, jamais de l'URL ni du corps de la requête.
 */
export const PlayerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const auth = req.auth;
  if (!auth || (auth.mode !== 'CHILD' && auth.mode !== 'PLAYER') || !auth.childId) {
    throw Errors.forbidden();
  }
  return auth.childId;
});

/** Identifiant de la famille de la session. */
export const FamilyId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth?.familyId) throw Errors.forbidden('Aucune famille associée');
  return req.auth.familyId;
});
