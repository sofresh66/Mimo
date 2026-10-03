import { describe, expect, it } from 'vitest';
import {
  CatalogIndex,
  FRIENDSHIP_LEVELS,
  ROOM_MAX_COORD,
  ROOM_MAX_ITEMS,
  ROOM_MIN_COORD,
  applyFriendshipDelta,
  createRng,
  defaultCatalog,
  eligibleSocialEvents,
  filterRoomLayout,
  friendshipLevel,
  legacyRoomLayout,
  parseRoomLayout,
  pickSocialEvent,
  pointsToNextLevel,
  socialTickTimes,
  socialTicksDue,
  validateCatalog,
  validateRoomLayout,
  type RoomPlacement,
  type SocialContext,
} from '../src';

const index = new CatalogIndex(defaultCatalog);
const events = defaultCatalog.social.events;
const HOUR = 3_600_000;

describe('catalogue : décors, décorations et interactions', () => {
  it('reste cohérent', () => {
    expect(validateCatalog(defaultCatalog)).toEqual([]);
  });

  it('propose 8 décors uniques, non vendus, dont un seul par défaut', () => {
    const backgrounds = index.backgrounds();
    expect(backgrounds).toHaveLength(8);
    expect(backgrounds.every((b) => b.unique && b.price === undefined && b.scene)).toBe(true);
    expect(index.defaultBackground().key).toBe('bg_room');
  });

  it('les décors (hors défaut) ne s’obtiennent que par le jeu', () => {
    for (const bg of index.backgrounds()) {
      if (bg.key === 'bg_room') continue;
      expect(bg.scene?.unlock.some((u) => u.kind === 'default')).toBe(false);
    }
  });

  it('refuse un catalogue incohérent (décor vendu, chamaillerie positive)', () => {
    const broken = structuredClone(defaultCatalog);
    const forest = broken.items.find((i) => i.key === 'bg_forest');
    if (forest) forest.price = 10;
    const squabble = broken.social.events.find((e) => e.kind === 'SQUABBLE');
    if (squabble) squabble.delta = 2;
    const errors = validateCatalog(broken);
    expect(errors).toContain('item bg_forest: un décor ne se vend pas');
    expect(errors.some((e) => e.includes('chamaillerie'))).toBe(true);
  });
});

describe('amitié', () => {
  it('niveaux : Inconnus → Meilleurs amis', () => {
    expect(friendshipLevel(0)).toBe(0);
    expect(friendshipLevel(10)).toBe(1);
    expect(friendshipLevel(59)).toBe(2);
    expect(friendshipLevel(60)).toBe(3);
    expect(friendshipLevel(150)).toBe(4);
    expect(FRIENDSHIP_LEVELS[4].key).toBe('BEST_FRIENDS');
    expect(pointsToNextLevel(25)).toBe(5);
    expect(pointsToNextLevel(120)).toBeNull();
  });

  it('une hausse peut franchir plusieurs niveaux (récompenses de chacun)', () => {
    const change = applyFriendshipDelta({ points: 8, bestLevel: 0 }, 25);
    expect(change).toMatchObject({ points: 33, level: 2, bestLevel: 2, reachedLevels: [1, 2] });
  });

  it('une chamaillerie retire des points sans jamais faire redescendre de niveau', () => {
    const change = applyFriendshipDelta({ points: 62, bestLevel: 3 }, -4);
    expect(change).toMatchObject({ points: 60, level: 3, bestLevel: 3, reachedLevels: [] });
    const again = applyFriendshipDelta({ points: 60, bestLevel: 3 }, -4);
    expect(again.points).toBe(60);
  });

  it('plafonne les points', () => {
    expect(applyFriendshipDelta({ points: 148, bestLevel: 4 }, 10).points).toBe(150);
  });
});

describe('génération des interactions', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('ancienne sauvegarde : une première interaction, sans rattrapage massif', () => {
    expect(socialTicksDue(null, now)).toBe(1);
  });

  it('une interaction toutes les 4 h, 3 au plus au retour', () => {
    expect(socialTicksDue(new Date(now.getTime() - 3 * HOUR), now)).toBe(0);
    expect(socialTicksDue(new Date(now.getTime() - 9 * HOUR), now)).toBe(2);
    expect(socialTicksDue(new Date(now.getTime() - 72 * HOUR), now)).toBe(3);
    expect(socialTicksDue(new Date(now.getTime() + HOUR), now)).toBe(0);
  });

  it('répartit les horodatages sur la période d’absence', () => {
    const times = socialTickTimes(new Date(now.getTime() - 12 * HOUR), now, 3);
    expect(times.map((t) => (now.getTime() - t.getTime()) / HOUR)).toEqual([8, 4, 0]);
  });

  const base: SocialContext = {
    level: 0,
    hostTags: new Set(),
    needsReconcile: false,
    canSquabble: true,
  };

  it('respecte le niveau requis et les objets placés', () => {
    const keys = eligibleSocialEvents(events, base).map((e) => e.key);
    expect(keys).toContain('visit_hello');
    expect(keys).not.toContain('gift_small'); // niveau 2
    expect(keys).not.toContain('play_ball'); // nécessite un jouet placé
    expect(keys).not.toContain('squabble_toy'); // niveau 1
    const withToy = eligibleSocialEvents(events, { ...base, level: 4, hostTags: new Set(['toy']) });
    expect(withToy.map((e) => e.key)).toEqual(
      expect.arrayContaining(['play_ball', 'gift_decor', 'duo_exploration', 'stargazing']),
    );
  });

  it('après une chamaillerie, toujours une réconciliation qui rend plus', () => {
    const next = pickSocialEvent(events, { ...base, level: 2, needsReconcile: true }, createRng(1));
    expect(next?.kind).toBe('RECONCILE');
    const squabble = events.find((e) => e.kind === 'SQUABBLE');
    expect((next?.delta ?? 0) + (squabble?.delta ?? 0)).toBeGreaterThan(0);
  });

  it('pas de chamaillerie pendant le délai, ni à l’initiative du joueur', () => {
    const noSquabble = eligibleSocialEvents(events, { ...base, level: 4, canSquabble: false });
    expect(noSquabble.some((e) => e.kind === 'SQUABBLE')).toBe(false);
    const player = eligibleSocialEvents(events, { ...base, level: 4, playerInitiated: true });
    expect(player.length).toBeGreaterThan(0);
    expect(player.every((e) => e.playerInitiated && e.kind !== 'SQUABBLE')).toBe(true);
  });

  it('tirage déterministe (même graine, même interaction)', () => {
    const ctx = { ...base, level: 3, hostTags: new Set(['light', 'toy']) };
    expect(pickSocialEvent(events, ctx, createRng(42))?.key).toBe(
      pickSocialEvent(events, ctx, createRng(42))?.key,
    );
  });
});

describe('disposition de l’espace', () => {
  const placeable = (key: string) => Boolean(index.items.get(key)?.decor);
  const owned = new Map([
    ['lantern', 1],
    ['ball', 2],
  ]);
  const p = (id: string, item: string, x = 50, y = 50): RoomPlacement => ({
    id,
    item,
    x,
    y,
    layer: 'back',
    flip: false,
  });

  it('accepte les objets possédés et borne les coordonnées dans la zone visible', () => {
    const result = validateRoomLayout(
      [p('a', 'lantern', -40, 400), p('b', 'ball')],
      owned,
      placeable,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.layout[0]).toMatchObject({ x: ROOM_MIN_COORD, y: ROOM_MAX_COORD });
    }
  });

  it('refuse un objet non possédé, non plaçable, ou plus d’exemplaires que possédés', () => {
    expect(validateRoomLayout([p('a', 'star_lamp')], owned, placeable)).toMatchObject({
      ok: false,
      error: 'NOT_OWNED',
    });
    expect(validateRoomLayout([p('a', 'apple')], new Map([['apple', 3]]), placeable)).toMatchObject(
      {
        ok: false,
        error: 'NOT_PLACEABLE',
      },
    );
    expect(
      validateRoomLayout([p('a', 'lantern'), p('b', 'lantern')], owned, placeable),
    ).toMatchObject({ ok: false, error: 'NOT_OWNED' });
    expect(validateRoomLayout([p('a', 'ball'), p('a', 'ball')], owned, placeable)).toMatchObject({
      ok: false,
      error: 'DUPLICATE_ID',
    });
    const many = Array.from({ length: ROOM_MAX_ITEMS + 1 }, (_, i) => p(`i${i}`, 'ball'));
    expect(validateRoomLayout(many, new Map([['ball', 99]]), placeable)).toMatchObject({
      error: 'TOO_MANY_ITEMS',
    });
  });

  it('à la lecture, ignore ce qui n’est plus possédé au lieu d’échouer', () => {
    const shown = filterRoomLayout(
      [p('a', 'lantern'), p('b', 'star_lamp'), p('c', 'lantern')],
      owned,
      placeable,
    );
    expect(shown.map((s) => s.id)).toEqual(['a']);
  });

  it('ancienne chambre : convertie à l’identique, JSON absent ou corrompu toléré', () => {
    expect(legacyRoomLayout(['lantern', 'potted_plant'])).toHaveLength(2);
    expect(parseRoomLayout(null)).toBeNull();
    expect(parseRoomLayout([{ id: 'x' }, 'bad', { id: 'a', item: 'ball', x: 999 }])).toEqual([
      { id: 'a', item: 'ball', x: ROOM_MAX_COORD, y: 70, layer: 'back', flip: false },
    ]);
  });
});
