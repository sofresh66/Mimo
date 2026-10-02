import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionMode } from '@prisma/client';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE } from './auth.types';
import {
  IS_PUBLIC,
  REQUIRED_MODES,
  REQUIRES_FAMILY,
  type AuthenticatedRequest,
} from './decorators';
import { TokenService } from './token.service';

/**
 * Garde global :
 * 1. vérifie le JWT d'accès (cookie HttpOnly ou en-tête Bearer) ;
 * 2. vérifie que la session existe toujours en base (révocation immédiate possible) ;
 * 3. applique les restrictions de mode (parent / enfant / appareil / adulte joueur).
 * Un enfant ne peut donc jamais appeler un endpoint parent : le mode est porté par la
 * session côté serveur et ne change qu'après vérification d'un PIN.
 * Un adulte joueur (rôle ADULT_PLAYER) n'a qu'un seul mode possible, PLAYER, lié à son
 * propre profil : toute autre session de ce compte est refusée.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = extractToken(req);
    if (!token) {
      if (isPublic) return true;
      throw Errors.unauthorized();
    }
    const payload = this.tokens.verifyAccess(token);
    if (!payload) {
      if (isPublic) return true;
      throw Errors.unauthorized('TOKEN_EXPIRED', 'Session expirée');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: { select: { familyId: true, familyRole: true } },
        child: { select: { familyId: true, type: true, userId: true } },
      },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < now ||
      session.userId !== payload.sub
    ) {
      // Un vieux cookie ne doit jamais bloquer une route publique (ex. connexion).
      if (isPublic) return true;
      throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    }

    let mode: SessionMode = session.mode;
    if (mode === 'PARENT' && (!session.parentModeExpiresAt || session.parentModeExpiresAt < now)) {
      mode = 'DEVICE';
    }
    const familyId = session.user.familyId;
    // Un profil enfant doit appartenir à la famille du compte de l'appareil.
    if (
      mode === 'CHILD' &&
      (!session.child || session.child.type !== 'CHILD' || session.child.familyId !== familyId)
    ) {
      mode = 'DEVICE';
    }
    // Mode PLAYER : uniquement un adulte joueur, sur SON profil adulte, dans SA famille.
    const playerValid =
      mode === 'PLAYER' &&
      session.user.familyRole === 'ADULT_PLAYER' &&
      !!session.child &&
      session.child.type === 'ADULT' &&
      session.child.userId === session.userId &&
      session.child.familyId === familyId;
    // Un adulte joueur n'a jamais d'autre mode (ni parent, ni appareil, ni enfant).
    if ((mode === 'PLAYER' || session.user.familyRole === 'ADULT_PLAYER') && !playerValid) {
      if (isPublic) return true;
      throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    }
    const playing = mode === 'CHILD' || mode === 'PLAYER';
    if (payload.mode !== mode || payload.cid !== (playing ? session.childId : null)) {
      if (isPublic) return true;
      throw Errors.unauthorized('SESSION_STALE', 'Session à rafraîchir');
    }

    req.auth = {
      userId: session.userId,
      sessionId: session.id,
      familyId,
      role: session.user.familyRole,
      mode,
      childId: playing ? session.childId : null,
      parentModeExpiresAt: mode === 'PARENT' ? session.parentModeExpiresAt : null,
    };

    // Par défaut (aucun décorateur), une route n'est accessible qu'en mode parent :
    // l'accès enfant ou appareil doit toujours être explicitement déclaré.
    const modes =
      this.reflector.getAllAndOverride<SessionMode[] | undefined>(REQUIRED_MODES, targets) ??
      (isPublic ? null : ['PARENT']);
    if (modes && !modes.includes(mode)) {
      throw Errors.forbidden(
        mode === 'CHILD' || mode === 'PLAYER'
          ? 'Réservé à l’espace parent'
          : 'Mode de session non autorisé',
      );
    }
    const requiresFamily =
      this.reflector.getAllAndOverride<boolean>(REQUIRES_FAMILY, targets) ?? true;
    if (!isPublic && requiresFamily && !req.auth.familyId) {
      throw Errors.forbidden('Crée d’abord ta famille');
    }
    return true;
  }
}

function extractToken(req: AuthenticatedRequest): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  const fromCookie = cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}
