import type { NestExpressApplication } from '@nestjs/platform-express';
import { totalXpForLevel } from '@mimo/game-data';
import { ExplorationsService } from '../../src/explorations/explorations.service';
import { adopt, createApp, prisma, setupFamily, type FamilyFixture } from '../helpers';

describe('Parcours de jeu', () => {
  let app: NestExpressApplication;
  let f: FamilyFixture;

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    f = await setupFamily(app);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createMission(body: Record<string, unknown> = {}) {
    const res = await f.parent
      .post('/api/missions')
      .send({
        title: 'Lire 15 minutes',
        category: 'READING',
        icon: '📖',
        xp: 50,
        coins: 10,
        recurrence: 'DAILY',
        ...body,
      })
      .expect(201);
    return res.body as { id: string };
  }

  it('adopte un compagnon (oeuf) une seule fois, avec la Créaturopédie mise à jour', async () => {
    const res = await adopt(f.child, 'fox', 'Luna');
    expect(res.body.stage).toBe('EGG');
    expect(res.body.level).toBe(1);
    expect(
      (await f.child.post('/api/me/creature/adopt').send({ speciesId: 'dragon', name: 'Autre' }))
        .status,
    ).toBe(409);
    const dex = await f.child.get('/api/me/dex').expect(200);
    expect(dex.body.discovered).toBe(1);
    const unknown = dex.body.entries.find(
      (e: { id: string }) => e.id === 'fox_sage' || e.id === 'fox_clever',
    );
    expect(unknown.name).toBeNull();
  });

  it('mission : demande enfant → validation parent → XP, pièces, éclosion et niveau', async () => {
    await adopt(f.child);
    const mission = await createMission();
    const listed = await f.child.get('/api/me/missions').expect(200);
    expect(listed.body.find((m: { id: string }) => m.id === mission.id).status).toBe('TODO');

    await f.child.post(`/api/me/missions/${mission.id}/done`).expect(200);
    const pending = await f.parent.get('/api/missions/pending').expect(200);
    expect(pending.body).toHaveLength(1);

    const coinsBefore = (await f.child.get('/api/me/home')).body.coins as number;
    const approved = await f.parent
      .post(`/api/missions/completions/${pending.body[0].id}/approve`)
      .expect(200);
    expect(approved.body.xp).toBe(50);
    expect(approved.body.parentName).toBe('Papa');
    expect(approved.body.outcome.leveledUp).toBe(true);
    expect(approved.body.outcome.levelAfter).toBe(2);
    expect(approved.body.outcome.hatched).toBe(true);
    expect(approved.body.outcome.evolution.stage).toBe('BABY');

    const home = await f.child.get('/api/me/home').expect(200);
    expect(home.body.creature.totalXp).toBe(50);
    expect(home.body.creature.stage).toBe('BABY');
    // +10 pièces de mission +10 pièces de niveau
    expect(home.body.coins).toBe(coinsBefore + 20);

    // Pas de double validation.
    expect(
      (await f.parent.post(`/api/missions/completions/${pending.body[0].id}/approve`)).status,
    ).toBe(409);
    const after = await f.child.get('/api/me/missions').expect(200);
    expect(after.body.find((m: { id: string }) => m.id === mission.id).status).toBe('APPROVED');
  });

  it('refus bienveillant : la mission redevient disponible', async () => {
    await adopt(f.child);
    const mission = await createMission();
    await f.child.post(`/api/me/missions/${mission.id}/done`).expect(200);
    const [pending] = (await f.parent.get('/api/missions/pending')).body;
    await f.parent.post(`/api/missions/completions/${pending.id}/decline`).expect(200);
    const list = await f.child.get('/api/me/missions').expect(200);
    expect(list.body.find((m: { id: string }) => m.id === mission.id).status).toBe('DECLINED');
    await f.child.post(`/api/me/missions/${mission.id}/done`).expect(200);
  });

  it('une mission assignée à un autre enfant est invisible et non validable', async () => {
    const mission = await createMission({ assignedChildId: f.secondChildId });
    const list = await f.child.get('/api/me/missions').expect(200);
    expect(list.body.find((m: { id: string }) => m.id === mission.id)).toBeUndefined();
    expect((await f.child.post(`/api/me/missions/${mission.id}/done`)).status).toBe(404);
    expect(
      (await f.parent.post(`/api/missions/${mission.id}/validate`).send({ childId: f.childId }))
        .status,
    ).toBe(400);
  });

  it('validation directe + récompense bonus à ouvrir (coffre)', async () => {
    await adopt(f.child);
    const mission = await createMission({ rewardItemId: 'chest_common', recurrence: 'WEEKLY' });
    const res = await f.parent
      .post(`/api/missions/${mission.id}/validate`)
      .send({ childId: f.childId })
      .expect(200);
    expect(res.body.rewardCreated).toBe(true);
    const rewards = await f.child.get('/api/me/rewards').expect(200);
    expect(rewards.body).toHaveLength(1);
    const opened = await f.child.post(`/api/me/rewards/${rewards.body[0].id}/open`).expect(200);
    expect(opened.body.loot.coins + opened.body.loot.items.length).toBeGreaterThan(0);
    expect((await f.child.post(`/api/me/rewards/${rewards.body[0].id}/open`)).status).toBe(409);
  });

  it('montée de niveau multiple et évolution adulte selon la catégorie dominante', async () => {
    await adopt(f.child, 'dragon', 'Braise');
    await prisma.creature.updateMany({
      where: { childId: f.childId },
      data: { totalXp: totalXpForLevel(12) - 10, level: 11, formId: 'dragon_young', xpLogic: 1200 },
    });
    const mission = await createMission({ category: 'LOGIC', xp: 40 });
    const res = await f.parent
      .post(`/api/missions/${mission.id}/validate`)
      .send({ childId: f.childId })
      .expect(200);
    expect(res.body.outcome.levelAfter).toBe(12);
    expect(res.body.outcome.evolution.toFormId).toBe('dragon_sage');
  });

  it('nourrir, cuisiner (recette découverte) et acheter', async () => {
    await adopt(f.child);
    await prisma.creature.updateMany({
      where: { childId: f.childId },
      data: { happiness: 40, energy: 50 },
    });
    const fed = await f.child.post('/api/me/feed').send({ itemId: 'apple' }).expect(200);
    expect(fed.body.creature.stats.energy).toBeGreaterThan(50);
    expect((await f.child.post('/api/me/feed').send({ itemId: 'ball' })).status).toBe(400);

    const fail = await f.child
      .post('/api/me/cook')
      .send({ ingredients: ['apple', 'milk'] })
      .expect(200);
    expect(fail.body.success).toBe(false);
    const cooked = await f.child
      .post('/api/me/cook')
      .send({ ingredients: ['milk', 'strawberry'] })
      .expect(200);
    expect(cooked.body.success).toBe(true);
    expect(cooked.body.newlyDiscovered).toBe(true);
    expect(cooked.body.result.id).toBe('magic_milkshake');

    const bought = await f.child
      .post('/api/me/shop/buy')
      .send({ itemId: 'apple', quantity: 2 })
      .expect(200);
    expect(bought.body.coins).toBe(40);
    expect(
      (await f.child.post('/api/me/shop/buy').send({ itemId: 'backpack', quantity: 1 })).status,
    ).toBe(400);
    expect(
      (await f.child.post('/api/me/shop/buy').send({ itemId: 'golden_crown', quantity: 1 })).status,
    ).toBe(404);
  });

  it('équipe un accessoire possédé uniquement', async () => {
    await adopt(f.child);
    expect(
      (await f.child.put('/api/me/equipment').send({ slot: 'HEAD', itemId: 'red_cap' })).status,
    ).toBe(400);
    await f.child.post('/api/me/shop/buy').send({ itemId: 'red_cap', quantity: 1 }).expect(200);
    const inv = await f.child
      .put('/api/me/equipment')
      .send({ slot: 'HEAD', itemId: 'red_cap' })
      .expect(200);
    expect(inv.body.equipment.HEAD.id).toBe('red_cap');
    expect(
      (await f.child.put('/api/me/equipment').send({ slot: 'FACE', itemId: 'red_cap' })).status,
    ).toBe(400);
  });

  it('exploration : départ, garde-fous, retour avec butin et XP', async () => {
    await adopt(f.child);
    // Un oeuf ne part pas en exploration.
    expect(
      (await f.child.post('/api/me/explorations').send({ zoneId: 'glowing_forest' })).body.code,
    ).toBe('EGG_CANNOT_EXPLORE');
    await prisma.creature.updateMany({
      where: { childId: f.childId },
      data: { formId: 'dragon_baby', level: 2, totalXp: 40 },
    });
    expect(
      (await f.child.post('/api/me/explorations').send({ zoneId: 'star_island' })).body.code,
    ).toBe('ZONE_LOCKED');

    const started = await f.child
      .post('/api/me/explorations')
      .send({ zoneId: 'glowing_forest' })
      .expect(201);
    expect(started.body.status).toBe('IN_PROGRESS');
    expect(
      (await f.child.post('/api/me/explorations').send({ zoneId: 'glowing_forest' })).status,
    ).toBe(409);
    expect((await f.child.post('/api/me/feed').send({ itemId: 'apple' })).body.code).toBe(
      'CREATURE_EXPLORING',
    );

    // Fin de l'exploration (la tâche différée est simulée en avançant l'échéance).
    await prisma.exploration.update({
      where: { id: started.body.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const explorations = app.get(ExplorationsService);
    expect(await explorations.complete(started.body.id)).toBe(true);
    expect(await explorations.complete(started.body.id)).toBe(false); // idempotent

    const current = await f.child.get('/api/me/explorations/current').expect(200);
    expect(current.body.current).toBeNull();
    expect(current.body.unseen.rewards).toBeTruthy();
    expect(current.body.unseen.xp).toBe(15);
    const home = await f.child.get('/api/me/home').expect(200);
    expect(home.body.creature.totalXp).toBe(55);
    await f.child.post(`/api/me/explorations/${started.body.id}/seen`).expect(200);
    expect((await f.child.get('/api/me/explorations/current')).body.unseen).toBeNull();
  });

  it('le balayage termine les explorations échues (filet de sécurité)', async () => {
    await adopt(f.child);
    await prisma.creature.updateMany({
      where: { childId: f.childId },
      data: { formId: 'dragon_baby', level: 2, totalXp: 40 },
    });
    const started = await f.child
      .post('/api/me/explorations')
      .send({ zoneId: 'glowing_forest' })
      .expect(201);
    await prisma.exploration.update({
      where: { id: started.body.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    expect(await app.get(ExplorationsService).sweep()).toBeGreaterThanOrEqual(1);
    const ex = await prisma.exploration.findUniqueOrThrow({ where: { id: started.body.id } });
    expect(ex.status).toBe('COMPLETED');
  });

  it('mini-jeu : défi généré côté serveur, correction serveur et plafond quotidien', async () => {
    await adopt(f.child);
    const start = await f.child
      .post('/api/me/games/math/start')
      .send({ difficulty: 'easy' })
      .expect(201);
    expect(start.body.challenge.questions).toHaveLength(10);
    expect(JSON.stringify(start.body)).not.toContain('answers');

    // Soumission trop rapide : jouée mais sans XP (anti-triche).
    const fast = await f.child
      .post(`/api/me/games/sessions/${start.body.sessionId}/submit`)
      .send({ submission: { kind: 'math', answers: Array(10).fill(1) } })
      .expect(200);
    expect(fast.body.xpAwarded).toBe(0);
    expect(
      (
        await f.child
          .post(`/api/me/games/sessions/${start.body.sessionId}/submit`)
          .send({ submission: { kind: 'math', answers: [] } })
      ).status,
    ).toBe(409);

    // Parties « normales » : on vieillit la session pour simuler une vraie durée de jeu.
    let rewarded = 0;
    for (let i = 0; i < 7; i += 1) {
      const s = await f.child.post('/api/me/games/memory/start').send({}).expect(201);
      await prisma.gameSession.update({
        where: { id: s.body.sessionId },
        data: { startedAt: new Date(Date.now() - 30_000) },
      });
      const cards: string[] = s.body.challenge.cards;
      const flips: number[] = [];
      const seen = new Set<number>();
      cards.forEach((symbol, i2) => {
        if (seen.has(i2)) return;
        const j = cards.findIndex((c, k) => k !== i2 && c === symbol && !seen.has(k));
        seen.add(i2);
        seen.add(j);
        flips.push(i2, j);
      });
      const res = await f.child
        .post(`/api/me/games/sessions/${s.body.sessionId}/submit`)
        .send({ submission: { kind: 'memory', flips } })
        .expect(200);
      expect(res.body.score).toBe(8);
      if (res.body.xpAwarded > 0) rewarded += 1;
    }
    expect(rewarded).toBe(5);
    const games = await f.child.get('/api/me/games').expect(200);
    expect(games.body.find((g: { key: string }) => g.key === 'memory').rewardedSessionsLeft).toBe(
      0,
    );
  });

  it('cadeau parent : XP dans la catégorie choisie, et un enfant ne peut pas ouvrir celui d’un autre', async () => {
    await adopt(f.child);
    const reward = await f.parent
      .post('/api/rewards')
      .send({ childId: f.childId, type: 'XP', category: 'SPORT', amount: 30, message: 'Bravo' })
      .expect(201);
    const other = await f.parent
      .post('/api/rewards')
      .send({ childId: f.secondChildId, type: 'COINS', amount: 30 })
      .expect(201);
    expect((await f.child.post(`/api/me/rewards/${other.body.id}/open`)).status).toBe(404);
    const opened = await f.child.post(`/api/me/rewards/${reward.body.id}/open`).expect(200);
    expect(opened.body.outcome.category).toBe('SPORT');
    const creature = await prisma.creature.findFirstOrThrow({ where: { childId: f.childId } });
    expect(creature.xpSport).toBe(30);
    expect(
      (
        await f.parent
          .post('/api/rewards')
          .send({ childId: f.childId, type: 'ITEM', itemId: 'golden_crown', amount: 1 })
      ).status,
    ).toBe(400);
  });

  it('village : points partagés, bâtiment débloqué et mission familiale', async () => {
    await adopt(f.child);
    const mission = await createMission({ recurrence: 'ONCE' });
    await f.parent
      .post(`/api/missions/${mission.id}/validate`)
      .send({ childId: f.childId })
      .expect(200);
    const village = await f.child.get('/api/me/village').expect(200);
    expect(village.body.points).toBe(10);
    expect(
      village.body.familyMissions.find(
        (m: { goalType: string }) => m.goalType === 'MISSIONS_COMPLETED',
      ).progress,
    ).toBe(1);
    await prisma.inventoryItem.create({
      data: {
        inventory: { connect: { childId: f.childId } },
        item: { connect: { id: 'stardust' } },
        quantity: 10,
      },
    });
    await f.child
      .post('/api/me/village/donate')
      .send({ itemId: 'stardust', quantity: 8 })
      .expect(200);
    const after = await f.child.get('/api/me/village').expect(200);
    expect(after.body.points).toBe(106);
    expect(after.body.buildings.find((b: { id: string }) => b.id === 'fountain').unlocked).toBe(
      true,
    );
    // Une mission unique validée disparaît de la liste de l'enfant.
    const list = await f.child.get('/api/me/missions').expect(200);
    expect(list.body.find((m: { id: string }) => m.id === mission.id)).toBeUndefined();
  });

  it('tableau de bord parent : vue par enfant, file de validation et historique', async () => {
    await adopt(f.child);
    const mission = await createMission();
    await f.child.post(`/api/me/missions/${mission.id}/done`).expect(200);
    const dash = await f.parent.get('/api/parent/dashboard').expect(200);
    expect(dash.body.children).toHaveLength(2);
    expect(dash.body.pending).toHaveLength(1);
    expect(dash.body.recent.some((e: { type: string }) => e.type === 'MISSION_REQUESTED')).toBe(
      true,
    );
    const detail = await f.parent.get(`/api/parent/children/${f.childId}`).expect(200);
    expect(detail.body.creatures).toHaveLength(1);
    const suggestions = await f.parent
      .get(`/api/parent/children/${f.childId}/suggestions`)
      .expect(200);
    expect(suggestions.body.length).toBeGreaterThan(0);
  });

  it('compagnon : actions prédéfinies seulement et contrôle parental', async () => {
    await adopt(f.child);
    const story = await f.child.post('/api/me/companion/story').expect(200);
    expect(story.body.text.length).toBeGreaterThan(10);
    expect((await f.child.post('/api/me/companion/chat')).status).toBe(400);
    await f.parent
      .patch('/api/family')
      .send({ companionAllowedActions: ['joke'] })
      .expect(200);
    expect((await f.child.post('/api/me/companion/story')).status).toBe(403);
    await f.child.post('/api/me/companion/joke').expect(200);
  });

  it('suppression définitive d’un profil enfant et de ses données', async () => {
    await adopt(f.child);
    await f.parent.delete(`/api/children/${f.childId}`).expect(200);
    expect(await prisma.creature.count({ where: { childId: f.childId } })).toBe(0);
    expect((await f.child.get('/api/me/home')).status).toBe(401);
  });
});
