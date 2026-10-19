import 'reflect-metadata';
import { isLocalRedisUrl } from '@mimo/config';
import { Test } from '@nestjs/testing';
import { WebSocketGateway } from '@nestjs/websockets';
import type { AddressInfo } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { APP_CONFIG, loadConfig } from '../../../src/config/env';
import { QUEUES, QueueService } from '../../../src/jobs/queue.service';
import { RealtimeIoAdapter } from '../../../src/realtime/io-adapter';
import { RedisService } from '../../../src/redis/redis.service';

// Processus isolé : une régression provoque une rejection non gérée et un code de sortie non nul.
@WebSocketGateway({ transports: ['websocket'] })
class ShutdownGateway {}

async function main(): Promise<void> {
  if (!isLocalRedisUrl(process.env.TEST_REDIS_URL)) throw new Error('Redis local de test requis');
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost/unused',
    JWT_ACCESS_SECRET: 'shutdown-test-only-'.repeat(3),
    REDIS_URL: process.env.TEST_REDIS_URL,
  });
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: APP_CONFIG, useValue: config },
      RedisService,
      QueueService,
      ShutdownGateway,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config, app.get(RedisService)));
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  const queue = app.get(QueueService);
  let finish!: () => void;
  const processed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  queue.register(QUEUES.exploration, 'complete', async () => {
    finish();
  });
  await queue.schedule(
    QUEUES.exploration,
    'complete',
    {},
    {
      delayMs: 0,
      jobId: `shutdown-${process.pid}`,
    },
  );
  await processed;
  await app.close();
  socket.disconnect();
  await wait(100);
  process.stdout.write('SHUTDOWN_OK\n');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
