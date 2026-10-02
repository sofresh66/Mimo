import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { defaultCatalog } from '@mimo/game-data';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { syncContent } from '../src/content/content-sync';
import { configureApp } from '../src/main';

export const prisma = new PrismaClient();

/** Vide les données de jeu (le contenu des définitions est conservé). */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "User", "Family", "AuditLog" RESTART IDENTITY CASCADE');
  if ((await prisma.creatureSpecies.count()) === 0) await syncContent(prisma, defaultCatalog);
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
