import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { LetterView, MailReceivedPayload } from '@mimo/types';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { createApp, Device, prisma } from '../helpers';

const PASSWORD = 'motdepasse-solide';
let seq = 0;

describe('Boîte aux lettres familiale', () => {
  let app: NestExpressApplication;
  let url: string;
  const sockets: Socket[] = [];

  // Famille A : Papa et Maman (parents), Haylie et Emylia (enfants), Mamie (adulte joueur).
  let papa: Device;
  let maman: Device;
  let haylie: Device;
  let emylia: Device;
  let mamie: Device;
  let papaId: string;
  let mamanId: string;
  let haylieId: string;
  let emyliaId: string;
  let mamieId: string;
  // Famille B, pour l'isolation.
  let otherParent: Device;
  let otherParentId: string;
  let otherChild: Device;
  let otherChildId: string;

  const letter = (to: { kind: 'profile' | 'parent'; id: string }, content: string, extra = {}) => {
    seq += 1;
    return {
      to,
      content,
      stationeryId: 'paper_mimo',
      requestId: `req-${Date.now()}-${seq}`,
      ...extra,
    };
  };
  const toProfile = (id: string) => ({ kind: 'profile' as const, id });
  const toParent = (id: string) => ({ kind: 'parent' as const, id });

  async function newFamily(name: string) {
    seq += 1;
    const email = `papa-letters${seq}-${Date.now()}@test.local`;
    const parent = new Device(app);
    await parent.post('/api/auth/register', { email, password: PASSWORD, displayName: 'Papa' });
    expect((await parent.post('/api/family', { name, parentPin: '9876' })).status).toBe(201);
    const me = await parent.get('/api/auth/me');
    return { parent, email, userId: me.body.user.id as string };
  }

  async function addChild(parent: Device, email: string, displayName: string, pin: string) {
    const created = await parent.post('/api/children', {
      displayName,
      avatar: '🦊',
      color: '#ff8a5c',
      pin,
    });
    expect(created.status).toBe(201);
    const device = new Device(app);
    await device.post('/api/auth/login', { email, password: PASSWORD });
    const unlocked = await device.post('/api/auth/unlock/child', { childId: created.body.id, pin });
    expect(unlocked.status).toBe(200);
    return { device, id: created.body.id as string };
  }

  async function invite(parent: Device, role: 'PARENT' | 'ADULT_PLAYER', displayName: string) {
    const created = await parent.post('/api/family/invitations', { role });
    expect(created.status).toBe(201);
    const device = new Device(app);
    seq += 1;
    await device.post('/api/auth/register', {
      email: `${displayName.toLowerCase()}${seq}-${Date.now()}@test.local`,
      password: PASSWORD,
      displayName,
    });
    const body =
      role === 'PARENT' ? { parentPin: '5555' } : { displayName, avatar: '🦉', color: '#a06cd5' };
    expect((await device.post(`/api/invitations/${created.body.token}/accept`, body)).status).toBe(
      200,
    );
    if (role === 'PARENT') {
      expect((await device.post('/api/auth/unlock/parent', { pin: '5555' })).status).toBe(200);
    }
    const me = await device.get('/api/auth/me');
    return { device, userId: me.body.user.id as string, profileId: me.body.child?.id as string };
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
    await new Promise((r) => setTimeout(r, 200));
    return socket;
  }

  const unread = async (device: Device) => (await device.get('/api/me/home')).body.mail;

  beforeAll(async () => {
    process.env.LETTER_RATE_LIMIT = '1000';
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    const a = await newFamily('Famille A');
    papa = a.parent;
    papaId = a.userId;
    const h = await addChild(papa, a.email, 'Haylie', '1234');
    haylie = h.device;
    haylieId = h.id;
    const e = await addChild(papa, a.email, 'Emylia', '4321');
    emylia = e.device;
    emyliaId = e.id;
    const m = await invite(papa, 'ADULT_PLAYER', 'Mamie');
    mamie = m.device;
    mamieId = m.profileId;
    const mm = await invite(papa, 'PARENT', 'Maman');
    maman = mm.device;
    mamanId = mm.userId;
    expect(
      (await haylie.post('/api/me/creature/adopt', { speciesId: 'dragon', name: 'Luna' })).status,
    ).toBe(201);

    const b = await newFamily('Famille B');
    otherParent = b.parent;
    otherParentId = b.userId;
    const oc = await addChild(otherParent, b.email, 'Zoé', '1111');
    otherChild = oc.device;
    otherChildId = oc.id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    await prisma.$disconnect();
  });

  it('propose uniquement les membres de la famille et le papier par défaut', async () => {
    const res = await haylie.get('/api/me/letters/compose');
    expect(res.status).toBe(200);
    const ids = res.body.recipients.map((r: { id: string }) => r.id);
    expect(new Set(ids)).toEqual(new Set([papaId, mamanId, emyliaId, mamieId]));
    expect(ids).not.toContain(haylieId);
    expect(ids).not.toContain(otherChildId);
    expect(ids).not.toContain(otherParentId);
    const owned = res.body.stationery.filter((s: { owned: boolean }) => s.owned);
    expect(owned.map((s: { item: { id: string } }) => s.item.id)).toEqual(['paper_mimo']);
    expect(res.body.stationery.length).toBeGreaterThanOrEqual(8);

    const parentView = await papa.get('/api/parent/letters/compose');
    const parentIds = parentView.body.recipients.map((r: { id: string }) => r.id);
    expect(new Set(parentIds)).toEqual(new Set([mamanId, haylieId, emyliaId, mamieId]));
  });

  it('CHILD → CHILD : la lettre arrive, avec la créature de l’expéditeur', async () => {
    const before = await unread(emylia);
    const sent = await haylie.post('/api/me/letters', letter(toProfile(emyliaId), 'Coucou 💌'));
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      from: { kind: 'profile', id: haylieId, name: 'Haylie' },
      to: { kind: 'profile', id: emyliaId, name: 'Emylia' },
      creatureName: 'Luna',
      content: 'Coucou 💌',
      stationery: { id: 'paper_mimo' },
      readAt: null,
      cherishedAt: null,
      mine: true,
    });
    const after = await unread(emylia);
    expect(after.unread).toBe(before.unread + 1);
    expect(after.latestFrom).toEqual({ name: 'Haylie', creatureName: 'Luna' });
    const received = await emylia.get('/api/me/letters?box=received');
    expect(received.body.letters[0]).toMatchObject({ id: sent.body.id, mine: false });
    const outbox = await haylie.get('/api/me/letters?box=sent');
    expect(outbox.body.letters[0].id).toBe(sent.body.id);
  });

  it('CHILD → ADULT, CHILD → PARENT, ADULT → CHILD, PARENT → CHILD, ADULT ↔ ADULT', async () => {
    const cases: Array<[Device, string, { kind: 'profile' | 'parent'; id: string }]> = [
      [haylie, '/api/me/letters', toProfile(mamieId)],
      [haylie, '/api/me/letters', toParent(papaId)],
      [mamie, '/api/me/letters', toProfile(haylieId)],
      [papa, '/api/parent/letters', toProfile(haylieId)],
      [mamie, '/api/me/letters', toParent(papaId)],
      [papa, '/api/parent/letters', toProfile(mamieId)],
      [papa, '/api/parent/letters', toParent(mamanId)],
    ];
    for (const [device, route, to] of cases) {
      const res = await device.post(route, letter(to, 'Bisous'));
      expect(res.status).toBe(201);
      expect(res.body.to).toMatchObject(to);
    }
    const papaBox = await papa.get('/api/parent/letters?box=received');
    expect(papaBox.body.letters.map((l: LetterView) => l.from.name)).toEqual(['Mamie', 'Haylie']);
    expect((await papa.get('/api/parent/letters/summary')).body.unread).toBe(2);
  });

  it('refuse toute communication avec une autre famille, sans rien révéler', async () => {
    for (const to of [toProfile(otherChildId), toParent(otherParentId)]) {
      const res = await haylie.post('/api/me/letters', letter(to, 'Salut'));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect(
      (await papa.post('/api/parent/letters', letter(toProfile(otherChildId), 'Salut'))).status,
    ).toBe(404);
    // Lettre de la famille B : invisible pour la famille A.
    const foreign = await otherChild.post(
      '/api/me/letters',
      letter(toParent(otherParentId), 'Famille B'),
    );
    expect(foreign.status).toBe(201);
    for (const path of ['', '/read']) {
      const method = path ? 'post' : 'get';
      expect((await haylie.call(method, `/api/me/letters/${foreign.body.id}${path}`)).status).toBe(
        404,
      );
    }
    expect((await papa.get(`/api/parent/letters/${foreign.body.id}`)).status).toBe(404);
    expect((await papa.get(`/api/parent/children/${otherChildId}/letters`)).status).toBe(404);
    expect((await otherParent.get(`/api/parent/children/${haylieId}/letters`)).status).toBe(404);
  });

  it('valide le destinataire et le texte côté serveur', async () => {
    const send = (body: object) => haylie.post('/api/me/letters', body);
    expect((await send(letter(toProfile('inconnu'), 'Salut'))).status).toBe(404);
    expect((await send(letter(toParent('cnotarealuser0000000000000'), 'Salut'))).status).toBe(404);
    // Un adulte joueur ne se contacte que par son profil, jamais comme « parent ».
    const mamieUser = (await mamie.get('/api/auth/me')).body.user.id as string;
    expect((await send(letter(toParent(mamieUser), 'Salut'))).status).toBe(404);
    expect((await send(letter(toProfile(haylieId), 'Moi'))).body.code).toBe('LETTER_TO_SELF');
    const { to: _to, ...noRecipient } = letter(toProfile(emyliaId), 'Salut');
    expect((await send(noRecipient)).status).toBe(400);
    expect((await send(letter(toProfile(emyliaId), ''))).body.code).toBe('LETTER_EMPTY');
    expect((await send(letter(toProfile(emyliaId), '   \n  \t '))).body.code).toBe('LETTER_EMPTY');
    expect((await send(letter(toProfile(emyliaId), 'a'.repeat(501)))).body.code).toBe(
      'LETTER_TOO_LONG',
    );
    expect((await send(letter(toProfile(emyliaId), 'a'.repeat(5000)))).status).toBe(400);
    expect((await send(letter(toProfile(emyliaId), 'oups \uD83D'))).body.code).toBe(
      'LETTER_INVALID',
    );
    const emojis = await send(letter(toProfile(emyliaId), `  ${'👨‍👩‍👧‍👦'.repeat(300)}  `));
    expect(emojis.status).toBe(201);
    expect(emojis.body.content).toBe('👨‍👩‍👧‍👦'.repeat(300));
    // Papiers : verrouillé, ou qui n'est pas un papier.
    const locked = await send(
      letter(toProfile(emyliaId), 'Salut', { stationeryId: 'paper_night' }),
    );
    expect(locked.body.code).toBe('STATIONERY_LOCKED');
    const notPaper = await send(letter(toProfile(emyliaId), 'Salut', { stationeryId: 'bg_room' }));
    expect(notPaper.body.code).toBe('NOT_STATIONERY');
    // Un papier débloqué (inventaire, via le système d'objets existant) devient utilisable.
    const inventory = await prisma.inventory.upsert({
      where: { childId: haylieId },
      create: { childId: haylieId },
      update: {},
    });
    await prisma.inventoryItem.create({
      data: { inventoryId: inventory.id, itemId: 'paper_night', quantity: 1 },
    });
    const night = await send(
      letter(toProfile(emyliaId), 'Bonne nuit', { stationeryId: 'paper_night' }),
    );
    expect(night.status).toBe(201);
    expect(night.body.stationery).toMatchObject({ id: 'paper_night', name: 'Nuit étoilée' });
  });

  it('un nouvel essai avec le même requestId ne crée pas de doublon', async () => {
    const body = letter(toProfile(mamieId), 'Une seule fois');
    const [first, second] = await Promise.all([
      haylie.post('/api/me/letters', body),
      haylie.post('/api/me/letters', body),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 201]);
    expect(first.body.id).toBe(second.body.id);
    expect(await prisma.letter.count({ where: { requestId: body.requestId } })).toBe(1);
    // Le même identifiant réutilisé par un autre membre est refusé.
    expect((await emylia.post('/api/me/letters', body)).status).toBe(409);
  });

  it('lecture, lu et souvenir : réservés aux bonnes personnes', async () => {
    const sent = await haylie.post('/api/me/letters', letter(toProfile(mamieId), 'Pour Mamie'));
    const id = sent.body.id as string;
    // Un autre profil de la famille ne peut ni lire, ni marquer, ni garder la lettre.
    expect((await emylia.get(`/api/me/letters/${id}`)).status).toBe(404);
    expect((await emylia.post(`/api/me/letters/${id}/read`)).status).toBe(404);
    expect((await emylia.put(`/api/me/letters/${id}/cherish`)).status).toBe(404);
    expect((await maman.get(`/api/parent/letters/${id}`)).status).toBe(404);
    // L'expéditeur relit sa lettre sans la marquer lue, et ne peut pas la « garder ».
    expect((await haylie.post(`/api/me/letters/${id}/read`)).body.readAt).toBeNull();
    expect((await haylie.put(`/api/me/letters/${id}/cherish`)).status).toBe(404);

    // Non lu → lu (idempotent).
    const before = (await unread(mamie)).unread;
    const read = await mamie.post(`/api/me/letters/${id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.readAt).toEqual(expect.any(String));
    expect((await unread(mamie)).unread).toBe(before - 1);
    const again = await mamie.post(`/api/me/letters/${id}/read`);
    expect(again.body.readAt).toBe(read.body.readAt);

    // Garder précieusement → onglet Souvenirs, puis retirer.
    const kept = await mamie.put(`/api/me/letters/${id}/cherish`);
    expect(kept.body.cherishedAt).toEqual(expect.any(String));
    const souvenirs = await mamie.get('/api/me/letters?box=cherished');
    expect(souvenirs.body.letters.map((l: LetterView) => l.id)).toEqual([id]);
    await mamie.del(`/api/me/letters/${id}/cherish`);
    expect((await mamie.get('/api/me/letters?box=cherished')).body.letters).toEqual([]);
  });

  it('pagine par 20 sans doublon ni trou', async () => {
    const family = await prisma.playerProfile.findUniqueOrThrow({ where: { id: emyliaId } });
    const base = Date.now() - 3_600_000;
    await prisma.letter.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        familyId: family.familyId,
        senderProfileId: mamieId,
        recipientProfileId: emyliaId,
        senderName: 'Mamie',
        senderAvatar: '🦉',
        recipientName: 'Emylia',
        content: `Lettre ${i}`,
        stationeryId: 'paper_mimo',
        // Plusieurs lettres à la même date : le curseur départage par identifiant.
        createdAt: new Date(base + Math.floor(i / 3) * 1000),
      })),
    });
    const total = await prisma.letter.count({ where: { recipientProfileId: emyliaId } });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : '';
      const res = await emylia.get(`/api/me/letters?box=received${query}`);
      expect(res.status).toBe(200);
      expect(res.body.letters.length).toBeLessThanOrEqual(20);
      seen.push(...res.body.letters.map((l: LetterView) => l.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(Math.ceil(total / 20));
    expect(new Set(seen).size).toBe(total);
    expect((await emylia.get('/api/me/letters?cursor=n0p3')).status).toBe(400);
    expect((await emylia.get('/api/me/letters?box=all')).status).toBe(400);
  });

  it('supervision parentale : courriers des enfants en lecture seule, adultes privés', async () => {
    const fromMamie = await mamie.post('/api/me/letters', letter(toProfile(haylieId), 'De Mamie'));
    const toMamie = await haylie.post('/api/me/letters', letter(toProfile(mamieId), 'À Mamie'));
    const adults = await mamie.post('/api/me/letters', letter(toParent(papaId), 'Entre adultes'));

    for (const parent of [papa, maman]) {
      const received = await parent.get(`/api/parent/children/${haylieId}/letters?box=received`);
      expect(received.status).toBe(200);
      expect(received.body.letters.map((l: LetterView) => l.id)).toContain(fromMamie.body.id);
      const sent = await parent.get(`/api/parent/children/${haylieId}/letters?box=sent`);
      expect(sent.body.letters.map((l: LetterView) => l.id)).toContain(toMamie.body.id);
      const all = [...received.body.letters, ...sent.body.letters].map((l: LetterView) => l.id);
      expect(all).not.toContain(adults.body.id);
      // Un profil adulte n'est jamais supervisable.
      expect((await parent.get(`/api/parent/children/${mamieId}/letters`)).status).toBe(404);
    }
    // La consultation parentale ne marque jamais la lettre comme lue pour l'enfant.
    const row = await prisma.letter.findUniqueOrThrow({ where: { id: fromMamie.body.id } });
    expect(row.readAt).toBeNull();
    // ADULT ↔ ADULT : Maman (autre parent) ne peut pas lire la lettre Mamie → Papa.
    expect((await maman.get(`/api/parent/letters/${adults.body.id}`)).status).toBe(404);
    const mamanBox = await maman.get('/api/parent/letters?box=received');
    expect(mamanBox.body.letters.map((l: LetterView) => l.id)).not.toContain(adults.body.id);
    expect((await papa.get(`/api/parent/letters/${adults.body.id}`)).body.content).toBe(
      'Entre adultes',
    );
  });

  it('les routes parent exigent l’espace parent déverrouillé (CHILD, PLAYER, DEVICE refusés)', async () => {
    const device = new Device(app);
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: papaId } })).email;
    await device.post('/api/auth/login', { email, password: PASSWORD });
    expect((await device.get('/api/auth/me')).body.mode).toBe('DEVICE');
    const routes: Array<['get' | 'post', string, object?]> = [
      ['get', `/api/parent/children/${haylieId}/letters`],
      ['get', `/api/parent/children/${haylieId}/letters?box=sent`],
      ['get', '/api/parent/letters'],
      ['get', '/api/parent/letters/summary'],
      ['post', '/api/parent/letters', letter(toProfile(haylieId), 'Tentative')],
    ];
    for (const who of [haylie, mamie, device]) {
      for (const [method, path, body] of routes) {
        expect((await who.call(method, path, body)).status).toBe(403);
      }
    }
    // Et un parent ne lit pas le courrier d'un enfant par les routes joueur.
    expect((await papa.get('/api/me/letters')).status).toBe(403);
  });

  it('temps réel : notification légère après enregistrement, au seul destinataire', async () => {
    const emyliaSocket = await connect(emylia);
    const papaSocket = await connect(papa);
    const mamanSocket = await connect(maman);
    const otherSocket = await connect(otherChild);
    const got = { emylia: [] as MailReceivedPayload[], papa: 0, maman: 0, other: 0 };
    emyliaSocket.on('mail:received', (p: MailReceivedPayload) => got.emylia.push(p));
    papaSocket.on('mail:received', () => (got.papa += 1));
    mamanSocket.on('mail:received', () => (got.maman += 1));
    otherSocket.on('mail:received', () => (got.other += 1));

    const sent = await haylie.post('/api/me/letters', letter(toProfile(emyliaId), 'Secret 🤫'));
    await new Promise((r) => setTimeout(r, 300));
    expect(got.emylia).toEqual([
      { letterId: sent.body.id, senderName: 'Haylie', creatureName: 'Luna' },
    ]);
    // L'événement est émis après l'écriture : la lettre est déjà lisible.
    const fetched = await emylia.get(`/api/me/letters/${sent.body.id}`);
    expect(fetched.body.content).toBe('Secret 🤫');
    expect(got).toMatchObject({ papa: 0, maman: 0, other: 0 });

    await mamie.post('/api/me/letters', letter(toParent(papaId), 'Pour Papa'));
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toMatchObject({ papa: 1, maman: 0, other: 0 });
  });

  it('destinataire hors ligne : la lettre l’attend à la prochaine connexion', async () => {
    const before = (await unread(otherChild)).unread;
    const sent = await otherParent.post(
      '/api/parent/letters',
      letter(toProfile(otherChildId), 'Bonne journée'),
    );
    expect(sent.status).toBe(201);
    // Nouvelle session (reconnexion) : compteur et lettre fournis par le serveur.
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: otherParentId } })).email;
    const later = new Device(app);
    await later.post('/api/auth/login', { email, password: PASSWORD });
    await later.post('/api/auth/unlock/child', { childId: otherChildId, pin: '1111' });
    expect((await unread(later)).unread).toBe(before + 1);
    const box = await later.get('/api/me/letters');
    expect(box.body.letters[0]).toMatchObject({ id: sent.body.id, content: 'Bonne journée' });
  });

  it('le texte des lettres n’apparaît jamais dans les journaux', async () => {
    const secret = 'Mot-de-passe-du-coffre-a-bisous';
    const spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level),
    );
    try {
      await haylie.post('/api/me/letters', letter(toProfile(emyliaId), secret));
      await haylie.post('/api/me/letters', letter(toProfile(otherChildId), secret));
      await haylie.post(
        '/api/me/letters',
        letter(toProfile(emyliaId), `${secret}${'a'.repeat(600)}`),
      );
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      expect(logged).not.toContain(secret);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('suppression d’un profil enfant : les lettres restent des souvenirs pour les autres', async () => {
    const sent = await emylia.post('/api/me/letters', letter(toProfile(mamieId), 'Souvenir'));
    await mamie.put(`/api/me/letters/${sent.body.id}/cherish`);
    expect((await papa.del(`/api/children/${emyliaId}`)).status).toBe(200);
    const kept = await mamie.get(`/api/me/letters/${sent.body.id}`);
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({
      from: { kind: 'profile', id: null, name: 'Emylia' },
      content: 'Souvenir',
      cherishedAt: expect.any(String),
    });
    // Les lettres reçues par le profil supprimé restent dans « Envoyées » de l'expéditeur.
    const outbox = await haylie.get('/api/me/letters?box=sent');
    const toEmylia = outbox.body.letters.find((l: LetterView) => l.to.name === 'Emylia');
    expect(toEmylia.to).toMatchObject({ id: null, name: 'Emylia', avatar: '💌' });
  });

  it('limite simple d’envoi par minute', async () => {
    process.env.LETTER_RATE_LIMIT = '2';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        statuses.push(
          (await mamie.post('/api/me/letters', letter(toProfile(haylieId), 'Hop'))).status,
        );
      }
      expect(statuses).toContain(429);
    } finally {
      process.env.LETTER_RATE_LIMIT = '1000';
    }
  });
});
