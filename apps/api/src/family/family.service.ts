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
      include: { parents: { select: { id: true, displayName: true, email: true } } },
    });
    return {
      id: family.id,
      name: family.name,
      companionEnabled: family.companionEnabled,
      companionAllowedActions: family.companionAllowedActions as CompanionAction[],
      parents: family.parents,
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

  /** Écran « Qui joue ? » : profils de la famille de l'appareil. */
  async profiles(familyId: string): Promise<PlayerProfile[]> {
    const children = await this.prisma.childProfile.findMany({
      where: { familyId },
      orderBy: { createdAt: 'asc' },
      include: { creatures: { where: { isActive: true }, take: 1 } },
    });
    const now = new Date();
    return children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      avatar: c.avatar,
      color: c.color,
      locked: Boolean(c.pinLockedUntil && c.pinLockedUntil > now),
      creature: c.creatures[0] ? creatureSummary(c.creatures[0], this.catalog.index) : null,
    }));
  }

  async createChild(auth: AuthContext, familyId: string, dto: CreateChildDto, client: ClientInfo) {
    const count = await this.prisma.childProfile.count({ where: { familyId } });
    if (count >= MAX_CHILDREN) {
      throw Errors.badRequest('TOO_MANY_CHILDREN', `Maximum ${MAX_CHILDREN} profils par famille`);
    }
    const child = await this.prisma.childProfile.create({
      data: {
        familyId,
        displayName: dto.displayName,
        avatar: dto.avatar,
        color: dto.color,
        pinHash: await hashSecret(dto.pin),
        inventory: {
          create: {
            coins: WELCOME_COINS,
            items: {
              create: [
                { itemId: 'apple', quantity: 3 },
                { itemId: 'strawberry', quantity: 2 },
                { itemId: 'milk', quantity: 2 },
                { itemId: 'ball', quantity: 1 },
              ],
            },
          },
        },
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
    await this.prisma.childProfile.update({ where: { id: childId }, data: dto });
  }

  async changeChildPin(
    auth: AuthContext,
    familyId: string,
    childId: string,
    pin: string,
    client: ClientInfo,
  ) {
    await this.assertChild(familyId, childId);
    await this.prisma.childProfile.update({
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

  /** Suppression définitive d'un profil et de toutes ses données (droit à l'effacement). */
  async deleteChild(
    auth: AuthContext,
    familyId: string,
    childId: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.assertChild(familyId, childId);
    await this.prisma.childProfile.delete({ where: { id: childId } });
    await this.audit.log({ action: 'CHILD_DELETED', userId: auth.userId, familyId, ...client });
  }

  async assertChild(familyId: string, childId: string): Promise<void> {
    const child = await this.prisma.childProfile.findFirst({
      where: { id: childId, familyId },
      select: { id: true },
    });
    if (!child) throw Errors.notFound('Profil');
  }
}
