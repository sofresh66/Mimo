import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Letter } from '@prisma/client';
import { normalizeLetterContent, type ItemDefinition } from '@mimo/game-data';
import type {
  LetterBox,
  LetterComposeView,
  LetterPage,
  LetterParty,
  LetterRecipientView,
  LetterView,
  MailSummary,
  SendLetterInput,
  StationeryView,
} from '@mimo/types';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ownsUnlockable, sceneView, unlockViews } from '../room/room.service';

/** Taille d'une page de lettres. */
export const LETTER_PAGE_SIZE = 20;
/** Avatar et couleur d'un parent (les comptes parent n'ont pas de profil de jeu). */
const PARENT_AVATAR = '🧑';
const PARENT_COLOR = '#f3c98b';
/** Avatar d'un destinataire dont le profil a été supprimé. */
const GONE_AVATAR = '💌';

/**
 * Lecteur d'une boîte aux lettres : un profil de jeu (enfant ou adulte joueur, issu de la
 * session) ou un compte parent (espace parent déverrouillé). Jamais un identifiant de l'URL.
 */
export type Mailbox =
  | { kind: 'profile'; familyId: string; profileId: string }
  | { kind: 'parent'; familyId: string; userId: string };

const CONTENT_ERRORS = {
  EMPTY: ['LETTER_EMPTY', 'Écris quelques mots avant d’envoyer ta lettre'],
  TOO_LONG: ['LETTER_TOO_LONG', 'Ta lettre est trop longue'],
  INVALID_CHARACTERS: ['LETTER_INVALID', 'Ta lettre contient un caractère invalide'],
} as const;

const recipientAvatar = { recipientProfile: { select: { avatar: true } } } as const;
type LetterRow = Letter & { recipientProfile: { avatar: string } | null };

/**
 * Courrier familial. Règles :
 * - expéditeur et destinataire appartiennent toujours à la famille de la session ;
 * - une lettre n'est lisible que par son expéditeur, son destinataire, ou un parent (espace
 *   parent) lorsqu'elle implique un profil enfant ; les lettres entre adultes restent privées ;
 * - le contenu n'est jamais journalisé ni envoyé en temps réel (événement léger après commit).
 */
@Injectable()
export class LettersService {
  private readonly logger = new Logger(LettersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly realtime: RealtimeService,
  ) {}

  // ─── Lecture ────────────────────────────────────────────────────────────────

  async list(box: Mailbox, kind: LetterBox, cursor?: string): Promise<LetterPage> {
    const mine = this.ownWhere(box);
    const where: Prisma.LetterWhereInput =
      kind === 'sent'
        ? mine.sent
        : kind === 'cherished'
          ? { ...mine.received, cherishedAt: { not: null } }
          : mine.received;
    return this.page(box, where, cursor);
  }

  async get(box: Mailbox, id: string): Promise<LetterView> {
    const letter = await this.findOwn(box, id);
    return this.view(letter, box);
  }

  /** Passage non lu → lu (idempotent ; uniquement par le destinataire). */
  async markRead(box: Mailbox, id: string): Promise<LetterView> {
    const { received } = this.ownWhere(box);
    await this.prisma.letter.updateMany({
      where: { ...received, id, readAt: null },
      data: { readAt: new Date() },
    });
    // L'expéditeur peut relire sa lettre, sans la marquer lue ; un tiers reçoit 404.
    return this.get(box, id);
  }

  /** « Garder précieusement » : choix du destinataire uniquement. */
  async cherish(box: Mailbox, id: string, cherished: boolean): Promise<LetterView> {
    const { received } = this.ownWhere(box);
    const letter = await this.prisma.letter.findFirst({ where: { ...received, id } });
    if (!letter) throw Errors.notFound('Lettre');
    if (cherished !== Boolean(letter.cherishedAt)) {
      await this.prisma.letter.update({
        where: { id: letter.id },
        data: { cherishedAt: cherished ? new Date() : null },
      });
    }
    return this.get(box, id);
  }

  async summary(box: Mailbox): Promise<MailSummary> {
    const unreadWhere = { ...this.ownWhere(box).received, readAt: null };
    const [unread, latest] = await Promise.all([
      this.prisma.letter.count({ where: unreadWhere }),
      this.prisma.letter.findFirst({
        where: unreadWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { senderName: true, senderCreatureName: true },
      }),
    ]);
    return {
      unread,
      latestFrom: latest
        ? { name: latest.senderName, creatureName: latest.senderCreatureName }
        : null,
    };
  }

  /**
   * Supervision parentale (lecture seule) : lettres reçues ou envoyées par un profil ENFANT de
   * la famille. Ne marque jamais une lettre comme lue. Les lettres entre adultes n'y figurent
   * jamais : le profil supervisé doit être un enfant et faire partie de la lettre.
   */
  async supervise(
    familyId: string,
    childId: string,
    kind: 'received' | 'sent',
    cursor?: string,
  ): Promise<LetterPage> {
    const child = await this.prisma.playerProfile.findFirst({
      where: { id: childId, familyId, type: 'CHILD' },
      select: { id: true },
    });
    if (!child) throw Errors.notFound('Profil enfant');
    const where: Prisma.LetterWhereInput =
      kind === 'sent'
        ? { familyId, senderProfileId: child.id }
        : { familyId, recipientProfileId: child.id };
    return this.page({ kind: 'profile', familyId, profileId: child.id }, where, cursor);
  }

  // ─── Écriture ───────────────────────────────────────────────────────────────

  /** Destinataires possibles (famille de la session uniquement) et papiers à lettres. */
  async compose(box: Mailbox): Promise<LetterComposeView> {
    const [profiles, parents, owned] = await Promise.all([
      this.prisma.playerProfile.findMany({
        where: { familyId: box.familyId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, displayName: true, avatar: true, color: true },
      }),
      this.prisma.user.findMany({
        where: { familyId: box.familyId, familyRole: 'PARENT' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, displayName: true },
      }),
      this.ownedStationery(box),
    ]);
    const recipients: LetterRecipientView[] = [
      ...parents
        .filter((p) => box.kind !== 'parent' || p.id !== box.userId)
        .map((p) => ({
          kind: 'parent' as const,
          id: p.id,
          name: p.displayName,
          avatar: PARENT_AVATAR,
          color: PARENT_COLOR,
        })),
      ...profiles
        .filter((p) => box.kind !== 'profile' || p.id !== box.profileId)
        .map((p) => ({
          kind: 'profile' as const,
          id: p.id,
          name: p.displayName,
          avatar: p.avatar,
          color: p.color,
        })),
    ];
    const index = this.catalog.index;
    const stationery = index.stationery().map((def) => ({
      item: stationeryView(def),
      owned: ownsUnlockable(def, owned),
      unlock: unlockViews(def, index),
    }));
    return { recipients, stationery };
  }

  async send(box: Mailbox, input: SendLetterInput): Promise<LetterView> {
    const normalized = normalizeLetterContent(input.content);
    if (!normalized.ok) {
      const [code, message] = CONTENT_ERRORS[normalized.error];
      throw Errors.badRequest(code, message);
    }
    const sender =
      box.kind === 'profile'
        ? { senderProfileId: box.profileId, senderUserId: null }
        : { senderProfileId: null, senderUserId: box.userId };

    // Nouvel essai réseau : la lettre déjà enregistrée est renvoyée, sans doublon.
    const existing = await this.byRequest(box, input.requestId, sender);
    if (existing) return existing;

    const [from, to, owned] = await Promise.all([
      this.senderIdentity(box),
      this.resolveRecipient(box, input.to),
      this.ownedStationery(box),
    ]);
    const paper = this.catalog.index.items.get(input.stationeryId);
    if (!paper || paper.category !== 'STATIONERY') {
      throw Errors.badRequest('NOT_STATIONERY', 'Ce n’est pas un papier à lettres');
    }
    if (!ownsUnlockable(paper, owned)) {
      throw Errors.badRequest('STATIONERY_LOCKED', 'Ce papier à lettres n’est pas encore débloqué');
    }

    let letter: LetterRow;
    try {
      letter = await this.prisma.letter.create({
        data: {
          familyId: box.familyId,
          ...sender,
          recipientProfileId: to.kind === 'profile' ? to.id : null,
          recipientUserId: to.kind === 'parent' ? to.id : null,
          senderName: from.name,
          senderAvatar: from.avatar,
          senderCreatureName: from.creatureName,
          recipientName: to.name,
          content: normalized.content,
          stationeryId: paper.key,
          requestId: input.requestId,
        },
        include: recipientAvatar,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.byRequest(box, input.requestId, sender);
        if (raced) return raced;
        throw Errors.conflict('LETTER_DUPLICATE', 'Cette lettre a déjà été envoyée');
      }
      // Jamais le message d'origine : il peut reprendre les arguments (texte privé).
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'unknown';
      this.logger.error(`Envoi de lettre en échec (famille ${box.familyId}, code ${code})`);
      throw new Error('Envoi de lettre impossible');
    }

    // La lettre est en base : notification légère, sans contenu, au seul destinataire.
    const payload = {
      letterId: letter.id,
      senderName: letter.senderName,
      creatureName: letter.senderCreatureName,
    };
    if (to.kind === 'profile') this.realtime.toChild(to.id, 'mail:received', payload);
    else this.realtime.toParentUser(to.id, 'mail:received', payload);
    return this.view(letter, box);
  }

  // ─── Interne ────────────────────────────────────────────────────────────────

  private readerId(box: Mailbox): string {
    return box.kind === 'profile' ? box.profileId : box.userId;
  }

  /** Filtres « reçues » et « envoyées » du lecteur, toujours bornés à sa famille. */
  private ownWhere(box: Mailbox): {
    received: Prisma.LetterWhereInput;
    sent: Prisma.LetterWhereInput;
  } {
    return box.kind === 'profile'
      ? {
          received: { familyId: box.familyId, recipientProfileId: box.profileId },
          sent: { familyId: box.familyId, senderProfileId: box.profileId },
        }
      : {
          received: { familyId: box.familyId, recipientUserId: box.userId },
          sent: { familyId: box.familyId, senderUserId: box.userId },
        };
  }

  private async findOwn(box: Mailbox, id: string): Promise<LetterRow> {
    const { received, sent } = this.ownWhere(box);
    const letter = await this.prisma.letter.findFirst({
      where: { id, OR: [received, sent] },
      include: recipientAvatar,
    });
    if (!letter) throw Errors.notFound('Lettre');
    return letter;
  }

  private async byRequest(
    box: Mailbox,
    requestId: string,
    sender: { senderProfileId: string | null; senderUserId: string | null },
  ): Promise<LetterView | null> {
    const letter = await this.prisma.letter.findUnique({
      where: { familyId_requestId: { familyId: box.familyId, requestId } },
      include: recipientAvatar,
    });
    if (!letter) return null;
    if (
      letter.senderProfileId !== sender.senderProfileId ||
      letter.senderUserId !== sender.senderUserId
    ) {
      throw Errors.conflict('LETTER_DUPLICATE', 'Cette lettre a déjà été envoyée');
    }
    return this.view(letter, box);
  }

  private async page(
    box: Mailbox,
    where: Prisma.LetterWhereInput,
    cursor?: string,
  ): Promise<LetterPage> {
    const after = decodeCursor(cursor);
    const rows = await this.prisma.letter.findMany({
      where: after
        ? {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              },
            ],
          }
        : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LETTER_PAGE_SIZE + 1,
      include: recipientAvatar,
    });
    const letters = rows.slice(0, LETTER_PAGE_SIZE);
    const last = letters.at(-1);
    return {
      letters: letters.map((l) => this.view(l, box)),
      nextCursor: rows.length > LETTER_PAGE_SIZE && last ? encodeCursor(last) : null,
    };
  }

  private async senderIdentity(
    box: Mailbox,
  ): Promise<{ name: string; avatar: string; creatureName: string | null }> {
    if (box.kind === 'parent') {
      const user = await this.prisma.user.findFirst({
        where: { id: box.userId, familyId: box.familyId, familyRole: 'PARENT' },
        select: { displayName: true },
      });
      if (!user) throw Errors.forbidden();
      return { name: user.displayName, avatar: PARENT_AVATAR, creatureName: null };
    }
    const profile = await this.prisma.playerProfile.findFirst({
      where: { id: box.profileId, familyId: box.familyId },
      select: {
        displayName: true,
        avatar: true,
        creatures: { where: { isActive: true }, select: { name: true }, take: 1 },
      },
    });
    if (!profile) throw Errors.forbidden();
    return {
      name: profile.displayName,
      avatar: profile.avatar,
      creatureName: profile.creatures[0]?.name ?? null,
    };
  }

  /**
   * Destinataire : cherché par identifiant ET par famille de la session. Un identifiant d'une
   * autre famille donne la même réponse qu'un identifiant inexistant (aucune information).
   */
  private async resolveRecipient(
    box: Mailbox,
    target: SendLetterInput['to'],
  ): Promise<{ kind: 'profile' | 'parent'; id: string; name: string }> {
    if (target.id === this.readerId(box) && target.kind === box.kind) {
      throw Errors.badRequest('LETTER_TO_SELF', 'Choisis un autre membre de ta famille');
    }
    if (target.kind === 'profile') {
      const profile = await this.prisma.playerProfile.findFirst({
        where: { id: target.id, familyId: box.familyId },
        select: { id: true, displayName: true },
      });
      if (!profile) throw Errors.notFound('Destinataire');
      return { kind: 'profile', id: profile.id, name: profile.displayName };
    }
    const parent = await this.prisma.user.findFirst({
      where: { id: target.id, familyId: box.familyId, familyRole: 'PARENT' },
      select: { id: true, displayName: true },
    });
    if (!parent) throw Errors.notFound('Destinataire');
    return { kind: 'parent', id: parent.id, name: parent.displayName };
  }

  /** Papiers possédés (inventaire du profil) ; un parent n'a que le papier par défaut. */
  private async ownedStationery(box: Mailbox): Promise<Map<string, number>> {
    if (box.kind === 'parent') return new Map();
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        inventory: { childId: box.profileId },
        quantity: { gt: 0 },
        item: { category: 'STATIONERY' },
      },
      select: { itemId: true, quantity: true },
    });
    return new Map(items.map((i) => [i.itemId, i.quantity]));
  }

  private view(letter: LetterRow, box: Mailbox): LetterView {
    const index = this.catalog.index;
    const paper = index.items.get(letter.stationeryId) ?? index.defaultStationery();
    const from: LetterParty = {
      kind: letter.senderUserId ? 'parent' : 'profile',
      id: letter.senderProfileId ?? letter.senderUserId,
      name: letter.senderName,
      avatar: letter.senderAvatar,
    };
    const to: LetterParty = {
      kind: letter.recipientUserId ? 'parent' : 'profile',
      id: letter.recipientProfileId ?? letter.recipientUserId,
      name: letter.recipientName,
      avatar: letter.recipientUserId
        ? PARENT_AVATAR
        : (letter.recipientProfile?.avatar ?? GONE_AVATAR),
    };
    const mine =
      box.kind === 'profile'
        ? letter.senderProfileId === box.profileId
        : letter.senderUserId === box.userId;
    return {
      id: letter.id,
      from,
      to,
      creatureName: letter.senderCreatureName,
      content: letter.content,
      stationery: stationeryView(paper),
      createdAt: letter.createdAt.toISOString(),
      readAt: letter.readAt?.toISOString() ?? null,
      cherishedAt: letter.cherishedAt?.toISOString() ?? null,
      mine,
    };
  }
}

export function stationeryView(def: ItemDefinition): StationeryView {
  return { id: def.key, name: t(def.name), emoji: def.emoji, scene: sceneView(def.scene) };
}

function encodeCursor(letter: { createdAt: Date; id: string }): string {
  return Buffer.from(`${letter.createdAt.toISOString()}|${letter.id}`).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw Errors.badRequest('INVALID_CURSOR', 'Page invalide');
  }
  return { createdAt, id };
}
