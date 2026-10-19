/** Mesure des seules files Mimo, sans API, base PostgreSQL ou données de joueurs. */
const { resolve } = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { isLocalRedisUrl } = require('@mimo/config');

const redisUrl = process.env.TEST_REDIS_URL;
if (!isLocalRedisUrl(redisUrl)) {
  throw new Error('TEST_REDIS_URL doit désigner un Redis local de test, jamais Upstash.');
}
const seconds = Number(process.env.REDIS_MEASURE_SECONDS ?? 125);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 600) {
  throw new Error('REDIS_MEASURE_SECONDS doit être compris entre 5 et 600.');
}

require('ts-node').register({
  project: resolve(__dirname, '../tsconfig.json'),
  transpileOnly: true,
});
const Redis = require('ioredis');
const { QueueService, QUEUES } = require('../src/jobs/queue.service.ts');
const clients = [];
const commands = {};
let measuring = false;

function instrument(client) {
  clients.push(client);
  const send = client.sendCommand.bind(client);
  client.sendCommand = (command, ...args) => {
    if (measuring) commands[command.name] = (commands[command.name] ?? 0) + 1;
    return send(command, ...args);
  };
  const duplicate = client.duplicate.bind(client);
  client.duplicate = (...args) => instrument(duplicate(...args));
  return client;
}

async function measure() {
  const observer = new Redis(redisUrl, { maxRetriesPerRequest: 1, retryStrategy: null });
  let service;
  try {
    // Refuser une base déjà utilisée, sans jamais l'effacer.
    if ((await observer.dbsize()) !== 0) {
      throw new Error('La base Redis de mesure doit être vide et exclusivement dédiée à ce test.');
    }
    const redisVersion = /redis_version:([^\r]+)/.exec(await observer.info('server'))?.[1];
    service = new QueueService({
      enabled: true,
      createClient: (options = {}) =>
        instrument(new Redis(redisUrl, { maxRetriesPerRequest: null, ...options })),
    });
    let sweeps = 0;
    service.register(QUEUES.exploration, 'complete', async () => {});
    service.register(QUEUES.maintenance, 'sweep-explorations', async () => {
      sweeps += 1;
    });
    service.register(QUEUES.maintenance, 'cleanup', async () => {});
    await service.every(QUEUES.maintenance, 'sweep-explorations', 60_000);
    await service.every(QUEUES.maintenance, 'cleanup', 3_600_000);
    await wait(2_000);
    const initialSweeps = sweeps;
    const started = Date.now();
    measuring = true;
    await wait(seconds * 1_000);
    measuring = false;
    console.log(
      JSON.stringify(
        {
          redisVersion,
          elapsedMs: Date.now() - started,
          sweepsDuringMeasurement: sweeps - initialSweeps,
          clientRequests: commands,
          totalClientRequests: Object.values(commands).reduce((sum, count) => sum + count, 0),
          scope: 'BullMQ local uniquement ; hors trafic joueurs, hors compteur facturé Upstash',
        },
        null,
        2,
      ),
    );
  } finally {
    measuring = false;
    await service?.beforeApplicationShutdown();
    await Promise.all(clients.map((client) => client.quit().catch(() => undefined)));
    await observer.quit().catch(() => undefined);
  }
}

measure().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
