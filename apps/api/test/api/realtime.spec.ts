import type { NestExpressApplication } from '@nestjs/platform-express';
import type { MissionValidatedPayload } from '@mimo/types';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createApp, prisma } from '../helpers';

/** Client minimal qui conserve les cookies, pour ouvrir un socket authentifié. */
class CookieClient {
  private cookies = new Map<string, string>();
  constructor(
    private readonly server: NestExpressApplication['getHttpServer'] extends () => infer S
      ? S
      : never,
  ) {}

  async post(url: string, body: object) {
    const res = await request(this.server).post(url).set('Cookie', this.header()).send(body);
    for (const c of ([] as string[]).concat(res.headers['set-cookie'] ?? [])) {
      const [pair] = c.split(';');
      const [name, value] = (pair ?? '').split('=');
      if (name && value !== undefined) this.cookies.set(name, value);
    }
    return res;
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

describe('Temps réel (Socket.IO)', () => {
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

  it("l'enfant reçoit immédiatement la validation d'une mission par le parent", async () => {
    const server = app.getHttpServer();
    const parent = new CookieClient(server);
    await parent.post('/api/auth/register', {
      email: 'rt@test.local',
      password: 'motdepasse-ok',
      displayName: 'Papa',
    });
    await parent.post('/api/family', { name: 'RT', parentPin: '1111' });
    const created = await parent.post('/api/children', {
      displayName: 'Léa',
      avatar: '🦊',
      color: '#ff8a5c',
      pin: '2222',
    });
    const mission = await parent.post('/api/missions', {
      title: 'Lecture 15 minutes',
      category: 'READING',
      icon: '📖',
      xp: 20,
      coins: 5,
      recurrence: 'DAILY',
    });

    const child = new CookieClient(server);
    await child.post('/api/auth/login', { email: 'rt@test.local', password: 'motdepasse-ok' });
    await child.post('/api/auth/unlock/child', { childId: created.body.id, pin: '2222' });
    await child.post('/api/me/creature/adopt', { speciesId: 'robot', name: 'Bip' });

    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: child.header() },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    // Laisse le serveur placer le socket dans ses salles.
    await new Promise((r) => setTimeout(r, 150));

    const received = new Promise<MissionValidatedPayload>((resolve) =>
      socket.on('mission:validated', resolve),
    );
    await parent.post(`/api/missions/${mission.body.id}/validate`, { childId: created.body.id });
    const payload = await received;
    expect(payload.missionTitle).toBe('Lecture 15 minutes');
    expect(payload.parentName).toBe('Papa');
    expect(payload.xp).toBe(20);
  });

  it('ferme la socket parent quand l’espace parent est verrouillé', async () => {
    const server = app.getHttpServer();
    const parent = new CookieClient(server);
    await parent.post('/api/auth/register', {
      email: 'lock@test.local',
      password: 'motdepasse-ok',
      displayName: 'Papa',
    });
    await parent.post('/api/family', { name: 'Lock', parentPin: '1111' });
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: parent.header() },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    await new Promise((r) => setTimeout(r, 150));
    const closed = new Promise<string>((resolve) =>
      socket.on('disconnect', (reason) => resolve(reason)),
    );
    await parent.post('/api/auth/lock', {});
    expect(await closed).toBe('io server disconnect');
  });

  it('refuse un socket sans session valide', async () => {
    const socket = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    const disconnected = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.on('disconnect', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    expect(disconnected).toBe(true);
  });
});
