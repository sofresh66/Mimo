import type { NestExpressApplication } from '@nestjs/platform-express';
import { totalXpForLevel } from '@mimo/game-data';
import type { SocialEventView } from '@mimo/types';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { SocialService } from '../../src/social/social.service';
import { createApp, Device, prisma } from '../helpers';

const PASSWORD = 'motdepasse-solide';
const HOUR = 3_600_000;
let seq = 0;

type Placement = { id: string; item: string; x: number; y: number; layer: string; flip: boolean };
const spot = (id: string, item: string, x = 50, y = 60): Placement => ({
  id,
  item,
  x,
  y,
  layer: 'back',
  flip: false,
});

describe('Espace de la créature et relations entre créatures', () => {
  let app: NestExpressApplication;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await prisma.$disconnect();
  });

  /** Famille : un parent, deux enfants (Léa et Noé) chacun sur son appareil, avec un compagnon. */
  async function family(opts: { adopt?: boolean } = {}) {
    seq += 1;
    const email = `social${seq}-${Date.now()}@test.local`;
    const parent = new Device(app);
    await parent.post('/api/auth/register', { email, password: PASSWORD, displayName: 'Papa' });
    const fam = await parent.post('/api/family', { name: `Famille ${seq}`, parentPin: '2468' });
    const lea = await parent.post('/api/children', {
      displayName: 'Léa',
      avatar: '🦊',
      color: '#ff8a5c',
      pin: '1111',
    });
    const noe = await parent.post('/api/children', {
      displayName: 'Noé',
      avatar: '🐼',
      color: '#3fb6e8',
      pin: '2222',
    });
    const device = async (childId: string, pin: string) => {
      const d = new Device(app);
      await d.post('/api/auth/login', { email, password: PASSWORD });
      expect((await d.post('/api/auth/unlock/child', { childId, pin })).status).toBe(200);
      return d;
    };
    const a = await device(lea.body.id, '1111');
    const b = await device(noe.body.id, '2222');
    if (opts.adopt !== false) {
      await a.post('/api/me/creature/adopt', { speciesId: 'dragon', name: 'Braise' });
      await b.post('/api/me/creature/adopt', { speciesId: 'fox', name: 'Roux' });
    }
    return {
      parent,
      familyId: fam.body.id as string,
      a,
      b,
      aId: lea.body.id as string,
      bId: noe.body.id as string,
    };
  }

  const creatureOf = (childId: string) =>
    prisma.creature.findFirstOrThrow({ where: { childId, isActive: true } });
  const socialEvents = (childId: string) =>
    prisma.gameEvent.findMany({
      where: { childId, type: { in: ['SOCIAL_INTERACTION', 'FRIENDSHIP_UP'] } },
      orderBy: { createdAt: 'asc' },
    });

  // ─── Espace : compatibilité, décors, disposition ───────────────────────────

  it('ancienne sauvegarde : chambre à 3 objets lue à l’identique, décor par défaut', async () => {
    const f = await family();
    // Profil « ancien » : décoration via l'ancien champ, aucune des nouvelles colonnes renseignée.
    await f.a.post('/api/me/shop/buy', { itemId: 'lantern' });
    await prisma.playerProfile.update({
      where: { id: f.aId },
      data: { roomDecorations: ['lantern'], roomLayout: undefined, roomBackground: null },
    });
    const home = await f.a.get('/api/me/home');
    expect(home.status).toBe(200);
    expect(home.body.room.background.id).toBe('bg_room');
    expect(home.body.room.layout).toEqual([
      expect.objectContaining({
        id: 'legacy-0',
        x: 12,
        y: 20,
        item: expect.objectContaining({ id: 'lantern' }),
      }),
    ]);
    // L'ancienne route reste utilisable par un client déjà installé.
    expect((await f.a.put('/api/me/room', { decorations: ['lantern'] })).status).toBe(200);
  });

  it('décor non débloqué refusé ; débloqué par une quête, sélectionné et persistant', async () => {
    const f = await family();
    expect((await f.a.put('/api/me/room/background', { itemId: 'bg_forest' })).body.code).toBe(
      'BACKGROUND_LOCKED',
    );
    expect((await f.a.put('/api/me/room/background', { itemId: 'apple' })).body.code).toBe(
      'NOT_BACKGROUND',
    );
    const editor = await f.a.get('/api/me/room');
    const forest = editor.body.backgrounds.find(
      (b: { item: { id: string } }) => b.item.id === 'bg_forest',
    );
    expect(forest).toMatchObject({ owned: false, current: false });
    expect(forest.unlock).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'exploration', zoneName: expect.any(String) }),
      ]),
    );

    // Quête parent : « Le secret de la forêt » → décor + décoration (deux missions, une récompense chacune).
    const quest = await f.parent.post('/api/missions', {
      title: 'Le secret de la forêt',
      category: 'ADVENTURE',
      icon: '🌲',
      xp: 20,
      coins: 5,
      recurrence: 'ONCE',
      assignedChildId: f.aId,
      rewardItemId: 'bg_forest',
    });
    expect(quest.status).toBe(201);
    const plantQuest = await f.parent.post('/api/missions', {
      title: 'La plante lumineuse',
      category: 'ADVENTURE',
      icon: '🪴',
      xp: 10,
      coins: 0,
      recurrence: 'ONCE',
      assignedChildId: f.aId,
      rewardItemId: 'glow_plant',
    });
    await f.parent.post(`/api/missions/${quest.body.id}/validate`, { childId: f.aId });
    await f.parent.post(`/api/missions/${plantQuest.body.id}/validate`, { childId: f.aId });
    const gifts = (await f.a.get('/api/me/rewards')).body as Array<{
      id: string;
      item: { id: string };
    }>;
    for (const gift of gifts)
      expect((await f.a.post(`/api/me/rewards/${gift.id}/open`)).status).toBe(200);

    const after = await f.a.get('/api/me/room');
    expect(
      after.body.backgrounds.find((b: { item: { id: string } }) => b.item.id === 'bg_forest').owned,
    ).toBe(true);
    expect(after.body.placeables.map((p: { item: { id: string } }) => p.item.id)).toContain(
      'glow_plant',
    );
    expect(
      (await f.a.put('/api/me/room/background', { itemId: 'bg_forest' })).body.background.id,
    ).toBe('bg_forest');
    const unlocked = await prisma.gameEvent.count({
      where: { childId: f.aId, type: 'BACKGROUND_UNLOCKED' },
    });
    expect(unlocked).toBe(1);

    // Persistance après reconnexion (nouvel appareil, même profil).
    const again = new Device(app);
    await again.post('/api/auth/login', {
      email: (await prisma.user.findFirstOrThrow({ where: { familyId: f.familyId } })).email,
      password: PASSWORD,
    });
    await again.post('/api/auth/unlock/child', { childId: f.aId, pin: '1111' });
    expect((await again.get('/api/me/home')).body.room.background.id).toBe('bg_forest');

    // Le décor de Léa n'est pas celui de Noé (isolation).
    expect((await f.b.get('/api/me/home')).body.room.background.id).toBe('bg_room');
    expect((await f.b.put('/api/me/room/background', { itemId: 'bg_forest' })).body.code).toBe(
      'BACKGROUND_LOCKED',
    );
  });

  it('récompense unique jamais en double : le doublon devient des pièces', async () => {
    const f = await family();
    for (let i = 0; i < 2; i += 1) {
      const m = await f.parent.post('/api/missions', {
        title: `Forêt ${i}`,
        category: 'ADVENTURE',
        icon: '🌲',
        xp: 5,
        coins: 0,
        recurrence: 'ONCE',
        assignedChildId: f.aId,
        rewardItemId: 'bg_forest',
      });
      await f.parent.post(`/api/missions/${m.body.id}/validate`, { childId: f.aId });
    }
    const gifts = (await f.a.get('/api/me/rewards')).body as Array<{ id: string }>;
    const coinsBefore = (await f.a.get('/api/me/home')).body.coins;
    const opened = await Promise.all(gifts.map((g) => f.a.post(`/api/me/rewards/${g.id}/open`)));
    // L'ouverture affiche ce qui a réellement été reçu : le décor une fois, puis des pièces.
    const shown = opened.map(
      (o) => o.body.loot as { coins: number; items: Array<{ item: { id: string } }> },
    );
    expect(shown.filter((l) => l.items.some((i) => i.item.id === 'bg_forest'))).toHaveLength(1);
    expect(shown.filter((l) => l.items.length === 0 && l.coins === 25)).toHaveLength(1);
    const entry = await prisma.inventoryItem.findFirstOrThrow({
      where: { inventory: { childId: f.aId }, itemId: 'bg_forest' },
    });
    expect(entry.quantity).toBe(1);
    expect((await f.a.get('/api/me/home')).body.coins).toBe(coinsBefore + 25);
  });

  it('les parents ne peuvent offrir que les décors prévus comme récompense de quête', async () => {
    const f = await family();
    const base = { category: 'ADVENTURE', icon: '🎁', xp: 5, coins: 0, recurrence: 'ONCE' };
    for (const itemId of ['bg_night', 'bg_clouds', 'friendship_photo']) {
      const res = await f.parent.post('/api/missions', {
        ...base,
        title: itemId,
        rewardItemId: itemId,
      });
      expect([itemId, res.body.code]).toEqual([itemId, 'INVALID_ITEM']);
    }
    const giftable = (await f.parent.get('/api/rewards/giftable-items')).body as Array<{
      id: string;
    }>;
    const ids = giftable.map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['bg_forest', 'bg_garden', 'glow_plant']));
    expect(ids).not.toContain('bg_night');
  });

  it('décor débloqué par la progression (niveau 5), une seule fois', async () => {
    const f = await family();
    await prisma.creature.updateMany({
      where: { childId: f.aId },
      data: {
        formId: 'dragon_baby',
        totalXp: totalXpForLevel(5) - 5,
        level: 4,
        hatchedAt: new Date(),
      },
    });
    const m = await f.parent.post('/api/missions', {
      title: 'Grand pas',
      category: 'LOGIC',
      icon: '⭐',
      xp: 10,
      coins: 0,
      recurrence: 'DAILY',
      assignedChildId: f.aId,
    });
    await f.parent.post(`/api/missions/${m.body.id}/validate`, { childId: f.aId });
    const rewards = await prisma.reward.findMany({ where: { childId: f.aId, itemId: 'bg_night' } });
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.source).toBe('LEVEL_UP');
    // Une autre créature qui repasse le niveau 5 ne redonne pas le décor.
    await prisma.creature.updateMany({
      where: { childId: f.aId },
      data: { totalXp: totalXpForLevel(5) - 5, level: 4 },
    });
    const m2 = await f.parent.post('/api/missions', {
      title: 'Encore',
      category: 'LOGIC',
      icon: '⭐',
      xp: 10,
      coins: 0,
      recurrence: 'ONCE',
      assignedChildId: f.aId,
    });
    await f.parent.post(`/api/missions/${m2.body.id}/validate`, { childId: f.aId });
    expect(await prisma.reward.count({ where: { childId: f.aId, itemId: 'bg_night' } })).toBe(1);
  });

  it('placer, déplacer, retourner, retirer ; jamais un objet non possédé ou en trop', async () => {
    const f = await family();
    await f.a.post('/api/me/shop/buy', { itemId: 'lantern' });
    // Le ballon fait partie de l'inventaire de départ.
    const placed = await f.a.put('/api/me/room/layout', {
      placements: [spot('l1', 'lantern', -40, 300), spot('b1', 'ball', 30, 80)],
    });
    expect(placed.status).toBe(200);
    expect(placed.body.layout[0]).toMatchObject({ id: 'l1', x: 6, y: 94 });

    const moved = await f.a.put('/api/me/room/layout', {
      placements: [
        { ...spot('l1', 'lantern', 70, 40), flip: true, layer: 'front' },
        spot('b1', 'ball', 30, 80),
      ],
    });
    expect(moved.body.layout[0]).toMatchObject({ x: 70, y: 40, flip: true, layer: 'front' });
    expect((await f.a.get('/api/me/home')).body.room.layout).toHaveLength(2);

    // Retirer : l'objet quitte la scène mais reste dans l'inventaire.
    await f.a.put('/api/me/room/layout', { placements: [spot('b1', 'ball')] });
    const inv = (await f.a.get('/api/me/inventory')).body as {
      entries: Array<{ item: { id: string }; quantity: number }>;
    };
    expect(inv.entries.find((e) => e.item.id === 'lantern')?.quantity).toBe(1);

    const bad = async (placements: Placement[]) =>
      (await f.a.put('/api/me/room/layout', { placements })).body.code;
    expect(await bad([spot('s', 'star_lamp')])).toBe('NOT_OWNED');
    expect(await bad([spot('l1', 'lantern'), spot('l2', 'lantern')])).toBe('NOT_OWNED');
    expect(await bad([spot('a', 'apple')])).toBe('NOT_PLACEABLE');
    expect(await bad([spot('x', 'ball'), spot('x', 'ball')])).toBe('DUPLICATE_ID');
    const tooMany = Array.from({ length: 13 }, (_, i) => spot(`b${i}`, 'ball'));
    expect((await f.a.put('/api/me/room/layout', { placements: tooMany })).status).toBe(400);

    // Noé ne peut pas placer les objets de Léa.
    expect(
      (await f.b.put('/api/me/room/layout', { placements: [spot('l', 'lantern')] })).body.code,
    ).toBe('NOT_OWNED');

    // Un objet mangé/donné plus tard disparaît simplement de la scène.
    await prisma.inventoryItem.deleteMany({
      where: { inventory: { childId: f.aId }, itemId: 'ball' },
    });
    expect((await f.a.get('/api/me/home')).body.room.layout).toEqual([]);
  });

  // ─── Relations ─────────────────────────────────────────────────────────────

  it('hors connexion : interactions générées au retour, une seule fois, pour les deux joueurs', async () => {
    const f = await family();
    await prisma.playerProfile.update({
      where: { id: f.aId },
      data: {
        socialTickAt: new Date(Date.now() - 13 * HOUR),
        socialSeenAt: new Date(Date.now() - 20 * HOUR),
      },
    });
    // Trois ouvertures simultanées : une seule génère (transition gardée).
    const homes = await Promise.all([
      f.a.get('/api/me/home'),
      f.a.get('/api/me/home'),
      f.a.get('/api/me/home'),
    ]);
    expect(homes.every((h) => h.status === 200)).toBe(true);
    const mine = (await socialEvents(f.aId)).filter((e) => e.type === 'SOCIAL_INTERACTION');
    expect(mine).toHaveLength(3);
    // Événements répartis pendant l'absence.
    expect(mine[0]!.createdAt.getTime()).toBeLessThan(Date.now() - 4 * HOUR);
    // Le journal de Noé contient le point de vue de sa créature.
    const theirs = (await socialEvents(f.bId)).filter((e) => e.type === 'SOCIAL_INTERACTION');
    expect(theirs).toHaveLength(3);
    expect((theirs[0]!.payload as { outgoing: boolean }).outgoing).toBe(true);
    // Relation persistante côté serveur.
    const [ca, cb] = [await creatureOf(f.aId), await creatureOf(f.bId)];
    const [x, y] = ca.id < cb.id ? [ca.id, cb.id] : [cb.id, ca.id];
    const relation = await prisma.creatureRelation.findUniqueOrThrow({
      where: { creatureAId_creatureBId: { creatureAId: x, creatureBId: y } },
    });
    expect(relation.interactions).toBe(3);
    expect(relation.points).toBeGreaterThan(0);

    // « Pendant ton absence… » puis marqué comme vu.
    const home = await f.a.get('/api/me/home');
    expect((home.body.socialUnseen as SocialEventView[]).length).toBeGreaterThanOrEqual(3);
    expect(home.body.socialUnseen[0].friend).toMatchObject({
      creatureName: 'Roux',
      ownerName: 'Noé',
    });
    await f.a.post('/api/me/friends/seen');
    expect((await f.a.get('/api/me/home')).body.socialUnseen).toEqual([]);
    // Pas de nouvelle interaction tant que 4 h ne sont pas passées.
    expect((await socialEvents(f.aId)).filter((e) => e.type === 'SOCIAL_INTERACTION')).toHaveLength(
      3,
    );
  });

  it('revenu entre deux générations : les nouvelles interactions restent « non vues »', async () => {
    const f = await family();
    await prisma.playerProfile.update({
      where: { id: f.aId },
      data: {
        socialTickAt: new Date(Date.now() - 9 * HOUR),
        socialSeenAt: new Date(Date.now() - HOUR),
      },
    });
    const home = await f.a.get('/api/me/home');
    expect(home.body.socialUnseen).toHaveLength(2);
  });

  it('ancienne sauvegarde sans horloge sociale : une première interaction, sans avalanche', async () => {
    const f = await family();
    await prisma.playerProfile.updateMany({
      where: { id: { in: [f.aId, f.bId] } },
      data: { socialTickAt: null, socialSeenAt: null },
    });
    await f.a.get('/api/me/home');
    expect((await socialEvents(f.aId)).filter((e) => e.type === 'SOCIAL_INTERACTION')).toHaveLength(
      1,
    );
    expect(
      (await prisma.playerProfile.findUniqueOrThrow({ where: { id: f.aId } })).socialTickAt,
    ).not.toBeNull();
  });

  it('les créatures réagissent aux objets placés pendant une visite', async () => {
    const f = await family();
    await prisma.inventory.update({ where: { childId: f.aId }, data: { coins: 500 } });
    await f.a.post('/api/me/shop/buy', { itemId: 'lantern' });
    await f.a.post('/api/me/shop/buy', { itemId: 'potted_plant' });
    const layout = await f.a.put('/api/me/room/layout', {
      placements: [
        spot('ball', 'ball', 25, 75),
        spot('lamp', 'lantern', 75, 30),
        spot('plant', 'potted_plant', 85, 70),
      ],
    });
    expect(layout.status).toBe(200);
    let reaction: { payload: unknown } | undefined;
    for (let i = 0; i < 12 && !reaction; i += 1) {
      await prisma.playerProfile.update({
        where: { id: f.aId },
        data: { socialTickAt: new Date(Date.now() - (13 + i) * HOUR) },
      });
      await f.a.get('/api/me/home');
      reaction = (await socialEvents(f.aId)).find(
        (e) => (e.payload as { kind: string }).kind === 'DECOR_REACTION',
      );
    }
    expect(reaction).toBeDefined();
    const payload = reaction?.payload as { item: { id: string } };
    expect(['ball', 'lantern', 'potted_plant']).toContain(payload.item.id);
  });

  it('« Jouer ensemble » : visite visible, amitié en hausse, limite quotidienne, temps réel', async () => {
    const f = await family();
    const cb = await creatureOf(f.bId);
    // Noé est connecté : il voit l'interaction en direct.
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: f.b.header() },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    await new Promise((r) => setTimeout(r, 200));
    const live = new Promise<SocialEventView>((resolve) => socket.on('social:event', resolve));

    const first = await f.a.post(`/api/me/friends/${cb.id}/play`);
    expect(first.status).toBe(200);
    expect(first.body.event.friend).toMatchObject({ creatureName: 'Roux', ownerName: 'Noé' });
    expect(first.body.friend.points).toBeGreaterThan(0);
    expect(first.body.friend.playsLeft).toBe(2);
    expect((await live).outgoing).toBe(true);

    const home = await f.a.get('/api/me/home');
    expect(home.body.visit).toMatchObject({
      visitor: { id: cb.id, name: 'Roux' },
      owner: { displayName: 'Noé' },
    });
    // Vécue en direct par Léa : pas dans « Pendant ton absence… » (mais bien dans son journal).
    const eventId = first.body.event.id as string;
    expect(home.body.socialUnseen.map((e: { id: string }) => e.id)).not.toContain(eventId);
    expect(
      (await f.a.get('/api/me/friends/journal')).body.map((e: { id: string }) => e.id),
    ).toContain(eventId);

    await f.a.post(`/api/me/friends/${cb.id}/play`);
    await f.a.post(`/api/me/friends/${cb.id}/play`);
    const limited = await f.a.post(`/api/me/friends/${cb.id}/play`);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('SOCIAL_DAILY_LIMIT');

    const friends = (await f.b.get('/api/me/friends')).body;
    expect(friends).toEqual([
      expect.objectContaining({ owner: expect.objectContaining({ displayName: 'Léa' }) }),
    ]);
    expect(friends[0].playsLeft).toBe(0); // limite partagée par le couple
  });

  it('chamaillerie : toujours suivie d’une réconciliation, jamais de niveau perdu', async () => {
    const f = await family();
    const [ca, cb] = [await creatureOf(f.aId), await creatureOf(f.bId)];
    const [x, y] = ca.id < cb.id ? [ca.id, cb.id] : [cb.id, ca.id];
    await prisma.creatureRelation.create({
      data: {
        familyId: f.familyId,
        creatureAId: x,
        creatureBId: y,
        points: 61,
        bestLevel: 3,
        needsReconcile: true,
        lastSquabbleAt: new Date(),
      },
    });
    const res = await f.a.post(`/api/me/friends/${cb.id}/play`);
    expect(res.body.event.kind).toBe('RECONCILE');
    const relation = await prisma.creatureRelation.findFirstOrThrow({ where: { creatureAId: x } });
    expect(relation.needsReconcile).toBe(false);
    expect(relation.points).toBe(67);
    // Plancher en base : les points ne descendent jamais sous le seuil du niveau atteint.
    await expect(
      prisma.creatureRelation.update({ where: { id: relation.id }, data: { points: 151 } }),
    ).rejects.toThrow(/CreatureRelation_bounds_check/);
  });

  it('niveau d’amitié atteint : récompense pour les deux joueurs, une seule fois', async () => {
    const f = await family();
    const [ca, cb] = [await creatureOf(f.aId), await creatureOf(f.bId)];
    const [x, y] = ca.id < cb.id ? [ca.id, cb.id] : [cb.id, ca.id];
    await prisma.creatureRelation.create({
      data: { familyId: f.familyId, creatureAId: x, creatureBId: y, points: 58, bestLevel: 2 },
    });
    const res = await f.a.post(`/api/me/friends/${cb.id}/play`);
    expect(res.body.friend.levelKey).toBe('FRIENDS');
    for (const childId of [f.aId, f.bId]) {
      const rewards = await prisma.reward.findMany({ where: { childId, itemId: 'bg_garden' } });
      expect(rewards).toEqual([
        expect.objectContaining({ source: 'FRIENDSHIP', status: 'PENDING' }),
      ]);
      expect(await prisma.gameEvent.count({ where: { childId, type: 'FRIENDSHIP_UP' } })).toBe(1);
    }
    await f.a.post(`/api/me/friends/${cb.id}/play`);
    expect(await prisma.reward.count({ where: { childId: f.aId, itemId: 'bg_garden' } })).toBe(1);
  });

  it('isolation : ni créature d’une autre famille, ni la sienne, ni visite étrangère', async () => {
    const f = await family();
    const g = await family();
    const [ca, cg] = [await creatureOf(f.aId), await creatureOf(g.aId)];
    expect((await f.a.post(`/api/me/friends/${cg.id}/play`)).status).toBe(404);
    expect((await f.a.post(`/api/me/friends/${ca.id}/play`)).status).toBe(404);
    expect((await f.a.post('/api/me/friends/inconnu/play')).status).toBe(404);
    const friends = (await f.a.get('/api/me/friends')).body as Array<{ creature: { id: string } }>;
    expect(friends.map((x) => x.creature.id)).not.toContain(cg.id);
    // Une visite incohérente insérée en base (créature d'une autre famille) n'est jamais montrée.
    await prisma.creatureVisit.deleteMany({ where: { hostProfileId: f.aId } });
    // Horloge sociale à jour : aucune interaction légitime générée à cette ouverture.
    await prisma.playerProfile.update({ where: { id: f.aId }, data: { socialTickAt: new Date() } });
    await prisma.creatureVisit.create({
      data: {
        familyId: f.familyId,
        hostProfileId: f.aId,
        visitorCreatureId: cg.id,
        eventKey: 'visit_hello',
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + HOUR),
      },
    });
    expect((await f.a.get('/api/me/home')).body.visit).toBeNull();
    // L'espace parent n'a pas accès aux routes de jeu.
    expect((await f.parent.get('/api/me/friends')).status).toBe(403);
    expect((await f.parent.put('/api/me/room/layout', { placements: [] })).status).toBe(403);
  });

  it('sans compagnon : aucune interaction, et rien à rattraper ensuite', async () => {
    const f = await family({ adopt: false });
    expect((await f.a.get('/api/me/friends')).body).toEqual([]);
    await f.a.get('/api/me/home');
    expect(await socialEvents(f.aId)).toEqual([]);
  });

  it('nettoyage : journal social limité à 50 entrées, visites anciennes supprimées', async () => {
    const f = await family();
    await prisma.gameEvent.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        familyId: f.familyId,
        childId: f.aId,
        type: 'SOCIAL_INTERACTION' as const,
        payload: { kind: 'VISIT', eventKey: 'visit_hello' },
        createdAt: new Date(Date.now() - i * 60_000),
      })),
    });
    const cb = await creatureOf(f.bId);
    await prisma.creatureVisit.create({
      data: {
        familyId: f.familyId,
        hostProfileId: f.aId,
        visitorCreatureId: cb.id,
        eventKey: 'visit_hello',
        startsAt: new Date(Date.now() - 10 * 24 * HOUR),
        endsAt: new Date(Date.now() - 9 * 24 * HOUR),
      },
    });
    await app.get(SocialService).prune();
    expect(
      await prisma.gameEvent.count({ where: { childId: f.aId, type: 'SOCIAL_INTERACTION' } }),
    ).toBe(50);
    expect(await prisma.creatureVisit.count({ where: { hostProfileId: f.aId } })).toBe(0);
  });
});
