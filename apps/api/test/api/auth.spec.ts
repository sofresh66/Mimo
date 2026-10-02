import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp, prisma, setupFamily } from '../helpers';

describe('Authentification et permissions', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('inscrit un parent, refuse un e-mail en double et un mot de passe trop court', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'a@test.local', password: 'court', displayName: 'P' })
      .expect(400);
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'dup@test.local', password: 'motdepasse-ok', displayName: 'P' })
      .expect(201);
    const dup = await request(server)
      .post('/api/auth/register')
      .send({ email: 'DUP@test.local', password: 'motdepasse-ok', displayName: 'P' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  it('stocke les mots de passe et PIN hachés (Argon2)', async () => {
    const { childId } = await setupFamily(app);
    const child = await prisma.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(child.pinHash).toMatch(/^\$argon2id\$/);
    expect(child.pinHash).not.toContain('1234');
  });

  it('connecte un parent avec des cookies HttpOnly et refuse un mauvais mot de passe', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'login@test.local', password: 'motdepasse-ok', displayName: 'Maman' });
    const bad = await request(server)
      .post('/api/auth/login')
      .send({ email: 'login@test.local', password: 'mauvais-mdp' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const ok = await request(server)
      .post('/api/auth/login')
      .send({ email: 'login@test.local', password: 'motdepasse-ok' })
      .expect(200);
    const cookies = ([] as string[]).concat(ok.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('mimo_at=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('mimo_rt=') && c.includes('Path=/api/auth'))).toBe(
      true,
    );
  });

  it('un vieux cookie de session ne bloque pas la connexion', async () => {
    const { parent } = await setupFamily(app);
    await parent.post('/api/auth/logout').expect(200);
    await prisma.authSession.deleteMany({});
    const me = await parent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('sélection enfant + PIN : erreur, essais restants puis verrouillage', async () => {
    const { parent, secondChildId } = await setupFamily(app);
    const wrong = await parent
      .post('/api/auth/unlock/child')
      .send({ childId: secondChildId, pin: '0000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.details.remainingAttempts).toBe(4);
    for (let i = 0; i < 3; i += 1)
      await parent.post('/api/auth/unlock/child').send({ childId: secondChildId, pin: '0000' });
    const locked = await parent
      .post('/api/auth/unlock/child')
      .send({ childId: secondChildId, pin: '0000' });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('PIN_LOCKED');
    // Même le bon PIN est refusé pendant le verrouillage.
    const stillLocked = await parent
      .post('/api/auth/unlock/child')
      .send({ childId: secondChildId, pin: '4321' });
    expect(stillLocked.status).toBe(423);
  });

  it('un enfant ne peut jamais appeler les endpoints parent', async () => {
    const { child, childId } = await setupFamily(app);
    const me = await child.get('/api/auth/me').expect(200);
    expect(me.body.mode).toBe('CHILD');
    expect(me.body.child.id).toBe(childId);
    for (const [method, url] of [
      ['get', '/api/parent/dashboard'],
      ['get', '/api/missions'],
      ['post', '/api/missions'],
      ['post', '/api/children'],
      ['post', '/api/rewards'],
      ['patch', '/api/family'],
      ['get', '/api/family'],
    ] as const) {
      const res = await child[method](url).send({});
      expect(res.status).toBe(403);
    }
  });

  it("un appareil verrouillé n'accède ni aux données enfant ni à l'espace parent", async () => {
    const { child } = await setupFamily(app);
    await child.post('/api/auth/lock').expect(200);
    expect((await child.get('/api/me/home')).status).toBe(403);
    expect((await child.get('/api/parent/dashboard')).status).toBe(403);
    // « Qui joue ? » reste disponible.
    const profiles = await child.get('/api/profiles').expect(200);
    expect(profiles.body).toHaveLength(2);
    // Le PIN parent rouvre l'espace parent.
    expect((await child.post('/api/auth/unlock/parent').send({ pin: '1111' })).status).toBe(400);
    await child.post('/api/auth/unlock/parent').send({ pin: '9876' }).expect(200);
    await child.get('/api/parent/dashboard').expect(200);
  });

  it("isole les familles : impossible de sélectionner l'enfant d'une autre famille", async () => {
    const a = await setupFamily(app);
    const b = await setupFamily(app);
    await a.parent.post('/api/auth/lock').expect(200);
    const res = await a.parent
      .post('/api/auth/unlock/child')
      .send({ childId: b.childId, pin: '1234' });
    expect(res.status).toBe(404);
  });

  it('fait tourner le refresh token (l’ancien devient invalide)', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'refresh@test.local', password: 'motdepasse-ok', displayName: 'P' });
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'refresh@test.local', password: 'motdepasse-ok' });
    const refreshCookie = ([] as string[])
      .concat(login.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('mimo_rt='));
    const cookie = refreshCookie?.split(';')[0] ?? '';
    await request(server).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    await request(server).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('change le mot de passe et révoque les autres appareils', async () => {
    const { parent, child } = await setupFamily(app);
    await parent
      .post('/api/auth/password')
      .send({ currentPassword: 'motdepasse-solide', newPassword: 'nouveau-mot-de-passe' })
      .expect(200);
    expect((await child.get('/api/me/home')).status).toBe(401);
    await parent.get('/api/parent/dashboard').expect(200);
  });

  // En dernier : l'IP de test reste bloquée pendant la fenêtre de limitation.
  it('limite les tentatives de connexion (rate limiting)', async () => {
    process.env.AUTH_RATE_LIMIT = '3';
    try {
      const server = app.getHttpServer();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await request(server)
          .post('/api/auth/login')
          .send({ email: 'brute@test.local', password: 'x' });
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
    } finally {
      process.env.AUTH_RATE_LIMIT = '1000';
    }
  });
});
