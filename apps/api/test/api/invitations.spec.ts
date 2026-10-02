import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp, prisma, setupFamily, type Agent } from '../helpers';

describe('Invitation d’un second parent', () => {
  let app: NestExpressApplication;
  let counter = 0;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Nouveau compte parent sans famille (son propre e-mail et mot de passe). */
  async function newParent(name = 'Maman'): Promise<{ agent: Agent; email: string }> {
    counter += 1;
    const email = `invite${counter}-${Date.now()}@test.local`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/register')
      .send({ email, password: 'autre-mot-de-passe', displayName: name })
      .expect(201);
    return { agent, email };
  }

  it('parcours complet : invitation → aperçu public → acceptation → même famille', async () => {
    const f = await setupFamily(app);
    const created = await f.parent.post('/api/family/invitations').expect(201);
    expect(created.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Seul le hash est stocké.
    const stored = await prisma.parentInvitation.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(stored.tokenHash).not.toContain(created.body.token);

    const listed = await f.parent.get('/api/family/invitations').expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].token).toBeUndefined();

    const preview = await request(app.getHttpServer())
      .get(`/api/invitations/${created.body.token}`)
      .expect(200);
    expect(preview.body).toEqual({
      familyName: 'Famille Test',
      invitedBy: 'Papa',
      expiresAt: expect.any(String),
      alreadyMember: false,
    });
    expect((await f.parent.get(`/api/invitations/${created.body.token}`)).body.alreadyMember).toBe(
      true,
    );

    const { agent: maman, email } = await newParent();
    const noPin = await maman.post(`/api/invitations/${created.body.token}/accept`).send({});
    expect(noPin.status).toBe(400);
    expect(noPin.body.code).toBe('PARENT_PIN_REQUIRED');
    const accepted = await maman
      .post(`/api/invitations/${created.body.token}/accept`)
      .send({ parentPin: '5555' })
      .expect(200);
    expect(accepted.body.familyName).toBe('Famille Test');

    // Mêmes enfants, mêmes paramètres familiaux.
    const dash = await maman.get('/api/parent/dashboard').expect(200);
    expect(dash.body.children).toHaveLength(2);
    const settings = await maman.get('/api/family').expect(200);
    expect(settings.body.parents.map((p: { email: string }) => p.email)).toContain(email);
    expect(settings.body.parents).toHaveLength(2);

    // Usage unique.
    const reuse = await (
      await newParent('Mamie')
    ).agent
      .post(`/api/invitations/${created.body.token}/accept`)
      .send({ parentPin: '1111' });
    expect(reuse.status).toBe(404);
    expect(reuse.body.code).toBe('INVITATION_INVALID');
    expect((await f.parent.get('/api/family/invitations')).body).toHaveLength(0);
  });

  it('chaque parent garde son mot de passe et son PIN, et agit sur les mêmes données', async () => {
    const f = await setupFamily(app);
    const { token } = (await f.parent.post('/api/family/invitations').expect(201)).body;
    const { agent: maman, email } = await newParent();
    await maman.post(`/api/invitations/${token}/accept`).send({ parentPin: '5555' }).expect(200);

    // Mission créée par le premier parent, demandée par l'enfant, validée par le second.
    const mission = await f.parent
      .post('/api/missions')
      .send({
        title: 'Lire',
        category: 'READING',
        icon: '📖',
        xp: 20,
        coins: 5,
        recurrence: 'DAILY',
      })
      .expect(201);
    await f.child
      .post('/api/me/creature/adopt')
      .send({ speciesId: 'fox', name: 'Luna' })
      .expect(201);
    await f.child.post(`/api/me/missions/${mission.body.id}/done`).expect(200);
    const [pending] = (await maman.get('/api/missions/pending').expect(200)).body;
    const approved = await maman
      .post(`/api/missions/completions/${pending.id}/approve`)
      .expect(200);
    expect(approved.body.parentName).toBe('Maman');

    // Connexion avec son propre mot de passe, déverrouillage avec son propre PIN.
    const device = request.agent(app.getHttpServer());
    await device
      .post('/api/auth/login')
      .send({ email, password: 'autre-mot-de-passe' })
      .expect(200);
    await device.post('/api/auth/lock').expect(200);
    expect((await device.post('/api/auth/unlock/parent').send({ pin: '9876' })).status).toBe(400);
    await device.post('/api/auth/unlock/parent').send({ pin: '5555' }).expect(200);
    await device.get('/api/parent/dashboard').expect(200);
  });

  it('révocation et expiration rendent le lien inutilisable', async () => {
    const f = await setupFamily(app);
    const revoked = (await f.parent.post('/api/family/invitations').expect(201)).body;
    await f.parent.delete(`/api/family/invitations/${revoked.id}`).expect(200);
    expect(
      (await request(app.getHttpServer()).get(`/api/invitations/${revoked.token}`)).status,
    ).toBe(404);

    const expired = (await f.parent.post('/api/family/invitations').expect(201)).body;
    await prisma.parentInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const { agent } = await newParent();
    expect(
      (await agent.post(`/api/invitations/${expired.token}/accept`).send({ parentPin: '1234' }))
        .status,
    ).toBe(404);
    expect((await request(app.getHttpServer()).get('/api/invitations/pas-un-jeton')).status).toBe(
      404,
    );
  });

  it('isolation : pas de révocation ni de liste inter-familles, enfant et appareil refusés', async () => {
    const a = await setupFamily(app);
    const b = await setupFamily(app);
    const invite = (await a.parent.post('/api/family/invitations').expect(201)).body;
    expect((await b.parent.delete(`/api/family/invitations/${invite.id}`)).status).toBe(404);
    expect((await b.parent.get('/api/family/invitations')).body).toHaveLength(0);

    expect((await a.child.post('/api/family/invitations')).status).toBe(403);
    expect((await a.child.get('/api/family/invitations')).status).toBe(403);
    // Un enfant ne peut pas utiliser un lien pour rattacher le compte de l'appareil ailleurs.
    expect(
      (await a.child.post(`/api/invitations/${invite.token}/accept`).send({ parentPin: '1234' }))
        .status,
    ).toBe(403);
  });

  it('refuse un compte déjà membre d’une famille', async () => {
    const a = await setupFamily(app);
    const b = await setupFamily(app);
    const { token } = (await a.parent.post('/api/family/invitations').expect(201)).body;
    const other = await b.parent.post(`/api/invitations/${token}/accept`).send({});
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('ALREADY_IN_FAMILY');
    const self = await a.parent.post(`/api/invitations/${token}/accept`).send({});
    expect(self.body.code).toBe('ALREADY_MEMBER');
    // L'invitation reste utilisable : les refus n'ont rien consommé.
    expect((await request(app.getHttpServer()).get(`/api/invitations/${token}`)).status).toBe(200);
  });

  it('acceptations simultanées du même lien : un seul parent rejoint', async () => {
    const f = await setupFamily(app);
    const { token } = (await f.parent.post('/api/family/invitations').expect(201)).body;
    const candidates = await Promise.all([newParent('A'), newParent('B'), newParent('C')]);
    const results = await Promise.all(
      candidates.map(({ agent }) =>
        agent.post(`/api/invitations/${token}/accept`).send({ parentPin: '2468' }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const family = await prisma.family.findFirstOrThrow({
      where: { parents: { some: { email: { startsWith: 'parent' } } }, invitations: { some: {} } },
      orderBy: { createdAt: 'desc' },
      include: { parents: true },
    });
    expect(family.parents).toHaveLength(2);
  });

  it('acceptations simultanées de deux liens : la limite de 4 parents tient', async () => {
    const f = await setupFamily(app);
    // 3 parents au total, puis 2 invitations en attente pour la dernière place.
    for (const name of ['P2', 'P3']) {
      const { token } = (await f.parent.post('/api/family/invitations').expect(201)).body;
      await (
        await newParent(name)
      ).agent
        .post(`/api/invitations/${token}/accept`)
        .send({ parentPin: '1357' })
        .expect(200);
    }
    const tokens = [
      (await f.parent.post('/api/family/invitations').expect(201)).body.token,
      (await f.parent.post('/api/family/invitations').expect(201)).body.token,
    ];
    const candidates = await Promise.all([newParent('X'), newParent('Y')]);
    const results = await Promise.all(
      candidates.map(({ agent }, i) =>
        agent.post(`/api/invitations/${tokens[i]}/accept`).send({ parentPin: '1357' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await f.parent.get('/api/family').expect(200)).body.parents).toHaveLength(4);
    expect((await f.parent.post('/api/family/invitations')).body.code).toBe('FAMILY_FULL');
  });
});
