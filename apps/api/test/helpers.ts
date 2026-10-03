import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { assertLocalDatabase } from '@mimo/config';
import { defaultCatalog } from '@mimo/game-data';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { syncContent } from '../src/content/content-sync';
import { configureApp } from '../src/main';

export const prisma = new PrismaClient();

/** Vide les données de jeu (le contenu des définitions est conservé). */
export async function resetDatabase(): Promise<void> {
  assertLocalDatabase('reset de la base de tests', {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Family", "AuditLog" RESTART IDENTITY CASCADE');
  // Toujours resynchronisé (upserts idempotents) : le contenu versionné peut avoir évolué.
  await syncContent(prisma, defaultCatalog);
}

export async function createApp(): Promise<NestExpressApplication> {
  await resetDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

export type Agent = ReturnType<typeof request.agent>;

export interface FamilyFixture {
  parent: Agent;
  child: Agent;
  childId: string;
  secondChildId: string;
}

let counter = 0;

/**
 * Crée un parent + une famille + deux enfants, et deux « appareils » :
 * `parent` (espace parent ouvert) et `child` (profil du premier enfant déverrouillé).
 */
export async function setupFamily(app: INestApplication): Promise<FamilyFixture> {
  counter += 1;
  const email = `parent${counter}-${Date.now()}@test.local`;
  const password = 'motdepasse-solide';
  const parent = request.agent(app.getHttpServer());
  await parent
    .post('/api/auth/register')
    .send({ email, password, displayName: 'Papa' })
    .expect(201);
  await parent.post('/api/family').send({ name: 'Famille Test', parentPin: '9876' }).expect(201);
  const a = await parent
    .post('/api/children')
    .send({ displayName: 'Alice', avatar: '🦊', color: '#ff8a5c', pin: '1234' })
    .expect(201);
  const b = await parent
    .post('/api/children')
    .send({ displayName: 'Bob', avatar: '🐼', color: '#3fb6e8', pin: '4321' })
    .expect(201);

  const child = request.agent(app.getHttpServer());
  await child.post('/api/auth/login').send({ email, password }).expect(200);
  await child.post('/api/auth/unlock/child').send({ childId: a.body.id, pin: '1234' }).expect(200);
  return { parent, child, childId: a.body.id as string, secondChildId: b.body.id as string };
}

/** Adopte un compagnon pour l'enfant connecté. */
export async function adopt(child: Agent, speciesId = 'dragon', name = 'Braise') {
  return child.post('/api/me/creature/adopt').send({ speciesId, name }).expect(201);
}

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** « Appareil » qui conserve ses cookies (HTTP + ouverture d'un socket authentifié). */
export class Device {
  private cookies = new Map<string, string>();
  constructor(private readonly app: INestApplication) {}

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

  /** Simule l'expiration d'un cookie par le navigateur (fin de son `Max-Age`). */
  forget(name: string): void {
    this.cookies.delete(name);
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  /** Recharge des cookies copiés (ex. rejeu de cookies volés après déconnexion). */
  load(header: string): void {
    for (const pair of header.split('; ')) {
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}
