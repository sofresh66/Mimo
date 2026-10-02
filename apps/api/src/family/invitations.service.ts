import { HttpStatus, Injectable } from '@nestjs/common';
import type { FamilyUserRole, ParentInvitation, User } from '@prisma/client';
import type {
  AcceptedInvitation,
  CreatedParentInvitation,
  ParentInvitationPreview,
  ParentInvitationView,
} from '@mimo/types';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { ClientInfo, IssuedTokens } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';
import { hashSecret } from '../auth/secrets';
import { TokenService } from '../auth/token.service';
import { AppError, Errors } from '../common/errors';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AVATARS, CHILD_COLORS } from './dto';
import { STARTER_INVENTORY } from './family.service';

/** Durée de validité d'une invitation. */
export const INVITATION_TTL_HOURS = 72;
/** Nombre maximal de parents par famille. */
export const MAX_PARENTS = 4;
/** Nombre maximal d'adultes joueurs par famille. */
export const MAX_ADULT_PLAYERS = 6;
/** Nombre maximal d'invitations en attente simultanément (tous rôles confondus). */
export const MAX_PENDING_INVITATIONS = 5;
/** Jeton : 32 octets aléatoires encodés en base64url (43 caractères). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const LIMITS: Record<FamilyUserRole, { max: number; code: string; message: string }> = {
  PARENT: {
    max: MAX_PARENTS,
    code: 'FAMILY_FULL',
    message: `Maximum ${MAX_PARENTS} parents par famille`,
  },
  ADULT_PLAYER: {
    max: MAX_ADULT_PLAYERS,
    code: 'TOO_MANY_ADULT_PLAYERS',
    message: `Maximum ${MAX_ADULT_PLAYERS} adultes joueurs par famille`,
  },
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Même réponse pour un jeton inconnu, expiré, révoqué ou déjà utilisé (aucune information divulguée). */
const invalid = () =>
  new AppError('INVITATION_INVALID', 'Cette invitation n’est plus valide', HttpStatus.NOT_FOUND);

/** Verrou de ligne sur la famille, pour la durée de la transaction. */
async function lockFamily(tx: Tx, familyId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Family" WHERE id = ${familyId} FOR UPDATE`;
}

type InvitationWithCreator = ParentInvitation & { createdBy: Pick<User, 'displayName'> | null };

/** Données facultatives transmises à l'acceptation. */
export interface AcceptInput {
  /** PIN parent (invitation PARENT, compte sans PIN). */
  parentPin?: string;
  /** Profil de jeu (invitation ADULT_PLAYER). */
  displayName?: string;
  avatar?: string;
  color?: string;
}

/**
 * Invitation d'un membre adulte : parent supplémentaire ou adulte joueur (« Mamie »).
 * Chaque adulte garde son propre compte (e-mail, mot de passe, sessions) et rejoint la
 * famille existante via `User.familyId` + `User.familyRole`. Les protections (jeton haché,
 * usage unique, expiration, révocation, verrou de famille, limites) sont communes aux deux rôles.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly tokens: TokenService,
  ) {}

  private view(i: InvitationWithCreator): ParentInvitationView {
    return {
      id: i.id,
      role: i.role,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      createdBy: i.createdBy?.displayName ?? null,
    };
  }

  private pendingWhere(now = new Date()) {
    return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
  }

  async list(familyId: string): Promise<ParentInvitationView[]> {
    const list = await this.prisma.parentInvitation.findMany({
      where: { familyId, ...this.pendingWhere() },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { displayName: true } } },
    });
    return list.map((i) => this.view(i));
  }

  async create(
    auth: AuthContext,
    familyId: string,
    role: FamilyUserRole,
    client: ClientInfo,
  ): Promise<CreatedParentInvitation> {
    const token = randomBytes(32).toString('base64url');
    const limit = LIMITS[role];
    const invitation = await this.prisma.$transaction(async (tx) => {
      await lockFamily(tx, familyId);
      const [members, pending] = await Promise.all([
        tx.user.count({ where: { familyId, familyRole: role } }),
        tx.parentInvitation.count({ where: { familyId, ...this.pendingWhere() } }),
      ]);
      if (members >= limit.max) throw Errors.badRequest(limit.code, limit.message);
      if (pending >= MAX_PENDING_INVITATIONS) {
        throw Errors.badRequest('TOO_MANY_INVITATIONS', 'Trop d’invitations en attente');
      }
      return tx.parentInvitation.create({
        data: {
          familyId,
          role,
          tokenHash: hashToken(token),
          createdById: auth.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000),
        },
        include: { createdBy: { select: { displayName: true } } },
      });
    });
    await this.audit.log({
      action: role === 'PARENT' ? 'PARENT_INVITE_CREATED' : 'ADULT_PLAYER_INVITE_CREATED',
      userId: auth.userId,
      familyId,
      metadata: { invitationId: invitation.id },
      ...client,
    });
    return { ...this.view(invitation), token };
  }

  async revoke(auth: AuthContext, familyId: string, id: string, client: ClientInfo): Promise<void> {
    const { count } = await this.prisma.parentInvitation.updateMany({
      where: { id, familyId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw Errors.notFound('Invitation');
    await this.audit.log({
      action: 'PARENT_INVITE_REVOKED',
      userId: auth.userId,
      familyId,
      metadata: { invitationId: id },
      ...client,
    });
  }

  /** Aperçu public : seulement le nom de la famille, le nom affiché de l'invitant et le rôle. */
  async preview(token: string, viewerFamilyId: string | null): Promise<ParentInvitationPreview> {
    const invitation = await this.findValid(token);
    return {
      familyName: invitation.family.name,
      invitedBy: invitation.createdBy?.displayName ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      alreadyMember: viewerFamilyId === invitation.familyId,
      role: invitation.role,
    };
  }

  /**
   * Rattache le compte connecté à la famille de l'invitation (usage unique), avec le rôle
   * de l'invitation. Pour un adulte joueur, crée son profil de jeu et bascule IMMÉDIATEMENT
   * la session courante en mode PLAYER (nouveau jeton renvoyé) : aucun droit parent ne subsiste.
   */
  async accept(
    auth: AuthContext,
    token: string,
    input: AcceptInput,
    client: ClientInfo,
  ): Promise<{ result: AcceptedInvitation; tokens: IssuedTokens | null }> {
    const invitation = await this.findValid(token);
    const role = invitation.role;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.familyId === invitation.familyId) {
      throw Errors.conflict('ALREADY_MEMBER', 'Tu fais déjà partie de cette famille');
    }
    if (user.familyId) {
      throw Errors.conflict('ALREADY_IN_FAMILY', 'Ce compte appartient déjà à une autre famille');
    }
    let pinHash: string | undefined;
    if (role === 'PARENT') {
      // Chaque parent a son propre PIN parent pour ouvrir l'espace parent sur un appareil partagé.
      if (!user.parentPinHash && !input.parentPin) {
        throw Errors.badRequest('PARENT_PIN_REQUIRED', 'Choisis ton code PIN parent');
      }
      pinHash =
        !user.parentPinHash && input.parentPin ? await hashSecret(input.parentPin) : undefined;
    }
    const profile = role === 'ADULT_PLAYER' ? adultProfileInput(user, input) : null;

    const sessionId = await this.prisma.$transaction(async (tx) => {
      // Sérialise les acceptations d'une même famille : les limites ne peuvent pas être
      // dépassées par deux invitations différentes acceptées en même temps.
      await lockFamily(tx, invitation.familyId);
      // Transition gardée : une invitation ne peut être acceptée qu'une seule fois.
      const claimed = await tx.parentInvitation.updateMany({
        where: { id: invitation.id, ...this.pendingWhere() },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      if (claimed.count === 0) throw invalid();
      const limit = LIMITS[role];
      const members = await tx.user.count({
        where: { familyId: invitation.familyId, familyRole: role },
      });
      if (members >= limit.max) throw Errors.badRequest(limit.code, limit.message);

      const joined = await tx.user.updateMany({
        where: { id: user.id, familyId: null },
        data:
          role === 'PARENT'
            ? {
                familyId: invitation.familyId,
                familyRole: 'PARENT',
                ...(pinHash ? { parentPinHash: pinHash } : {}),
              }
            : {
                familyId: invitation.familyId,
                familyRole: 'ADULT_PLAYER',
                // Un adulte joueur n'a jamais de PIN parent.
                parentPinHash: null,
                parentPinFailedAttempts: 0,
                parentPinLockedUntil: null,
              },
      });
      if (joined.count === 0) {
        throw Errors.conflict('ALREADY_IN_FAMILY', 'Ce compte appartient déjà à une autre famille');
      }
      if (!profile) return null;

      // Profil de jeu propre à l'adulte (aucune créature : il l'adopte comme un enfant).
      const player = await tx.playerProfile.create({
        data: {
          familyId: invitation.familyId,
          type: 'ADULT',
          userId: user.id,
          displayName: profile.displayName,
          avatar: profile.avatar,
          color: profile.color,
          pinHash: null,
          inventory: { create: STARTER_INVENTORY },
        },
      });
      // Les autres sessions du compte (ouvertes en mode parent avant l'invitation) sont révoquées ;
      // la session courante devient une session de jeu PLAYER sur son propre profil.
      await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authSession.update({
        where: { id: auth.sessionId },
        data: { mode: 'PLAYER', childId: player.id, parentModeExpiresAt: null },
      });
      return auth.sessionId;
    });

    // Les sockets ouvertes sans famille (ou en mode parent) se reconnectent avec leurs nouvelles salles.
    this.realtime.disconnectUser(user.id);
    await this.audit.log({
      action: role === 'PARENT' ? 'PARENT_INVITE_ACCEPTED' : 'ADULT_PLAYER_INVITE_ACCEPTED',
      userId: user.id,
      familyId: invitation.familyId,
      metadata: { invitationId: invitation.id },
      ...client,
    });
    let tokens: IssuedTokens | null = null;
    if (sessionId) {
      const session = await this.prisma.authSession.findUniqueOrThrow({ where: { id: sessionId } });
      tokens = { access: this.tokens.signAccess(session, invitation.familyId) };
    }
    return {
      result: { familyId: invitation.familyId, familyName: invitation.family.name, role },
      tokens,
    };
  }

  private async findValid(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw invalid();
    const invitation = await this.prisma.parentInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { family: { select: { name: true } }, createdBy: { select: { displayName: true } } },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw invalid();
    }
    return invitation;
  }
}

/** Profil de jeu de l'adulte : valeurs choisies, sinon valeurs par défaut sûres. */
function adultProfileInput(user: User, input: AcceptInput) {
  const fallbackName = user.displayName
    .replace(/[^\p{L}\p{N} '’-]/gu, '')
    .trim()
    .slice(0, 24);
  return {
    displayName: input.displayName ?? (fallbackName || 'Joueur'),
    avatar: input.avatar && AVATARS.includes(input.avatar) ? input.avatar : '🦉',
    color:
      input.color && CHILD_COLORS.includes(input.color) ? input.color : (CHILD_COLORS[0] as string),
  };
}
