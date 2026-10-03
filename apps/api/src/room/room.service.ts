import { Injectable } from '@nestjs/common';
import { Prisma, type PlayerProfile } from '@prisma/client';
import {
  ROOM_MAX_ITEMS,
  filterRoomLayout,
  legacyRoomLayout,
  parseRoomLayout,
  validateRoomLayout,
  type CatalogIndex,
  type ItemDefinition,
  type RoomPlacement,
  type SceneDefinition,
} from '@mimo/game-data';
import type {
  BackgroundView,
  RoomEditorView,
  RoomPlacementInput,
  RoomView,
  SceneUnlockView,
  SceneView,
} from '@mimo/types';
import { Errors } from '../common/errors';
import { t } from '../common/locale';
import { CatalogService } from '../content/catalog.service';
import { itemView } from '../content/views';
import { EventsService } from '../events/events.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

const LAYOUT_ERRORS: Record<string, string> = {
  TOO_MANY_ITEMS: `Maximum ${ROOM_MAX_ITEMS} objets dans l’espace`,
  NOT_PLACEABLE: 'Cet objet ne peut pas être placé',
  NOT_OWNED: 'Tu ne possèdes pas cet objet (ou pas assez d’exemplaires)',
  DUPLICATE_ID: 'Disposition invalide',
};

type RoomProfile = Pick<PlayerProfile, 'id' | 'roomBackground' | 'roomLayout' | 'roomDecorations'>;

/**
 * Espace de la créature : décor de fond et objets placés. Le client propose une disposition ;
 * le serveur vérifie la possession (aucune duplication) et borne les positions. Les anciennes
 * sauvegardes (sans décor ni disposition) sont lues avec des valeurs par défaut.
 */
@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly events: EventsService,
  ) {}

  // ─── Lecture ───────────────────────────────────────────────────────────────

  /** Objets possédés (quantité > 0), par clé. */
  async ownedCounts(childId: string, tx: Tx = this.prisma): Promise<Map<string, number>> {
    const items = await tx.inventoryItem.findMany({
      where: { inventory: { childId }, quantity: { gt: 0 } },
      select: { itemId: true, quantity: true },
    });
    return new Map(items.map((i) => [i.itemId, i.quantity]));
  }

  private isPlaceable = (key: string) => Boolean(this.catalog.index.items.get(key)?.decor);

  /** Disposition affichée : JSON enregistré, sinon ancienne chambre ; filtrée par la possession. */
  layoutOf(profile: RoomProfile, owned: ReadonlyMap<string, number>): RoomPlacement[] {
    const stored = parseRoomLayout(profile.roomLayout) ?? legacyRoomLayout(profile.roomDecorations);
    return filterRoomLayout(stored, owned, this.isPlaceable);
  }

  /** Décor actif : celui choisi s'il est toujours possédé, sinon le décor par défaut. */
  backgroundOf(profile: RoomProfile, owned: ReadonlyMap<string, number>): ItemDefinition {
    const index = this.catalog.index;
    const chosen = profile.roomBackground ? index.items.get(profile.roomBackground) : undefined;
    if (chosen?.category === 'BACKGROUND' && this.ownsBackground(chosen, owned)) return chosen;
    // Contenu non synchronisé (décor par défaut absent) : décor de secours, jamais d'erreur.
    return (
      index.backgrounds().find((b) => b.scene?.unlock.some((u) => u.kind === 'default')) ??
      FALLBACK_BACKGROUND
    );
  }

  private ownsBackground(def: ItemDefinition, owned: ReadonlyMap<string, number>): boolean {
    return ownsUnlockable(def, owned);
  }

  roomView(profile: RoomProfile, owned: ReadonlyMap<string, number>): RoomView {
    const index = this.catalog.index;
    const background = this.backgroundOf(profile, owned);
    return {
      background: {
        id: background.key,
        name: t(background.name),
        emoji: background.emoji,
        scene: sceneView(background.scene),
      },
      layout: this.layoutOf(profile, owned).map((p) => ({
        ...p,
        item: itemView(index.item(p.item)),
      })),
    };
  }

  async view(childId: string): Promise<RoomView> {
    const [profile, owned] = await Promise.all([
      this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } }),
      this.ownedCounts(childId),
    ]);
    return this.roomView(profile, owned);
  }

  /** Mode décoration : scène, collection de décors (possédés / verrouillés), objets plaçables. */
  async editor(childId: string): Promise<RoomEditorView> {
    const [profile, owned] = await Promise.all([
      this.prisma.playerProfile.findUniqueOrThrow({ where: { id: childId } }),
      this.ownedCounts(childId),
    ]);
    const index = this.catalog.index;
    const room = this.roomView(profile, owned);
    const placedCount = new Map<string, number>();
    for (const p of room.layout) placedCount.set(p.item.id, (placedCount.get(p.item.id) ?? 0) + 1);
    const backgrounds: BackgroundView[] = index.backgrounds().map((bg) => ({
      item: itemView(bg),
      scene: sceneView(bg.scene),
      owned: this.ownsBackground(bg, owned),
      current: bg.key === room.background.id,
      unlock: unlockViews(bg, index),
    }));
    const placeables = index.catalog.items
      .filter((i) => i.decor && (owned.get(i.key) ?? 0) > 0)
      .map((i) => ({
        item: itemView(i),
        owned: owned.get(i.key) ?? 0,
        placed: placedCount.get(i.key) ?? 0,
      }));
    return { room, backgrounds, placeables, maxItems: ROOM_MAX_ITEMS };
  }

  // ─── Écriture ──────────────────────────────────────────────────────────────

  async setBackground(childId: string, itemId: string): Promise<RoomView> {
    const def = this.catalog.index.items.get(itemId);
    if (!def || def.category !== 'BACKGROUND') {
      throw Errors.badRequest('NOT_BACKGROUND', 'Ce n’est pas un décor');
    }
    const owned = await this.ownedCounts(childId);
    if (!this.ownsBackground(def, owned)) {
      throw Errors.badRequest('BACKGROUND_LOCKED', 'Ce décor n’est pas encore débloqué');
    }
    const isDefault = def.scene?.unlock.some((u) => u.kind === 'default') === true;
    const profile = await this.prisma.playerProfile.update({
      where: { id: childId },
      data: { roomBackground: isDefault ? null : def.key },
    });
    return this.roomView(profile, owned);
  }

  /** Enregistre la disposition proposée, après vérification de la possession. */
  async setLayout(childId: string, placements: RoomPlacementInput[]): Promise<RoomView> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou sur le profil : deux enregistrements simultanés ne se mélangent pas.
      await tx.$queryRaw`SELECT id FROM "ChildProfile" WHERE id = ${childId} FOR UPDATE`;
      const profile = await tx.playerProfile.findUniqueOrThrow({ where: { id: childId } });
      const owned = await this.ownedCounts(childId, tx);
      const checked = validateRoomLayout(placements, owned, this.isPlaceable);
      if (!checked.ok) {
        throw Errors.badRequest(checked.error, LAYOUT_ERRORS[checked.error] ?? 'Invalide', {
          item: checked.item,
        });
      }
      const before = new Set(this.layoutOf(profile, owned).map((p) => p.item));
      const added = [...new Set(checked.layout.map((p) => p.item))].filter((k) => !before.has(k));
      const updated = await tx.playerProfile.update({
        where: { id: childId },
        data: { roomLayout: checked.layout as unknown as Prisma.InputJsonValue },
      });
      if (added.length > 0) {
        await this.events.record(
          {
            familyId: profile.familyId,
            childId,
            type: 'ROOM_DECORATED',
            payload: {
              items: added.map((key) => {
                const def = this.catalog.index.item(key);
                return { itemId: key, name: t(def.name), emoji: def.emoji };
              }),
            },
          },
          tx,
        );
      }
      return this.roomView(updated, owned);
    });
  }

  /** Étiquettes des objets placés (réactions des créatures en visite). */
  tagsOf(layout: readonly RoomPlacement[]): Map<string, RoomPlacement[]> {
    const byTag = new Map<string, RoomPlacement[]>();
    for (const p of layout) {
      for (const tag of this.catalog.index.items.get(p.item)?.decor?.tags ?? []) {
        byTag.set(tag, [...(byTag.get(tag) ?? []), p]);
      }
    }
    return byTag;
  }
}

/** Décor de secours (identique à « Chambre Mimo ») si le contenu n'est pas synchronisé. */
const FALLBACK_BACKGROUND: ItemDefinition = {
  key: 'bg_room',
  name: { fr: 'Chambre Mimo' },
  description: { fr: 'Le petit nid douillet de ton compagnon.' },
  category: 'BACKGROUND',
  rarity: 'COMMON',
  emoji: '🏠',
  unique: true,
  scene: {
    sky: ['#fff4e6', '#ffffff'],
    ground: '#f3e2c7',
    particles: [],
    unlock: [{ kind: 'default' }],
  },
};

/** Indices d'obtention d'un décor ou d'un papier à lettres. */
export function unlockViews(def: ItemDefinition, index: CatalogIndex): SceneUnlockView[] {
  return (def.scene?.unlock ?? []).map((u): SceneUnlockView => {
    if (u.kind !== 'exploration') return u;
    const zone = index.zones.get(u.zone);
    return { ...u, zoneName: zone ? t(zone.name) : u.zone };
  });
}

/** Décor ou papier disponible : objet par défaut, ou possédé dans l'inventaire. */
export function ownsUnlockable(def: ItemDefinition, owned: ReadonlyMap<string, number>): boolean {
  return (
    def.scene?.unlock.some((u) => u.kind === 'default') === true || (owned.get(def.key) ?? 0) > 0
  );
}

export function sceneView(scene: SceneDefinition | undefined): SceneView {
  return {
    sky: scene?.sky ?? ['#fff4e6', '#ffffff'],
    ground: scene?.ground ?? '#f3e2c7',
    particles: scene?.particles ?? [],
  };
}
