import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, Device, prisma, type Method } from '../helpers';

const PASSWORD = 'motdepasse-solide';
const PIN = '2468';
let seq = 0;

/**
 * Accès à l'espace parent : le PIN parent est exigé dès qu'un compte ayant une famille se
 * connecte (première connexion, reconnexion, nouvel appareil). Le serveur est l'autorité :
 * toutes les API parent refusent une session qui n'est pas en mode PARENT.
 */
describe('Accès à l’espace parent (PIN obligatoire)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Famille configurée par Papa (inscription → famille + PIN → un enfant, Léa). */
  async function family() {
    seq += 1;
    const email = `acces${seq}-${Date.now()}@test.local`;
    const setup = new Device(app);
    await setup.post('/api/auth/register', { email, password: PASSWORD, displayName: 'Papa' });
    await setup.post('/api/family', { name: 'Accès', parentPin: PIN });
    const lea = await setup.post('/api/children', {
      displayName: 'Léa',
      avatar: '🦊',
      color: '#ff8a5c',
      pin: '1111',
    });
    const mission = await setup.post('/api/missions', {
      title: 'Ranger',
      category: 'HELPING',
      icon: '🧹',
      xp: 10,
      coins: 1,
      recurrence: 'DAILY',
    });
    return { email, setup, leaId: lea.body.id as string, missionId: mission.body.id as string };
  }

  async function login(email: string) {
    const device = new Device(app);
    expect((await device.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    return device;
  }

  /** Toutes les API parent sensibles, avec un corps valide. */
  const parentCalls = (leaId: string, missionId: string): Array<[Method, string, object]> => [
    ['get', '/api/parent/dashboard', {}],
    ['get', `/api/parent/children/${leaId}`, {}],
    ['get', '/api/family', {}],
    ['patch', '/api/family', { name: 'Piratée' }],
    ['get', '/api/missions', {}],
    ['get', '/api/missions/pending', {}],
    ['post', `/api/missions/${missionId}/validate`, { childId: leaId }],
    ['post', '/api/rewards', { childId: leaId, type: 'COINS', amount: 50 }],
    ['put', `/api/children/${leaId}/pin`, { pin: '0000' }],
    ['patch', `/api/children/${leaId}`, { displayName: 'Piratée' }],
    ['delete', `/api/children/${leaId}`, {}],
    [
      'post',
      '/api/children',
      { displayName: 'Intrus', avatar: '🦊', color: '#ff8a5c', pin: '1234' },
    ],
    ['get', '/api/family/invitations', {}],
    ['post', '/api/family/invitations', { role: 'PARENT' }],
    ['put', '/api/family/parent-pin', { currentPassword: PASSWORD, pin: '0000' }],
    ['post', '/api/auth/logout-all', {}],
    ['post', '/api/auth/password', { currentPassword: PASSWORD, newPassword: 'nouveau-mdp-1' }],
  ];

  async function expectParentRefused(device: Device, leaId: string, missionId: string) {
    for (const [method, path, body] of parentCalls(leaId, missionId)) {
      const res = await device.call(method, path, body);
      expect([path, res.status]).toEqual([path, 403]);
    }
  }

  it('première connexion sur un nouvel appareil : « Qui joue ? », aucune API parent sans PIN', async () => {
    const f = await family();
    const device = await login(f.email);
    const me = (await device.get('/api/auth/me')).body;
    expect(me.mode).toBe('DEVICE');
    expect(me.parentModeExpiresAt).toBeNull();
    expect(me.hasParentPin).toBe(true);
    // « Qui joue ? » reste accessible (sélection des enfants).
    expect((await device.get('/api/profiles')).status).toBe(200);
    await expectParentRefused(device, f.leaId, f.missionId);
    // Rien n'a été modifié.
    const lea = await prisma.playerProfile.findUniqueOrThrow({ where: { id: f.leaId } });
    expect(lea.displayName).toBe('Léa');
  });

  it('mauvais PIN refusé ; bon PIN → espace parent pour 30 minutes', async () => {
    const f = await family();
    const device = await login(f.email);
    expect((await device.post('/api/auth/unlock/parent', { pin: '0000' })).status).toBe(400);
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await device.get('/api/parent/dashboard')).status).toBe(403);

    expect((await device.post('/api/auth/unlock/parent', { pin: PIN })).status).toBe(200);
    const me = (await device.get('/api/auth/me')).body;
    expect(me.mode).toBe('PARENT');
    const minutes = (new Date(me.parentModeExpiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    // Missions et récompenses parentales fonctionnent après déverrouillage.
    expect((await device.get('/api/parent/dashboard')).status).toBe(200);
    expect(
      (await device.post(`/api/missions/${f.missionId}/validate`, { childId: f.leaId })).status,
    ).toBe(200);
    expect(
      (await device.post('/api/rewards', { childId: f.leaId, type: 'COINS', amount: 5 })).status,
    ).toBe(201);
  });

  it('refresh après déverrouillage : mode parent conservé, puis perdu à l’expiration', async () => {
    const f = await family();
    const device = await login(f.email);
    await device.post('/api/auth/unlock/parent', { pin: PIN });
    device.forget('mimo_at');
    expect((await device.post('/api/auth/refresh')).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('PARENT');

    await prisma.authSession.updateMany({
      where: { user: { email: f.email }, mode: 'PARENT' },
      data: { parentModeExpiresAt: new Date(Date.now() - 1000) },
    });
    device.forget('mimo_at');
    expect((await device.post('/api/auth/refresh')).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await device.get('/api/parent/dashboard')).status).toBe(403);
  });

  it('« Verrouiller », déconnexion puis reconnexion : le PIN est de nouveau exigé', async () => {
    const f = await family();
    const device = await login(f.email);
    await device.post('/api/auth/unlock/parent', { pin: PIN });
    expect((await device.post('/api/auth/lock')).status).toBe(200);
    expect((await device.get('/api/parent/dashboard')).status).toBe(403);

    await device.post('/api/auth/unlock/parent', { pin: PIN });
    await device.post('/api/auth/logout');
    expect((await device.get('/api/auth/me')).status).toBe(401);
    // Le déverrouillage ne survit pas à la déconnexion : nouvelle session en mode appareil.
    await device.post('/api/auth/login', { email: f.email, password: PASSWORD });
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await device.get('/api/parent/dashboard')).status).toBe(403);
  });

  it('un appareil déverrouillé n’ouvre pas l’espace parent sur un autre appareil', async () => {
    const f = await family();
    const first = await login(f.email);
    await first.post('/api/auth/unlock/parent', { pin: PIN });
    const second = await login(f.email);
    expect((await second.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await second.get('/api/parent/dashboard')).status).toBe(403);
    expect((await first.get('/api/parent/dashboard')).status).toBe(200);
  });

  it('enfant : profil + PIN, aucun accès parent (URL ou API directe), refresh conserve CHILD', async () => {
    const f = await family();
    const device = await login(f.email);
    expect(
      (await device.post('/api/auth/unlock/child', { childId: f.leaId, pin: '1111' })).status,
    ).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('CHILD');
    await expectParentRefused(device, f.leaId, f.missionId);
    expect((await device.post('/api/auth/unlock/parent', { pin: '0000' })).status).toBe(400);
    expect((await device.get('/api/auth/me')).body.mode).toBe('CHILD');
    device.forget('mimo_at');
    expect((await device.post('/api/auth/refresh')).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('CHILD');
    expect((await device.get('/api/me/home')).status).toBe(200);
  });

  it('création de la famille : le mode parent de l’inscription ne survit pas à une reconnexion', async () => {
    seq += 1;
    const email = `onboarding${seq}-${Date.now()}@test.local`;
    const device = new Device(app);
    await device.post('/api/auth/register', { email, password: PASSWORD, displayName: 'Maman' });
    // Sans famille : mode parent pour créer la famille et choisir son PIN.
    expect((await device.get('/api/auth/me')).body.mode).toBe('PARENT');
    expect((await device.post('/api/family', { name: 'Neuve', parentPin: PIN })).status).toBe(201);
    expect(
      (
        await device.post('/api/children', {
          displayName: 'Tom',
          avatar: '🐼',
          color: '#3fb6e8',
          pin: '3333',
        })
      ).status,
    ).toBe(201);
    // Fin de la configuration : « Qui joue ? » verrouille l'espace parent.
    expect((await device.post('/api/auth/lock')).status).toBe(200);
    expect((await device.get('/api/parent/dashboard')).status).toBe(403);
    // Et toute nouvelle connexion exige le PIN.
    const again = await login(email);
    expect((await again.get('/api/auth/me')).body.mode).toBe('DEVICE');
  });

  it('changement du PIN parent : l’ancien est refusé, le nouveau ouvre l’espace parent', async () => {
    const f = await family();
    const device = await login(f.email);
    await device.post('/api/auth/unlock/parent', { pin: PIN });
    expect(
      (await device.put('/api/family/parent-pin', { currentPassword: PASSWORD, pin: '8642' }))
        .status,
    ).toBe(200);
    const other = await login(f.email);
    expect((await other.post('/api/auth/unlock/parent', { pin: PIN })).status).toBe(400);
    expect((await other.post('/api/auth/unlock/parent', { pin: '8642' })).status).toBe(200);
  });

  it('invitation parent : le nouveau parent rejoint la famille, puis le PIN est exigé', async () => {
    const f = await family();
    const papa = await login(f.email);
    await papa.post('/api/auth/unlock/parent', { pin: PIN });
    const invitation = await papa.post('/api/family/invitations', { role: 'PARENT' });
    expect(invitation.status).toBe(201);

    const mamanEmail = `maman-acces-${Date.now()}@test.local`;
    const maman = new Device(app);
    await maman.post('/api/auth/register', {
      email: mamanEmail,
      password: PASSWORD,
      displayName: 'Maman',
    });
    expect(
      (await maman.post(`/api/invitations/${invitation.body.token}/accept`, { parentPin: '9753' }))
        .status,
    ).toBe(200);
    // Juste après l'acceptation : pas de fenêtre d'accès libre, le PIN est exigé.
    expect((await maman.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await maman.get('/api/parent/dashboard')).status).toBe(403);
    const again = await login(mamanEmail);
    expect((await again.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await again.post('/api/auth/unlock/parent', { pin: '9753' })).status).toBe(200);
    expect((await again.get('/api/parent/dashboard')).status).toBe(200);
  });

  it('adulte joueur (Mamie) : toujours PLAYER, jamais d’espace parent, même avec le PIN de Papa', async () => {
    const f = await family();
    const papa = await login(f.email);
    await papa.post('/api/auth/unlock/parent', { pin: PIN });
    const invitation = await papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' });
    const mamieEmail = `mamie-acces-${Date.now()}@test.local`;
    const mamie = new Device(app);
    await mamie.post('/api/auth/register', {
      email: mamieEmail,
      password: PASSWORD,
      displayName: 'Mamie',
    });
    await mamie.post(`/api/invitations/${invitation.body.token}/accept`, {});
    const again = await login(mamieEmail);
    expect((await again.get('/api/auth/me')).body.mode).toBe('PLAYER');
    expect((await again.post('/api/auth/unlock/parent', { pin: PIN })).status).toBe(403);
    expect((await again.get('/api/parent/dashboard')).status).toBe(403);
    again.forget('mimo_at');
    expect((await again.post('/api/auth/refresh')).status).toBe(200);
    expect((await again.get('/api/auth/me')).body.mode).toBe('PLAYER');
  });
});
