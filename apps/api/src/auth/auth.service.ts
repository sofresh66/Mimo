import { Injectable } from '@nestjs/common';
import type { AuthSession, User } from '@prisma/client';
import type { MeResponse } from '@mimo/types';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AuthContext } from './auth.types';
import type { LoginDto, RegisterDto } from './dto';
import { assertPinNotLocked, hashSecret, pinFailure, verifySecret } from './secrets';
import { TokenService } from './token.service';

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedTokens {
  access: string;
  refresh?: string;
}

/** Hash factice pour garder un temps de réponse constant quand l'e-mail est inconnu. */
let dummyHash: Promise<string> | null = null;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async register(dto: RegisterDto, client: ClientInfo): Promise<IssuedTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw Errors.conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hashSecret(dto.password),
        displayName: dto.displayName,
        lastLoginAt: new Date(),
      },
    });
    await this.audit.log({ action: 'USER_REGISTERED', userId: user.id, ...client });
    return this.openSession(user, client);
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      dummyHash ??= hashSecret('mimo-timing-protection');
      await verifySecret(await dummyHash, dto.password);
      throw Errors.unauthorized('INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    if (!(await verifySecret(user.passwordHash, dto.password))) {
      await this.audit.log({
        action: 'LOGIN_FAILED',
        userId: user.id,
        familyId: user.familyId,
        ...client,
      });
      throw Errors.unauthorized('INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ action: 'LOGIN', userId: user.id, familyId: user.familyId, ...client });
    return this.openSession(user, client);
  }

  /**
   * Mode d'une session ouverte par e-mail + mot de passe :
   * - adulte joueur → PLAYER, lié à son propre profil de jeu ;
   * - parent dont la famille est configurée (PIN défini) → DEVICE (« Qui joue ? ») : l'appareil
   *   peut être familial, l'espace parent exige TOUJOURS le PIN, y compris à la première
   *   connexion, après une reconnexion ou sur un nouvel appareil ;
   * - compte sans famille (inscription, acceptation d'une invitation) ou parent sans PIN → PARENT,
   *   le temps de créer la famille et de choisir son PIN (aucun enfant à protéger encore).
   */
  private async openSession(user: User, client: ClientInfo): Promise<IssuedTokens> {
    const player = user.familyRole === 'ADULT_PLAYER' ? await this.adultProfile(user) : null;
    const pinProtected = Boolean(user.familyId && user.parentPinHash);
    const refresh = this.tokens.generateRefreshToken();
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: refresh.hash,
        ...(player
          ? { mode: 'PLAYER', childId: player.id, parentModeExpiresAt: null }
          : pinProtected
            ? { mode: 'DEVICE', parentModeExpiresAt: null }
            : { mode: 'PARENT', parentModeExpiresAt: this.tokens.parentModeExpiry() }),
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });
    return { access: this.tokens.signAccess(session, user.familyId), refresh: refresh.token };
  }

  /** Profil adulte du compte, dans sa famille actuelle. */
  private async adultProfile(user: User) {
    const profile = await this.prisma.playerProfile.findFirst({
      where: { userId: user.id, type: 'ADULT', familyId: user.familyId ?? undefined },
      select: { id: true },
    });
    if (!user.familyId || !profile) {
      throw Errors.forbidden('Aucun profil de joueur pour ce compte');
    }
    return profile;
  }

  /** Rotation du refresh token et réémission du JWT d'accès selon le mode courant. */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { user: { select: { familyId: true, familyRole: true } } },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt < now) {
      throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    }
    const next = this.tokens.generateRefreshToken();
    const parentExpired =
      session.mode === 'PARENT' &&
      (!session.parentModeExpiresAt || session.parentModeExpiresAt < now);
    const childMissing = session.mode === 'CHILD' && !session.childId;
    // Un adulte joueur sans profil (supprimé) ou une session PLAYER d'un autre rôle : fin de session.
    if (
      (session.mode === 'PLAYER' || session.user.familyRole === 'ADULT_PLAYER') &&
      (session.mode !== 'PLAYER' || session.user.familyRole !== 'ADULT_PLAYER' || !session.childId)
    ) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    }
    // Rotation atomique : deux refresh simultanés avec le même jeton ne peuvent pas réussir tous les deux.
    const rotated = await this.prisma.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: {
        refreshTokenHash: next.hash,
        lastUsedAt: now,
        expiresAt: this.tokens.refreshExpiry(),
        ...(parentExpired || childMissing
          ? { mode: 'DEVICE', parentModeExpiresAt: null, childId: null }
          : {}),
      },
    });
    if (rotated.count === 0) throw Errors.unauthorized('SESSION_REVOKED', 'Session terminée');
    const updated = await this.prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
    return { access: this.tokens.signAccess(updated, session.user.familyId), refresh: next.token };
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: auth.sessionId },
      data: { revokedAt: new Date() },
    });
    this.realtime.disconnectSession(auth.sessionId);
  }

  /** Déconnecte tous les appareils du parent (sauf la session courante si précisé). */
  async logoutEverywhere(auth: AuthContext, client: ClientInfo): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.realtime.disconnectUser(auth.userId);
    await this.audit.log({
      action: 'LOGOUT_ALL_DEVICES',
      userId: auth.userId,
      familyId: auth.familyId,
      ...client,
    });
  }

  /** Déverrouille l'espace parent sur un appareil familial grâce au PIN parent. */
  async unlockParent(auth: AuthContext, pin: string, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    // Défense en profondeur (le garde refuse déjà le mode PLAYER) : un adulte joueur n'a
    // jamais l'espace parent, même s'il connaît le PIN d'un parent.
    if (user.familyRole !== 'PARENT') throw Errors.forbidden('Réservé aux parents');
    if (!user.parentPinHash)
      throw Errors.badRequest('PARENT_PIN_NOT_SET', 'Aucun PIN parent défini');
    assertPinNotLocked({
      failedAttempts: user.parentPinFailedAttempts,
      lockedUntil: user.parentPinLockedUntil,
    });
    if (!(await verifySecret(user.parentPinHash, pin))) {
      // Incrément atomique : des requêtes parallèles ne peuvent pas contourner le compteur.
      const { parentPinFailedAttempts } = await this.prisma.user.update({
        where: { id: user.id },
        data: { parentPinFailedAttempts: { increment: 1 } },
        select: { parentPinFailedAttempts: true },
      });
      const { lockedUntil, error } = pinFailure(parentPinFailedAttempts);
      await this.audit.log({
        action: 'PARENT_PIN_FAILED',
        userId: user.id,
        familyId: user.familyId,
        ...client,
      });
      if (lockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { parentPinLockedUntil: lockedUntil },
        });
        await this.audit.log({
          action: 'PARENT_PIN_LOCKED',
          userId: user.id,
          familyId: user.familyId,
          ...client,
        });
        if (user.familyId)
          this.realtime.toParents(user.familyId, 'security:pin-locked', {
            target: 'parent',
            name: null,
          });
      }
      throw error;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { parentPinFailedAttempts: 0, parentPinLockedUntil: null },
    });
    const session = await this.prisma.authSession.update({
      where: { id: auth.sessionId },
      data: { mode: 'PARENT', childId: null, parentModeExpiresAt: this.tokens.parentModeExpiry() },
    });
    this.realtime.disconnectSession(session.id);
    await this.audit.log({
      action: 'PARENT_UNLOCKED',
      userId: user.id,
      familyId: user.familyId,
      ...client,
    });
    return { access: this.tokens.signAccess(session, user.familyId) };
  }

  /** Sélection d'un profil enfant + vérification de son PIN. */
  async unlockChild(
    auth: AuthContext,
    childId: string,
    pin: string,
    client: ClientInfo,
  ): Promise<IssuedTokens> {
    if (!auth.familyId || auth.role !== 'PARENT') throw Errors.forbidden();
    // Seuls les profils enfants se sélectionnent avec un PIN (un adulte se connecte avec son compte).
    const child = await this.prisma.playerProfile.findFirst({
      where: { id: childId, familyId: auth.familyId, type: 'CHILD' },
    });
    if (!child?.pinHash) throw Errors.notFound('Profil');
    assertPinNotLocked({
      failedAttempts: child.pinFailedAttempts,
      lockedUntil: child.pinLockedUntil,
    });
    if (!(await verifySecret(child.pinHash, pin))) {
      const { pinFailedAttempts } = await this.prisma.playerProfile.update({
        where: { id: child.id },
        data: { pinFailedAttempts: { increment: 1 } },
        select: { pinFailedAttempts: true },
      });
      const { lockedUntil, error } = pinFailure(pinFailedAttempts);
      if (lockedUntil) {
        await this.prisma.playerProfile.update({
          where: { id: child.id },
          data: { pinLockedUntil: lockedUntil },
        });
        this.realtime.toParents(auth.familyId, 'security:pin-locked', {
          target: 'child',
          name: child.displayName,
        });
      }
      await this.audit.log({
        action: 'CHILD_PIN_FAILED',
        userId: auth.userId,
        familyId: auth.familyId,
        childId: child.id,
        ...client,
      });
      throw error;
    }
    await this.prisma.playerProfile.update({
      where: { id: child.id },
      data: { pinFailedAttempts: 0, pinLockedUntil: null, lastSeenAt: new Date() },
    });
    const session = await this.prisma.authSession.update({
      where: { id: auth.sessionId },
      data: { mode: 'CHILD', childId: child.id, parentModeExpiresAt: null },
    });
    this.realtime.disconnectSession(session.id);
    return { access: this.tokens.signAccess(session, auth.familyId) };
  }

  /** Revient à l'écran « Qui joue ? » (verrouille l'espace parent ou enfant). */
  async lock(auth: AuthContext): Promise<IssuedTokens> {
    // Un adulte joueur n'a pas d'écran « Qui joue ? » : il se déconnecte.
    if (auth.role !== 'PARENT') throw Errors.forbidden();
    const session: AuthSession = await this.prisma.authSession.update({
      where: { id: auth.sessionId },
      data: { mode: 'DEVICE', childId: null, parentModeExpiresAt: null },
    });
    this.realtime.disconnectSession(session.id);
    return { access: this.tokens.signAccess(session, auth.familyId) };
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: { family: true },
    });
    const child =
      (auth.mode === 'CHILD' || auth.mode === 'PLAYER') && auth.childId
        ? await this.prisma.playerProfile.findUnique({ where: { id: auth.childId } })
        : null;
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.familyRole,
      },
      family: user.family ? { id: user.family.id, name: user.family.name } : null,
      mode: auth.mode,
      child: child
        ? {
            id: child.id,
            displayName: child.displayName,
            avatar: child.avatar,
            color: child.color,
            type: child.type,
          }
        : null,
      parentModeExpiresAt: auth.parentModeExpiresAt?.toISOString() ?? null,
      hasParentPin: Boolean(user.parentPinHash),
    };
  }

  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifySecret(user.passwordHash, currentPassword))) {
      throw Errors.badRequest('INVALID_CREDENTIALS', 'Mot de passe actuel incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashSecret(newPassword) },
    });
    // Les autres appareils doivent se reconnecter.
    await this.prisma.authSession.updateMany({
      where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.realtime.disconnectUser(user.id);
    await this.audit.log({
      action: 'PASSWORD_CHANGED',
      userId: user.id,
      familyId: user.familyId,
      ...client,
    });
  }
}
