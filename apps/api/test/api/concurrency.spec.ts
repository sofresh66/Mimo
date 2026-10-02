import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { adopt, createApp, prisma, setupFamily } from '../helpers';

/** Régressions de la revue sécurité : courses et rejeux ne doivent jamais doubler un gain. */
describe('Concurrence et rejeux', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('validations directes simultanées : une seule attribution d’XP', async () => {
    const f = await setupFamily(app);
    await adopt(f.child);
    const mission = await f.parent
      .post('/api/missions')
      .send({
        title: 'Course',
        category: 'SPORT',
        icon: '⚽',
        xp: 30,
        coins: 5,
        recurrence: 'DAILY',
      })
      .expect(201);
    // Demande en attente : chemin qui permettait la double validation.
    await f.child.post(`/api/me/missions/${mission.body.id}/done`).expect(200);
    const [pending] = (await f.parent.get('/api/missions/pending')).body;

    const results = await Promise.all([
      f.parent.post(`/api/missions/${mission.body.id}/validate`).send({ childId: f.childId }),
      f.parent.post(`/api/missions/${mission.body.id}/validate`).send({ childId: f.childId }),
      f.parent.post(`/api/missions/completions/${pending.id}/approve`),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const creature = await prisma.creature.findFirstOrThrow({ where: { childId: f.childId } });
    expect(creature.totalXp).toBe(30);
    expect(await prisma.xPEvent.count({ where: { childId: f.childId, source: 'MISSION' } })).toBe(
      1,
    );
  });

  it('rafale de PIN faux : chaque essai est compté', async () => {
    const f = await setupFamily(app);
    await f.parent.post('/api/auth/lock').expect(200);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        f.parent.post('/api/auth/unlock/child').send({ childId: f.secondChildId, pin: '0000' }),
      ),
    );
    const child = await prisma.playerProfile.findUniqueOrThrow({ where: { id: f.secondChildId } });
    expect(child.pinFailedAttempts).toBe(4);
    const fifth = await f.parent
      .post('/api/auth/unlock/child')
      .send({ childId: f.secondChildId, pin: '0000' });
    expect(fifth.status).toBe(423);
  });

  it('le verrouillage s’allonge et le compteur ne repart à zéro qu’après un succès', async () => {
    const f = await setupFamily(app);
    await prisma.playerProfile.update({
      where: { id: f.secondChildId },
      data: { pinFailedAttempts: 9 },
    });
    const res = await f.parent
      .post('/api/auth/unlock/child')
      .send({ childId: f.secondChildId, pin: '0000' });
    expect(res.status).toBe(423);
    expect(res.body.details.retryInSeconds).toBe(30 * 60);
  });

  it('soumissions de mini-jeu parallèles : le plafond quotidien tient', async () => {
    const f = await setupFamily(app);
    await adopt(f.child);
    const sessions = [];
    for (let i = 0; i < 8; i += 1) {
      const s = await f.child
        .post('/api/me/games/math/start')
        .send({ difficulty: 'easy' })
        .expect(201);
      sessions.push(s.body.sessionId as string);
    }
    await prisma.gameSession.updateMany({
      where: { id: { in: sessions } },
      data: { startedAt: new Date(Date.now() - 60_000) },
    });
    const stored = await prisma.gameSession.findMany({ where: { id: { in: sessions } } });
    const results = await Promise.all(
      stored.map((s) =>
        f.child.post(`/api/me/games/sessions/${s.id}/submit`).send({
          submission: {
            kind: 'math',
            answers: (s.challenge as { answers: string[] }).answers.map(Number),
          },
        }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.xpAwarded > 0)).toHaveLength(5);
  });

  it('refresh simultanés avec le même jeton : un seul réussit', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/auth/register')
      .send({ email: 'race@test.local', password: 'motdepasse-ok', displayName: 'P' });
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'race@test.local', password: 'motdepasse-ok' });
    const cookie =
      ([] as string[])
        .concat(login.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('mimo_rt='))
        ?.split(';')[0] ?? '';
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(server).post('/api/auth/refresh').set('Cookie', cookie),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
});
