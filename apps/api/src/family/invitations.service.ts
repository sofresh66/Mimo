import { HttpStatus, Injectable } from '@nestjs/common';
import type { ParentInvitation, User } from '@prisma/client';
import type {
  CreatedParentInvitation,
  ParentInvitationPreview,
  ParentInvitationView,
} from '@mimo/types';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { ClientInfo } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';
import { hashSecret } from '../auth/secrets';
import { AppError, Errors } from '../common/errors';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

/** Durée de validité d'une invitation. */
export const INVITATION_TTL_HOURS = 72;
/** Nombre maximal de parents par famille. */
export const MAX_PARENTS = 4;
/** Nombre maximal d'invitations en attente simultanément. */
export const MAX_PENDING_INVITATIONS = 5;
/** Jeton : 32 octets aléatoires encodés en base64url (43 caractères). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Même réponse pour un jeton inconnu, expiré, révoqué ou déjà utilisé (aucune information divulguée). */
const invalid = () =>
  new AppError('INVITATION_INVALID', 'Cette invitation n’est plus valide', HttpStatus.NOT_FOUND);

/** Verrou de ligne sur la famille, pour la durée de la transaction. */
async function lockFamily(tx: Tx, familyId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Family" WHERE id = ${familyId} FOR UPDATE`;
}

type InvitationWithCreator = ParentInvitation & { createdBy: Pick<User, 'displayName'> | null };

/**
 * Invitation d'un parent supplémentaire : chaque parent garde son propre compte
 * (e-mail, mot de passe, sessions, PIN parent) et rejoint la famille existante
 * via `User.familyId` — aucune table d'appartenance supplémentaire.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  private view(i: InvitationWithCreator): ParentInvitationView {
    return {
      id: i.id,
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
    client: ClientInfo,
  ): Promise<CreatedParentInvitation> {
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.$transaction(async (tx) => {
      await lockFamily(tx, familyId);
      const [parents, pending] = await Promise.all([
        tx.user.count({ where: { familyId } }),
        tx.parentInvitation.count({ where: { familyId, ...this.pendingWhere() } }),
      ]);
      if (parents >= MAX_PARENTS) {
        throw Errors.badRequest('FAMILY_FULL', `Maximum ${MAX_PARENTS} parents par famille`);
      }
      if (pending >= MAX_PENDING_INVITATIONS) {
        throw Errors.badRequest('TOO_MANY_INVITATIONS', 'Trop d’invitations en attente');
      }
      return tx.parentInvitation.create({
        data: {
          familyId,
          tokenHash: hashToken(token),
          createdById: auth.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000),
        },
        include: { createdBy: { select: { displayName: true } } },
      });
    });
    await this.audit.log({
      action: 'PARENT_INVITE_CREATED',
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

  /** Aperçu public : seulement le nom de la famille et le nom affiché de l'invitant. */
  async preview(token: string, viewerFamilyId: string | null): Promise<ParentInvitationPreview> {
    const invitation = await this.findValid(token);
    return {
      familyName: invitation.family.name,
      invitedBy: invitation.createdBy?.displayName ?? null,
      expiresAt: invitation.expiresAt.toISOString(),
      alreadyMember: viewerFamilyId === invitation.familyId,
    };
  }

  /** Rattache le compte connecté à la famille de l'invitation (usage unique). */
  async accept(
    auth: AuthContext,
    token: string,
    parentPin: string | undefined,
    client: ClientInfo,
  ): Promise<{ familyId: string; familyName: string }> {
    const invitation = await this.findValid(token);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.familyId === invitation.familyId) {
      throw Errors.conflict('ALREADY_MEMBER', 'Tu fais déjà partie de cette famille');
    }
    if (user.familyId) {
      throw Errors.conflict('ALREADY_IN_FAMILY', 'Ce compte appartient déjà à une autre famille');
    }
    // Chaque parent a son propre PIN parent pour ouvrir l'espace parent sur un appareil partagé.
    if (!user.parentPinHash && !parentPin) {
      throw Errors.badRequest('PARENT_PIN_REQUIRED', 'Choisis ton code PIN parent');
    }
    const pinHash = !user.parentPinHash && parentPin ? await hashSecret(parentPin) : undefined;

    await this.prisma.$transaction(async (tx) => {
      // Sérialise les acceptations d'une même famille : la limite de parents ne peut pas
      // être dépassée par deux invitations différentes acceptées en même temps.
      await lockFamily(tx, invitation.familyId);
      // Transition gardée : une invitation ne peut être acceptée qu'une seule fois.
      const claimed = await tx.parentInvitation.updateMany({
        where: { id: invitation.id, ...this.pendingWhere() },
        data: { acceptedAt: new Date(), acceptedById: user.id },
      });
      if (claimed.count === 0) throw invalid();
      const parents = await tx.user.count({ where: { familyId: invitation.familyId } });
      if (parents >= MAX_PARENTS) {
        throw Errors.badRequest('FAMILY_FULL', `Maximum ${MAX_PARENTS} parents par famille`);
      }
      const joined = await tx.user.updateMany({
        where: { id: user.id, familyId: null },
        data: { familyId: invitation.familyId, ...(pinHash ? { parentPinHash: pinHash } : {}) },
      });
      if (joined.count === 0) {
        throw Errors.conflict('ALREADY_IN_FAMILY', 'Ce compte appartient déjà à une autre famille');
      }
    });

    // Les sockets ouvertes sans famille se reconnectent avec leurs nouvelles salles.
    this.realtime.disconnectUser(user.id);
    await this.audit.log({
      action: 'PARENT_INVITE_ACCEPTED',
      userId: user.id,
      familyId: invitation.familyId,
      metadata: { invitationId: invitation.id },
      ...client,
    });
    return { familyId: invitation.familyId, familyName: invitation.family.name };
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
