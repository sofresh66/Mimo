import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ChildMissionView, MissionValidatedPayload, PendingCompletionView } from '@mimo/types';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { ExplorationsService } from '../../src/explorations/explorations.service';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway';
import { createApp, prisma } from '../helpers';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** « Appareil » qui conserve ses cookies (HTTP + ouverture d'un socket authentifié). */
class Device {
  private cookies = new Map<string, string>();
  constructor(private readonly app: NestExpressApplication) {}

  async call(method: Method, url: string, body?: object) {
    const res = await request(this.app.getHttpServer())
      [method](url)
      .set('Cookie', this.header())
      .send(body);
    for (const c of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair] = c.split(';');
      const index = (pair ?? '').indexOf('=');
      const name = (pair ?? '').slice(0, index);
      const value = (pair ?? '').slice(index + 1);
      if (!name) continue;
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return res;
  }
  get = (url: string) => this.call('get', url);
  post = (url: string, body: object = {}) => this.call('post', url, body);
  put = (url: string, body: object = {}) => this.call('put', url, body);
  patch = (url: string, body: object = {}) => this.call('patch', url, body);
  del = (url: string) => this.call('delete', url);

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const PASSWORD = 'motdepasse-solide';
let seq = 0;

describe('Adulte joueur (« Mamie »)', () => {
  let app: NestExpressApplication;
  let url: string;
  const sockets: Socket[] = [];

  // Famille A : Papa (parent), Alice (enfant), Mamie (adulte joueur).
  let papa: Device;
  let alice: Device;
  let mamie: Device;
  let familyId: string;
  let aliceId: string;
  let mamieId: string;
  let mamieEmail: string;
  // Famille B, pour l'isolation.
  let otherParent: Device;
  let otherChildId: string;

  async function newFamily(name: string, parentPin: string) {
    seq += 1;
    const email = `papa${seq}-${Date.now()}@test.local`;
    const parent = new Device(app);
    await parent.post('/api/auth/register', { email, password: PASSWORD, displayName: 'Papa' });
    const family = await parent.post('/api/family', { name, parentPin });
    const child = await parent.post('/api/children', {
      displayName: 'Alice',
      avatar: '🦊',
      color: '#ff8a5c',
      pin: '1234',
    });
    expect(child.status).toBe(201);
    return { parent, email, familyId: family.body.id as string, childId: child.body.id as string };
  }

  async function connect(device: Device): Promise<Socket> {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: device.header() },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    // Laisse le serveur placer le socket dans ses salles.
    await new Promise((r) => setTimeout(r, 200));
    return socket;
  }

  /** Salles Socket.IO réellement rejointes par un socket (vérifiées côté serveur). */
  async function roomsOf(socket: Socket): Promise<string[]> {
    const server = app.get(RealtimeGateway).server;
    const remote = (await server.fetchSockets()).find((s) => s.id === socket.id);
    return remote ? [...remote.rooms] : [];
  }

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    const a = await newFamily('EL TEST', '9876');
    papa = a.parent;
    familyId = a.familyId;
    aliceId = a.childId;
    alice = new Device(app);
    await alice.post('/api/auth/login', { email: a.email, password: PASSWORD });
    expect(
      (await alice.post('/api/auth/unlock/child', { childId: aliceId, pin: '1234' })).status,
    ).toBe(200);

    const b = await newFamily('Autre famille', '1357');
    otherParent = b.parent;
    otherChildId = b.childId;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await prisma.$disconnect();
  });

  // ─── 1 → 5 : invitation, compte, acceptation, famille, profil ──────────────

  it('1-5. le parent invite, Mamie crée son compte, accepte et joue sur SON profil sans se reconnecter', async () => {
    // 1. Invitation « joueur adulte » (réservée à l'espace parent).
    expect((await alice.post('/api/family/invitations', { role: 'ADULT_PLAYER' })).status).toBe(
      403,
    );
    const created = await papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('ADULT_PLAYER');
    const listed = await papa.get('/api/family/invitations');
    expect(listed.body.map((i: { role: string }) => i.role)).toEqual(['ADULT_PLAYER']);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token);

    // Aperçu public : seulement famille, invitant et rôle.
    const preview = await new Device(app).get(`/api/invitations/${created.body.token}`);
    expect(preview.body).toEqual({
      familyName: 'EL TEST',
      invitedBy: 'Papa',
      expiresAt: expect.any(String),
      alreadyMember: false,
      role: 'ADULT_PLAYER',
    });

    // 2. Mamie crée son compte (e-mail + mot de passe), et ouvre aussi un 2e appareil.
    mamieEmail = `mamie-${Date.now()}@test.local`;
    mamie = new Device(app);
    expect(
      (
        await mamie.post('/api/auth/register', {
          email: mamieEmail,
          password: PASSWORD,
          displayName: 'Mamie',
        })
      ).status,
    ).toBe(201);
    const otherDevice = new Device(app);
    await otherDevice.post('/api/auth/login', { email: mamieEmail, password: PASSWORD });

    // 3. Acceptation avec configuration du profil.
    const accepted = await mamie.post(`/api/invitations/${created.body.token}/accept`, {
      displayName: 'Mamie',
      avatar: '🦉',
      color: '#a06cd5',
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ familyId, familyName: 'EL TEST', role: 'ADULT_PLAYER' });
    // Usage unique.
    expect((await new Device(app).get(`/api/invitations/${created.body.token}`)).status).toBe(404);

    // 4 + 5. Bonne famille, mode PLAYER, son propre profil — immédiatement, sans reconnexion.
    const me = await mamie.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.family.id).toBe(familyId);
    expect(me.body.user.role).toBe('ADULT_PLAYER');
    expect(me.body.mode).toBe('PLAYER');
    expect(me.body.hasParentPin).toBe(false);
    expect(me.body.child).toMatchObject({ displayName: 'Mamie', avatar: '🦉', type: 'ADULT' });
    mamieId = me.body.child.id;

    const user = await prisma.user.findUniqueOrThrow({ where: { email: mamieEmail } });
    expect(user.familyRole).toBe('ADULT_PLAYER');
    expect(user.familyId).toBe(familyId);
    expect(user.parentPinHash).toBeNull();
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { id: mamieId } });
    expect(profile).toMatchObject({ type: 'ADULT', userId: user.id, familyId, pinHash: null });

    const home = await mamie.get('/api/me/home');
    expect(home.status).toBe(200);
    expect(home.body.child.id).toBe(mamieId);
    expect(home.body.creature).toBeNull(); // aucune créature créée automatiquement

    // L'autre appareil (ouvert en mode parent avant l'invitation) est révoqué.
    expect((await otherDevice.get('/api/auth/me')).status).toBe(401);

    // Connexion ultérieure : e-mail + mot de passe, directement en mode PLAYER, sans PIN enfant.
    const again = new Device(app);
    await again.post('/api/auth/login', { email: mamieEmail, password: PASSWORD });
    const meAgain = await again.get('/api/auth/me');
    expect(meAgain.body.mode).toBe('PLAYER');
    expect(meAgain.body.child.id).toBe(mamieId);
    // Le refresh conserve le mode PLAYER.
    expect((await again.post('/api/auth/refresh')).status).toBe(200);
    expect((await again.get('/api/auth/me')).body.mode).toBe('PLAYER');
  });

  // ─── 6 : aucun droit parent ────────────────────────────────────────────────

  it('6. Mamie n’a aucun droit parent (vérifié par le backend)', async () => {
    const mission = await papa.post('/api/missions', {
      title: 'Ranger',
      category: 'HELPING',
      icon: '🧹',
      xp: 10,
      coins: 2,
      recurrence: 'DAILY',
    });
    expect(mission.status).toBe(201);
    const forbidden: Array<[Method, string, object?]> = [
      ['get', '/api/family'],
      ['patch', '/api/family', { name: 'Piratée' }],
      ['put', '/api/family/parent-pin', { currentPassword: PASSWORD, pin: '0000' }],
      ['get', '/api/family/invitations'],
      ['post', '/api/family/invitations', { role: 'PARENT' }],
      ['post', '/api/family/invitations', { role: 'ADULT_PLAYER' }],
      ['get', '/api/missions'],
      ['get', '/api/missions/pending'],
      [
        'post',
        '/api/missions',
        { title: 'X', category: 'HELPING', icon: '🧹', xp: 5, coins: 0, recurrence: 'DAILY' },
      ],
      ['patch', `/api/missions/${mission.body.id}`, { xp: 999 }],
      ['delete', `/api/missions/${mission.body.id}`],
      ['post', `/api/missions/${mission.body.id}/validate`, { childId: mamieId }],
      ['post', '/api/rewards', { childId: mamieId, type: 'COINS', amount: 500 }],
      ['get', '/api/rewards'],
      ['post', '/api/children', { displayName: 'Z', avatar: '🦊', color: '#ff8a5c', pin: '1111' }],
      ['patch', `/api/children/${aliceId}`, { displayName: 'Piratée' }],
      ['put', `/api/children/${aliceId}/pin`, { pin: '0000' }],
      ['delete', `/api/children/${aliceId}`],
      ['get', '/api/parent/dashboard'],
      ['get', `/api/parent/children/${aliceId}`],
      ['get', '/api/parent/history'],
      ['post', '/api/auth/logout-all'],
      ['post', '/api/auth/password', { currentPassword: PASSWORD, newPassword: 'nouveau-mdp-1' }],
      // Écran « Qui joue ? » : pas pour un adulte joueur.
      ['get', '/api/profiles'],
      // Même en connaissant le PIN parent de Papa et le PIN d'Alice.
      ['post', '/api/auth/unlock/parent', { pin: '9876' }],
      ['post', '/api/auth/unlock/child', { childId: aliceId, pin: '1234' }],
      ['post', '/api/auth/lock'],
    ];
    for (const [method, path, body] of forbidden) {
      const res = await mamie.call(method, path, body);
      expect([path, res.status]).toEqual([path, 403]);
    }
    // Rien n'a changé : toujours en mode PLAYER, PIN d'Alice et famille intacts.
    expect((await mamie.get('/api/auth/me')).body.mode).toBe('PLAYER');
    expect((await alice.get('/api/me/home')).status).toBe(200);
    const family = await prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    expect(family.name).toBe('EL TEST');
    expect((await prisma.playerProfile.count({ where: { familyId } })) >= 2).toBe(true);
  });

  it('6b. une invitation PARENT ne peut pas être acceptée par Mamie (et reste valide)', async () => {
    const created = await papa.post('/api/family/invitations', { role: 'PARENT' });
    const res = await mamie.post(`/api/invitations/${created.body.token}/accept`, {
      parentPin: '2468',
    });
    expect(res.status).toBe(403);
    expect((await new Device(app).get(`/api/invitations/${created.body.token}`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mamieEmail } })).familyRole).toBe(
      'ADULT_PLAYER',
    );
    await papa.del(`/api/family/invitations/${created.body.id}`);
  });

  it('6c. une session de Mamie basculée en mode parent ou sur le profil d’Alice est refusée', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: mamieEmail } });
    const device = new Device(app);
    await device.post('/api/auth/login', { email: mamieEmail, password: PASSWORD });
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    // Profil d'un enfant substitué en base (changement d'identifiant) : refus.
    await prisma.authSession.update({ where: { id: session.id }, data: { childId: aliceId } });
    expect((await device.get('/api/me/home')).status).toBe(401);
    // Mode parent forcé en base : refus, même avec un JWT régénéré par refresh.
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        mode: 'PARENT',
        childId: null,
        parentModeExpiresAt: new Date(Date.now() + 600_000),
      },
    });
    expect((await device.get('/api/family')).status).toBe(401);
    expect((await device.post('/api/auth/refresh')).status).toBe(401);
    expect((await device.get('/api/family')).status).toBe(401);
  });

  // ─── 7 → 12 : missions, temps réel, validation, récompense ─────────────────

  it('7-12. mission attribuée à Mamie, demande en temps réel aux parents, validation et gains', async () => {
    // 7. Le parent crée une mission pour Mamie (avec une récompense objet) et une mission familiale.
    const forMamie = await papa.post('/api/missions', {
      title: 'Raconter une histoire',
      category: 'READING',
      icon: '📖',
      xp: 20,
      coins: 7,
      recurrence: 'DAILY',
      assignedChildId: mamieId,
      rewardItemId: 'apple',
    });
    expect(forMamie.status).toBe(201);
    const forKids = await papa.post('/api/missions', {
      title: 'Brosser les dents',
      category: 'HELPING',
      icon: '🪥',
      xp: 5,
      coins: 1,
      recurrence: 'DAILY',
    });
    expect(forKids.status).toBe(201);
    // Mamie apparaît comme destinataire possible côté parent.
    const profiles = await papa.get('/api/profiles');
    expect(profiles.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: mamieId, type: 'ADULT' })]),
    );
    // … mais pas sur l'écran « Qui joue ? » d'un appareil enfant.
    const kidsView = await alice.get('/api/profiles');
    expect(kidsView.body.map((p: { id: string }) => p.id)).not.toContain(mamieId);

    // 8. Mamie voit SA mission, pas les missions « pour tous les enfants ».
    await mamie.post('/api/me/creature/adopt', { speciesId: 'dragon', name: 'Braise' });
    const list = await mamie.get('/api/me/missions');
    const ids = (list.body as ChildMissionView[]).map((m) => m.id);
    expect(ids).toContain(forMamie.body.id);
    expect(ids).not.toContain(forKids.body.id);
    // Alice ne voit pas la mission de Mamie.
    const aliceIds = ((await alice.get('/api/me/missions')).body as ChildMissionView[]).map(
      (m) => m.id,
    );
    expect(aliceIds).toContain(forKids.body.id);
    expect(aliceIds).not.toContain(forMamie.body.id);
    expect((await mamie.post(`/api/me/missions/${forKids.body.id}/done`)).status).toBe(404);

    // Sockets : Papa (espace parent) et Mamie.
    const papaSocket = await connect(papa);
    const mamieSocket = await connect(mamie);
    expect(await roomsOf(papaSocket)).toContain(`parents:${familyId}`);
    const mamieRooms = await roomsOf(mamieSocket);
    expect(mamieRooms).toContain(`child:${mamieId}`);
    expect(mamieRooms.some((r) => r.startsWith('parents:'))).toBe(false);

    const mamieGotParentEvent = jest.fn();
    mamieSocket.on('mission:requested', mamieGotParentEvent);
    mamieSocket.on('security:pin-locked', mamieGotParentEvent);

    // 9 + 10. Mamie marque la mission faite ; les parents reçoivent mission:requested.
    const requested = new Promise<PendingCompletionView>((resolve) =>
      papaSocket.on('mission:requested', resolve),
    );
    const done = await mamie.post(`/api/me/missions/${forMamie.body.id}/done`);
    expect(done.status).toBe(200);
    const event = await requested;
    expect(event.child).toMatchObject({ id: mamieId, displayName: 'Mamie', type: 'ADULT' });
    expect(event.mission.id).toBe(forMamie.body.id);
    await new Promise((r) => setTimeout(r, 200));
    expect(mamieGotParentEvent).not.toHaveBeenCalled();

    // Mamie ne peut pas valider sa propre mission.
    expect((await mamie.post(`/api/missions/completions/${event.id}/approve`)).status).toBe(403);
    expect(
      (await mamie.post(`/api/missions/${forMamie.body.id}/validate`, { childId: mamieId })).status,
    ).toBe(403);
    const pending = await papa.get('/api/missions/pending');
    expect(pending.body.map((p: PendingCompletionView) => p.id)).toContain(event.id);

    // 11 + 12. Le parent valide ; Mamie reçoit la validation et ses gains.
    const before = (await mamie.get('/api/me/home')).body;
    const validated = new Promise<MissionValidatedPayload>((resolve) =>
      mamieSocket.on('mission:validated', resolve),
    );
    expect((await papa.post(`/api/missions/completions/${event.id}/approve`)).status).toBe(200);
    const payload = await validated;
    expect(payload).toMatchObject({ missionTitle: 'Raconter une histoire', xp: 20, coins: 7 });
    const after = (await mamie.get('/api/me/home')).body;
    expect(after.coins).toBe(before.coins + 7);
    expect(after.creature.totalXp).toBe(before.creature.totalXp + 20);
    const rewards = await mamie.get('/api/me/rewards');
    expect(rewards.body.some((r: { item?: { id: string } }) => r.item?.id === 'apple')).toBe(true);
    // Rejouer la validation ne redonne rien.
    expect((await papa.post(`/api/missions/completions/${event.id}/approve`)).status).toBe(409);
    expect((await mamie.get('/api/me/home')).body.coins).toBe(after.coins);

    // Le parent voit les statistiques de Mamie, avec le type ADULT.
    const detail = await papa.get(`/api/parent/children/${mamieId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.overview).toMatchObject({ type: 'ADULT', missionsCompletedTotal: 1 });
    const settings = await papa.get('/api/family');
    expect(settings.body.adultPlayers).toEqual([
      expect.objectContaining({ email: mamieEmail, profileId: mamieId }),
    ]);
    expect(settings.body.parents.map((p: { email: string }) => p.email)).not.toContain(mamieEmail);
  });

  // ─── 13 : moteur de jeu commun ─────────────────────────────────────────────

  it('13. inventaire, créature, exploration, Créaturopédie et village fonctionnent pour Mamie', async () => {
    const inventory = await mamie.get('/api/me/inventory');
    expect(inventory.status).toBe(200);
    const fed = await mamie.post('/api/me/feed', { itemId: 'strawberry' });
    expect([fed.status, fed.body.code]).toEqual([200, undefined]);
    expect((await mamie.get('/api/me/dex')).status).toBe(200);
    expect((await mamie.get('/api/me/recipes')).status).toBe(200);
    expect((await mamie.get('/api/me/village')).status).toBe(200);
    expect((await mamie.get('/api/me/zones')).status).toBe(200);

    await prisma.creature.updateMany({
      where: { childId: mamieId },
      data: { formId: 'dragon_baby', level: 2, totalXp: 40 },
    });
    const started = await mamie.post('/api/me/explorations', { zoneId: 'glowing_forest' });
    expect(started.status).toBe(201);
    await prisma.exploration.update({
      where: { id: started.body.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(ExplorationsService).complete(started.body.id)).toBe(true);
    const current = await mamie.get('/api/me/explorations/current');
    expect(current.body.unseen.xp).toBeGreaterThan(0);
  });

  // ─── 14 : profils des enfants et isolation familiale ───────────────────────

  it('14. Mamie ne peut pas jouer le profil d’un enfant ; isolation entre familles', async () => {
    // Aucun moyen de choisir un autre profil : l'identifiant vient de la session.
    expect((await mamie.get(`/api/parent/children/${aliceId}`)).status).toBe(403);
    expect(
      (await mamie.post('/api/auth/unlock/child', { childId: aliceId, pin: '1234' })).status,
    ).toBe(403);
    expect((await mamie.get('/api/me/home')).body.child.id).toBe(mamieId);

    // Le parent ne gère pas le profil de Mamie comme celui d'un enfant (PIN, édition, suppression).
    expect((await papa.put(`/api/children/${mamieId}/pin`, { pin: '0000' })).status).toBe(404);
    expect((await papa.patch(`/api/children/${mamieId}`, { displayName: 'X' })).status).toBe(404);
    expect((await papa.del(`/api/children/${mamieId}`)).status).toBe(404);
    expect(
      (await papa.post('/api/auth/unlock/child', { childId: mamieId, pin: '0000' })).status,
    ).toBe(404);

    // Autre famille : ni statistiques, ni mission, ni récompense pour Mamie.
    expect((await otherParent.get(`/api/parent/children/${mamieId}`)).status).toBe(404);
    expect(
      (
        await otherParent.post('/api/missions', {
          title: 'Intrusion',
          category: 'HELPING',
          icon: '🧹',
          xp: 5,
          coins: 0,
          recurrence: 'DAILY',
          assignedChildId: mamieId,
        })
      ).body.code,
    ).toBe('INVALID_CHILD');
    expect(
      (await otherParent.post('/api/rewards', { childId: mamieId, type: 'COINS', amount: 5 }))
        .status,
    ).toBe(404);
    // Mamie ne voit rien de l'autre famille.
    const foreign = await otherParent.post('/api/missions', {
      title: 'Mission B',
      category: 'HELPING',
      icon: '🧹',
      xp: 5,
      coins: 0,
      recurrence: 'DAILY',
      assignedChildId: otherChildId,
    });
    expect(foreign.status).toBe(201);
    expect((await mamie.post(`/api/me/missions/${foreign.body.id}/done`)).status).toBe(404);
  });

  // ─── 15 : concurrence ─────────────────────────────────────────────────────

  it('15. acceptations simultanées : un seul compte rejoint, un seul profil créé', async () => {
    const created = await papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' });
    const candidates = await Promise.all(
      [1, 2, 3].map(async (i) => {
        const d = new Device(app);
        await d.post('/api/auth/register', {
          email: `tata${i}-${Date.now()}@test.local`,
          password: PASSWORD,
          displayName: `Tata ${i}`,
        });
        return d;
      }),
    );
    const results = await Promise.all(
      candidates.map((d) => d.post(`/api/invitations/${created.body.token}/accept`, {})),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(2);
    expect(await prisma.playerProfile.count({ where: { familyId, type: 'ADULT' } })).toBe(2);

    // Un même compte qui accepte deux liens en même temps : une seule appartenance, un seul profil.
    const [l1, l2] = await Promise.all([
      papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' }),
      papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' }),
    ]);
    const solo = new Device(app);
    const soloEmail = `papi-${Date.now()}@test.local`;
    await solo.post('/api/auth/register', {
      email: soloEmail,
      password: PASSWORD,
      displayName: 'Papi',
    });
    const both = await Promise.all([
      solo.post(`/api/invitations/${l1?.body.token}/accept`, {}),
      solo.post(`/api/invitations/${l2?.body.token}/accept`, {}),
    ]);
    expect(both.filter((r) => r.status === 200)).toHaveLength(1);
    const papi = await prisma.user.findUniqueOrThrow({
      where: { email: soloEmail },
      include: { playerProfile: true },
    });
    expect(papi.familyRole).toBe('ADULT_PLAYER');
    expect(await prisma.playerProfile.count({ where: { userId: papi.id } })).toBe(1);
  });

  it('un compte déjà dans une famille ne peut pas devenir adulte joueur d’une autre', async () => {
    const created = await papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' });
    const res = await otherParent.post(`/api/invitations/${created.body.token}/accept`, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_IN_FAMILY');
    await papa.del(`/api/family/invitations/${created.body.id}`);
  });

  // ─── Invariant garanti par PostgreSQL (indépendamment du code applicatif) ──

  it('la base refuse tout profil hors invariant CHILD/ADULT', async () => {
    const CHECK = /ChildProfile_player_type_check/;
    const mamieUser = await prisma.user.findUniqueOrThrow({ where: { email: mamieEmail } });
    const spare = await prisma.user.create({
      data: { email: `spare-${Date.now()}@test.local`, passwordHash: 'x', displayName: 'Spare' },
    });
    const base = { familyId, displayName: 'Intrus', avatar: '🦊', color: '#ff8a5c' };

    // CHILD : PIN obligatoire, aucun compte.
    await expect(prisma.playerProfile.create({ data: { ...base, type: 'CHILD' } })).rejects.toThrow(
      CHECK,
    );
    await expect(
      prisma.playerProfile.create({
        data: { ...base, type: 'CHILD', pinHash: 'h', userId: spare.id },
      }),
    ).rejects.toThrow(CHECK);
    // ADULT : compte obligatoire, aucun PIN.
    await expect(
      prisma.playerProfile.create({ data: { ...base, type: 'ADULT', pinHash: 'h' } }),
    ).rejects.toThrow(CHECK);
    await expect(
      prisma.playerProfile.create({
        data: { ...base, type: 'ADULT', userId: spare.id, pinHash: 'h' },
      }),
    ).rejects.toThrow(CHECK);
    // Mutations qui casseraient un profil existant.
    await expect(
      prisma.playerProfile.update({ where: { id: mamieId }, data: { pinHash: 'h' } }),
    ).rejects.toThrow(CHECK);
    await expect(
      prisma.playerProfile.update({ where: { id: mamieId }, data: { type: 'CHILD' } }),
    ).rejects.toThrow(CHECK);
    await expect(
      prisma.playerProfile.update({ where: { id: aliceId }, data: { userId: spare.id } }),
    ).rejects.toThrow(CHECK);
    // Un compte = un seul profil adulte.
    await expect(
      prisma.playerProfile.create({ data: { ...base, type: 'ADULT', userId: mamieUser.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Aucune ligne créée, profils existants intacts.
    expect(await prisma.playerProfile.count({ where: { displayName: 'Intrus' } })).toBe(0);
    await prisma.user.delete({ where: { id: spare.id } });
  });

  it('ON DELETE RESTRICT : le compte d’un adulte joueur ne peut pas être supprimé tant que son profil existe', async () => {
    const mamieUser = await prisma.user.findUniqueOrThrow({ where: { email: mamieEmail } });
    const creaturesBefore = await prisma.creature.count({ where: { childId: mamieId } });
    await expect(prisma.user.delete({ where: { id: mamieUser.id } })).rejects.toThrow(
      /23001[\s\S]*violates RESTRICT setting[\s\S]*ChildProfile_userId_fkey/,
    );
    // Ni profil orphelin, ni données de jeu effacées.
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { id: mamieId } });
    expect(profile.userId).toBe(mamieUser.id);
    expect(await prisma.creature.count({ where: { childId: mamieId } })).toBe(creaturesBefore);
    expect((await mamie.get('/api/me/home')).status).toBe(200);
  });
});
