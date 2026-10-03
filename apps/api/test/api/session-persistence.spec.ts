import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp, Device, prisma } from '../helpers';

const PASSWORD = 'motdepasse-solide';
const ACCESS = 'mimo_at';
const REFRESH = 'mimo_rt';
let seq = 0;

/**
 * Session persistante : un jeton d'accès court (cookie de 15 min) et un refresh token long,
 * HttpOnly, à rotation. À la réouverture de l'application, le cookie d'accès a expiré : la
 * session doit être restaurée par `/auth/refresh`, sans e-mail ni mot de passe.
 */
describe('Persistance de session (refresh silencieux)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function family() {
    seq += 1;
    const email = `persist${seq}-${Date.now()}@test.local`;
    const device = new Device(app);
    const login = await device.post('/api/auth/register', {
      email,
      password: PASSWORD,
      displayName: 'Papa',
    });
    await device.post('/api/family', { name: 'Persistance', parentPin: '2468' });
    const child = await device.post('/api/children', {
      displayName: 'Léa',
      avatar: '🦊',
      color: '#ff8a5c',
      pin: '1234',
    });
    return { email, device, login, childId: child.body.id as string };
  }

  /** Réouverture de l'application après expiration du cookie d'accès. */
  async function reopen(device: Device) {
    device.forget(ACCESS);
    expect((await device.get('/api/auth/me')).body.code).toBe('UNAUTHENTICATED');
    return device.post('/api/auth/refresh');
  }

  it('cookies : accès court, refresh long, tous deux HttpOnly + SameSite=Lax', async () => {
    const { login } = await family();
    const cookies = ([] as string[]).concat(login.headers['set-cookie'] ?? []);
    const access = cookies.find((c) => c.startsWith(`${ACCESS}=`)) ?? '';
    const refresh = cookies.find((c) => c.startsWith(`${REFRESH}=`)) ?? '';
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Max-Age=900\b/); // 15 min, inchangé
    expect(access).toMatch(/Path=\/(;|$)/);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/Max-Age=2592000\b/); // 30 jours, inchangé
    expect(refresh).toMatch(/Path=\/api\/auth/);
  });

  it('réouverture : refresh silencieux, session restaurée sans mot de passe (mode conservé)', async () => {
    const { device } = await family();
    expect((await reopen(device)).status).toBe(200);
    expect(device.has(ACCESS)).toBe(true);
    const me = await device.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.mode).toBe('PARENT');
  });

  it('espace parent expiré : retour à « Qui joue ? », le PIN parent suffit', async () => {
    const { device, email } = await family();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { parentModeExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await reopen(device)).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await device.get('/api/profiles')).status).toBe(200);
    expect((await device.post('/api/auth/unlock/parent', { pin: '2468' })).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('PARENT');
  });

  it('après verrouillage : le PIN parent rouvre l’espace parent, même après réouverture', async () => {
    const { device } = await family();
    expect((await device.post('/api/auth/lock')).status).toBe(200);
    expect((await reopen(device)).status).toBe(200);
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    expect((await device.post('/api/auth/unlock/parent', { pin: '2468' })).status).toBe(200);
    expect((await device.get('/api/parent/dashboard')).status).toBe(200);
  });

  it('enfant : la sélection profil + PIN reste active après réouverture', async () => {
    const { device, childId } = await family();
    await device.post('/api/auth/lock');
    expect((await device.post('/api/auth/unlock/child', { childId, pin: '1234' })).status).toBe(
      200,
    );
    expect((await reopen(device)).status).toBe(200);
    const me = await device.get('/api/auth/me');
    expect(me.body.mode).toBe('CHILD');
    expect(me.body.child.id).toBe(childId);
    expect((await device.get('/api/me/home')).status).toBe(200);
  });

  it('refresh expiré : refus, cookies effacés (retour à la connexion)', async () => {
    const { device, email } = await family();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.authSession.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await reopen(device);
    expect(res.status).toBe(401);
    expect(device.has(REFRESH)).toBe(false);
    expect((await device.get('/api/auth/me')).status).toBe(401);
  });

  it('session révoquée (déconnexion de tous les appareils) : refus immédiat, puis refresh refusé', async () => {
    const { device, email } = await family();
    const other = new Device(app);
    await other.post('/api/auth/login', { email, password: PASSWORD });
    expect((await other.post('/api/auth/logout-all')).status).toBe(200);
    // Le jeton d'accès encore valide est refusé immédiatement (session vérifiée en base).
    expect((await device.get('/api/auth/me')).body.code).toBe('SESSION_REVOKED');
    expect((await device.post('/api/auth/refresh')).status).toBe(401);
    expect(device.has(REFRESH)).toBe(false);
  });

  it('logout : cookies effacés et refresh token inutilisable', async () => {
    const { device } = await family();
    const stolen = device.header();
    const res = await device.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(device.has(ACCESS)).toBe(false);
    expect(device.has(REFRESH)).toBe(false);
    // Même en rejouant les anciens cookies, la session est terminée.
    const replay = new Device(app);
    replay.load(stolen);
    expect((await replay.get('/api/auth/me')).status).toBe(401);
    expect((await replay.post('/api/auth/refresh')).status).toBe(401);
  });

  it('adulte joueur : session PLAYER persistante après réouverture', async () => {
    const { device: papa } = await family();
    const invitation = await papa.post('/api/family/invitations', { role: 'ADULT_PLAYER' });
    const mamie = new Device(app);
    await mamie.post('/api/auth/register', {
      email: `mamie-persist-${Date.now()}@test.local`,
      password: PASSWORD,
      displayName: 'Mamie',
    });
    await mamie.post(`/api/invitations/${invitation.body.token}/accept`, {});
    expect((await reopen(mamie)).status).toBe(200);
    const me = await mamie.get('/api/auth/me');
    expect(me.body.mode).toBe('PLAYER');
    expect(me.body.child.type).toBe('ADULT');
    expect((await mamie.get('/api/me/home')).status).toBe(200);
  });
});
