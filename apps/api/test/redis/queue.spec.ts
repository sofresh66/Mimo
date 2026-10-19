import { isLocalRedisUrl } from '@mimo/config';
import { Queue } from 'bullmq';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig } from '../../src/config/env';
import { QUEUES, QueueService } from '../../src/jobs/queue.service';
import { RedisService } from '../../src/redis/redis.service';

const redisUrl = process.env.TEST_REDIS_URL;
if (!isLocalRedisUrl(redisUrl)) {
  throw new Error('TEST_REDIS_URL doit désigner un Redis local dédié aux tests, jamais Upstash.');
}

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 8_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= end) throw error;
      await wait(25);
    }
  }
}

describe('files BullMQ — Redis local', () => {
  let redis: RedisService;
  let service: QueueService;
  let exploration: Queue;
  let maintenance: Queue;

  beforeEach(async () => {
    redis = new RedisService(
      loadConfig({
        DATABASE_URL: 'postgresql://localhost/unused',
        JWT_ACCESS_SECRET: 'redis-tests-only-'.repeat(3),
        REDIS_URL: redisUrl,
      }),
    );
    service = new QueueService(redis);
    exploration = new Queue(QUEUES.exploration, { connection: redis.createClient() });
    maintenance = new Queue(QUEUES.maintenance, { connection: redis.createClient() });
    // Le garde ci-dessus est exécuté avant toute connexion ou suppression.
    await exploration.obliterate({ force: true });
    await maintenance.obliterate({ force: true });
  });

  afterEach(async () => {
    await service.beforeApplicationShutdown();
    await exploration.close();
    await maintenance.close();
    await redis.onApplicationShutdown();
  });

  it('réveille immédiatement un worker à vide, malgré une attente longue', async () => {
    const received: Record<string, unknown>[] = [];
    service.register(QUEUES.exploration, 'complete', async (data) => {
      received.push(data);
    });
    await service.schedule(QUEUES.exploration, 'complete', { id: 'warmup' }, { delayMs: 0 });
    await eventually(() => expect(received).toHaveLength(1));
    await wait(150);
    const started = Date.now();
    await service.schedule(QUEUES.exploration, 'complete', { id: 'new' }, { delayMs: 0 });
    await eventually(() => expect(received).toHaveLength(2), 2_000);
    expect(received[1]).toEqual({ id: 'new' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('respecte le délai et déduplique la complétion d’une exploration', async () => {
    const received: number[] = [];
    service.register(QUEUES.exploration, 'complete', async () => {
      received.push(Date.now());
    });
    const started = Date.now();
    const options = { delayMs: 300, jobId: 'exploration-idempotent' };
    await service.schedule(QUEUES.exploration, 'complete', {}, options);
    await service.schedule(QUEUES.exploration, 'complete', {}, options);
    await eventually(() => expect(received).toHaveLength(1));
    expect(received[0]! - started).toBeGreaterThanOrEqual(250);
    await wait(200);
    expect(received).toHaveLength(1);
  });

  it('reprend une tâche persistante après le redémarrage du worker', async () => {
    service.register(QUEUES.exploration, 'complete', async () => {});
    await service.schedule(QUEUES.exploration, 'complete', { id: 'restart' }, { delayMs: 800 });
    await service.beforeApplicationShutdown();
    service = new QueueService(redis);
    const received: Record<string, unknown>[] = [];
    service.register(QUEUES.exploration, 'complete', async (data) => {
      received.push(data);
    });
    await eventually(() => expect(received).toEqual([{ id: 'restart' }]));
  });

  it('relance une tâche après une erreur transitoire', async () => {
    let attempts = 0;
    service.register(QUEUES.exploration, 'complete', async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('échec de test attendu');
    });
    await service.schedule(QUEUES.exploration, 'complete', {}, { delayMs: 0, jobId: 'retry' });
    await eventually(async () => expect(await exploration.getCompletedCount()).toBe(1));
    expect(attempts).toBe(2);
  });

  it('continue les tâches récurrentes en bornant leur historique', async () => {
    let runs = 0;
    service.register(QUEUES.maintenance, 'sweep-explorations', async () => {
      runs += 1;
    });
    await service.every(QUEUES.maintenance, 'sweep-explorations', 25);
    await eventually(() => expect(runs).toBeGreaterThan(105), 15_000);
    await maintenance.removeJobScheduler('maintenance:sweep-explorations');
    await eventually(async () => expect(await maintenance.getActiveCount()).toBe(0));
    expect(await maintenance.getCompletedCount()).toBeLessThanOrEqual(100);
  });

  it('ferme rapidement un worker bloqué en attente', async () => {
    service.register(QUEUES.exploration, 'complete', async () => {});
    await service.schedule(QUEUES.exploration, 'complete', {}, { delayMs: 0 });
    await eventually(async () => expect(await exploration.getCompletedCount()).toBe(1));
    await wait(150);
    const started = Date.now();
    await service.beforeApplicationShutdown();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('ferme le cycle Nest complet avec un socket et un worker Redis actifs', async () => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', resolve(__dirname, 'fixtures/shutdown.fixture.ts')],
      {
        cwd: resolve(__dirname, '../..'),
        env: { ...process.env, TS_NODE_PROJECT: resolve(__dirname, '../../tsconfig.json') },
        timeout: 15_000,
        windowsHide: true,
      },
    );
    expect(stdout).toContain('SHUTDOWN_OK');
    expect(stderr).not.toContain('Connection is closed');
    expect(await exploration.getCompletedCount()).toBe(1);
  });
});
