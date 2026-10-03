import { Injectable } from '@nestjs/common';
import type { CompanionAction, FamilySettings, PlayerProfile } from '@mimo/types';
import { AuditService } from '../audit/audit.service';
import type { ClientInfo } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';
import { hashSecret, verifySecret } from '../auth/secrets';
import { Errors } from '../common/errors';
import { CatalogService } from '../content/catalog.service';
import { creatureSummary } from '../content/views';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateChildDto,
  CreateFamilyDto,
  ParentPinDto,
  UpdateChildDto,
  UpdateFamilyDto,
} from './dto';

export const MAX_CHILDREN = 8;
/** Pièces de bienvenue pour un nouveau profil enfant. */
export const WELCOME_COINS = 50;
/** Inventaire de départ de tout nouveau profil de jeu (enfant ou adulte joueur). */
export const STARTER_INVENTORY = {
  coins: WELCOME_COINS,
  items: {
    create: [
      { itemId: 'apple', quantity: 3 },
      { itemId: 'strawberry', quantity: 2 },
      { itemId: 'milk', quantity: 2 },
      { itemId: 'ball', quantity: 1 },
    ],
  },
};

@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  async create(
    auth: AuthContext,
    dto: CreateFamilyDto,
    client: ClientInfo,
  ): Promise<FamilySettings> {
    if (auth.familyId) throw Errors.conflict('FAMILY_EXISTS', 'Tu as déjà une famille');
    const pinHash = await hashSecret(dto.parentPin);
    const family = await this.prisma.$transaction(async (tx) => {
      const created = await tx.family.create({
        data: {
          name: dto.name,
          village: { create: { buildings: { create: { buildingId: 'house' } } } },
        },
      });
      await tx.user.update({
        where: { id: auth.userId },
        data: { familyId: created.id, parentPinHash: pinHash },
      });
      return created;
    });
    await this.audit.log({
      action: 'FAMILY_CREATED',
      userId: auth.userId,
      familyId: family.id,
      ...client,
    });
    return this.settings(family.id);
  }

  async settings(familyId: string): Promise<FamilySettings> {
    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            email: true,
            familyRole: true,
            playerProfile: { select: { id: true } },
          },
        },
      },
    });
    const parents = family.members.filter((m) => m.familyRole === 'PARENT');
    const adults = family.members.filter((m) => m.familyRole === 'ADULT_PLAYER');
    return {
      id: family.id,
      name: family.name,
      companionEnabled: family.companionEnabled,
      companionAllowedActions: family.companionAllowedActions as CompanionAction[],
      parents: parents.map(({ id, displayName, email }) => ({ id, displayName, email })),
      adultPlayers: adults.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        email: a.email,
        profileId: a.playerProfile?.id ?? null,
      })),
    };
  }

  async update(familyId: string, dto: UpdateFamilyDto): Promise<FamilySettings> {
    await this.prisma.family.update({
      where: { id: familyId },
      data: {
        name: dto.name,
        companionEnabled: dto.companionEnabled,
        companionAllowedActions: dto.companionAllowedActions,
      },
    });
    return this.settings(familyId);
  }

  async setParentPin(auth: AuthContext, dto: ParentPinDto, client: ClientInfo): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await verifySecret(user.passwordHash, dto.currentPassword))) {
      throw Errors.badRequest('INVALID_CREDENTIALS', 'Mot de passe incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        parentPinHash: await hashSecret(dto.pin),
        parentPinFailedAttempts: 0,
        parentPinLockedUntil: null,
      },
    });
    await this.audit.log({
      action: 'PARENT_PIN_CHANGED',
      userId: user.id,
      familyId: auth.familyId,
      ...client,
    });
  }

  // ─── Profils enfants ───────────────────────────────────────────────────────

  /**
   * Écran « Qui joue ? » : profils enfants de la famille de l'appareil. Les adultes joueurs
   * n'y figurent pas (ils se connectent avec leur propre compte, jamais par PIN), sauf pour
   * l'espace parent (`includeAdults`) qui leur attribue missions et récompenses.
   */
  async profiles(familyId: string, includeAdults = false): Promise<PlayerProfile[]> {
    const children = await this.prisma.playerProfile.findMany({
      where: { familyId, ...(includeAdults ? {} : { type: 'CHILD' as const }) },
      orderBy: { createdAt: 'asc' },
      include: { creatures: { where: { isActive: true }, take: 1 } },
    });
    const now = new Date();
    return children.map((c) => ({
      id: c.id,
      type: c.type,
      displayName: c.displayName,
      avatar: c.avatar,
      color: c.color,
      locked: Boolean(c.pinLockedUntil && c.pinLockedUntil > now),
      creature: c.creatures[0] ? creatureSummary(c.creatures[0], this.catalog.index) : null,
    }));
  }

  async createChild(auth: AuthContext, familyId: string, dto: CreateChildDto, client: ClientInfo) {
    const count = await this.prisma.playerProfile.count({ where: { familyId, type: 'CHILD' } });
    if (count >= MAX_CHILDREN) {
      throw Errors.badRequest('TOO_MANY_CHILDREN', `Maximum ${MAX_CHILDREN} profils par famille`);
    }
    const child = await this.prisma.playerProfile.create({
      data: {
        familyId,
        type: 'CHILD',
        displayName: dto.displayName,
        avatar: dto.avatar,
        color: dto.color,
        pinHash: await hashSecret(dto.pin),
        inventory: { create: STARTER_INVENTORY },
      },
    });
    await this.audit.log({
      action: 'CHILD_CREATED',
      userId: auth.userId,
      familyId,
      childId: child.id,
      ...client,
    });
    return { id: child.id };
  }

  async updateChild(familyId: string, childId: string, dto: UpdateChildDto): Promise<void> {
    await this.assertChild(familyId, childId);
    await this.prisma.playerProfile.update({ where: { id: childId }, data: dto });
  }

  async changeChildPin(
    auth: AuthContext,
    familyId: string,
    childId: string,
    pin: string,
    client: ClientInfo,
  ) {
    await this.assertChild(familyId, childId);
    await this.prisma.playerProfile.update({
      where: { id: childId },
      data: { pinHash: await hashSecret(pin), pinFailedAttempts: 0, pinLockedUntil: null },
    });
    await this.audit.log({
      action: 'CHILD_PIN_CHANGED',
      userId: auth.userId,
      familyId,
      childId,
      ...client,
    });
  }

  /**
   * Suppression définitive d'un profil et de toutes ses données de jeu (droit à l'effacement).
   * Exception voulue : les lettres familiales déjà échangées restent des souvenirs pour les
   * autres membres (profil détaché, nom figé à l'envoi) ; l'interface parent le signale.
   */
  async deleteChild(
    auth: AuthContext,
    familyId: string,
    childId: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.assertChild(familyId, childId);
    await this.prisma.playerProfile.delete({ where: { id: childId } });
    await this.audit.log({ action: 'CHILD_DELETED', userId: auth.userId, familyId, ...client });
  }

  /**
   * Profil ENFANT de la famille. Le profil d'un adulte joueur n'est ni modifiable, ni
   * supprimable, ni doté d'un PIN par ces routes : il appartient au compte de l'adulte.
   */
  async assertChild(familyId: string, childId: string): Promise<void> {
    const child = await this.prisma.playerProfile.findFirst({
      where: { id: childId, familyId, type: 'CHILD' },
      select: { id: true },
    });
    if (!child) throw Errors.notFound('Profil');
  }
}
