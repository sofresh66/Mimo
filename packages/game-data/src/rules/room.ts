/**
 * Disposition de l'espace de la créature : objets placés, en pourcentage de la scène.
 * Placer un objet ne le consomme pas ; le nombre d'exemplaires placés ne peut jamais dépasser
 * le nombre possédé (aucune duplication possible).
 */
export const ROOM_MAX_ITEMS = 12;
/** Bornes des coordonnées : un objet reste toujours visible et attrapable. */
export const ROOM_MIN_COORD = 6;
export const ROOM_MAX_COORD = 94;

export type RoomLayer = 'back' | 'front';

export interface RoomPlacement {
  /** Identifiant stable de l'emplacement (plusieurs exemplaires d'un même objet). */
  id: string;
  item: string;
  x: number;
  y: number;
  layer: RoomLayer;
  flip: boolean;
}

const clamp = (value: number) =>
  Math.round(Math.max(ROOM_MIN_COORD, Math.min(ROOM_MAX_COORD, value)) * 10) / 10;

/** Normalise une entrée (coordonnées bornées, valeurs par défaut sûres). */
export function normalizePlacement(p: RoomPlacement): RoomPlacement {
  return {
    id: p.id,
    item: p.item,
    x: clamp(Number.isFinite(p.x) ? p.x : 50),
    y: clamp(Number.isFinite(p.y) ? p.y : 70),
    layer: p.layer === 'front' ? 'front' : 'back',
    flip: p.flip === true,
  };
}

export type RoomLayoutError = 'TOO_MANY_ITEMS' | 'NOT_PLACEABLE' | 'NOT_OWNED' | 'DUPLICATE_ID';

/**
 * Vérifie une disposition proposée par le client : objets plaçables, possédés en nombre
 * suffisant, identifiants uniques. Retourne la disposition normalisée ou l'erreur.
 */
export function validateRoomLayout(
  layout: readonly RoomPlacement[],
  owned: ReadonlyMap<string, number>,
  isPlaceable: (item: string) => boolean,
): { ok: true; layout: RoomPlacement[] } | { ok: false; error: RoomLayoutError; item?: string } {
  if (layout.length > ROOM_MAX_ITEMS) return { ok: false, error: 'TOO_MANY_ITEMS' };
  const ids = new Set<string>();
  const used = new Map<string, number>();
  for (const p of layout) {
    if (ids.has(p.id)) return { ok: false, error: 'DUPLICATE_ID', item: p.item };
    ids.add(p.id);
    if (!isPlaceable(p.item)) return { ok: false, error: 'NOT_PLACEABLE', item: p.item };
    const count = (used.get(p.item) ?? 0) + 1;
    if (count > (owned.get(p.item) ?? 0)) return { ok: false, error: 'NOT_OWNED', item: p.item };
    used.set(p.item, count);
  }
  return { ok: true, layout: layout.map(normalizePlacement) };
}

/**
 * Disposition à afficher : on ignore ce qui n'est plus possédé ou plus plaçable (objet mangé,
 * contenu retiré…) au lieu d'échouer. Utilisée à la lecture, jamais pour accorder un objet.
 */
export function filterRoomLayout(
  layout: readonly RoomPlacement[],
  owned: ReadonlyMap<string, number>,
  isPlaceable: (item: string) => boolean,
): RoomPlacement[] {
  const used = new Map<string, number>();
  const ids = new Set<string>();
  const result: RoomPlacement[] = [];
  for (const p of layout) {
    if (result.length >= ROOM_MAX_ITEMS || ids.has(p.id) || !isPlaceable(p.item)) continue;
    const count = (used.get(p.item) ?? 0) + 1;
    if (count > (owned.get(p.item) ?? 0)) continue;
    used.set(p.item, count);
    ids.add(p.id);
    result.push(normalizePlacement(p));
  }
  return result;
}

/** Emplacements de l'ancienne chambre (3 décorations à positions fixes). */
const LEGACY_SPOTS = [
  { x: 12, y: 20 },
  { x: 88, y: 20 },
  { x: 72, y: 62 },
];

/** Disposition équivalente à l'ancien champ `roomDecorations` (sauvegardes existantes). */
export function legacyRoomLayout(decorations: readonly string[]): RoomPlacement[] {
  return decorations.slice(0, LEGACY_SPOTS.length).map((item, i) => ({
    id: `legacy-${i}`,
    item,
    x: LEGACY_SPOTS[i]?.x ?? 50,
    y: LEGACY_SPOTS[i]?.y ?? 70,
    layer: 'back',
    flip: false,
  }));
}

/** Lecture tolérante d'un JSON stocké (ancien format, champ absent ou corrompu). */
export function parseRoomLayout(raw: unknown): RoomPlacement[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter(
      (p): p is RoomPlacement =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as RoomPlacement).id === 'string' &&
        typeof (p as RoomPlacement).item === 'string',
    )
    .map((p) => normalizePlacement(p));
}
