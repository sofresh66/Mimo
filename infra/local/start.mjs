/**
 * Démarre un PostgreSQL embarqué (binaires officiels empaquetés via npm) pour développer
 * sans Docker. Les données sont conservées dans infra/local/.data.
 *
 * Utilisation : pnpm infra:local   (Ctrl+C pour arrêter)
 *
 * Redis n'est pas fourni ici : sans REDIS_URL, l'API bascule automatiquement sur ses
 * implémentations en mémoire (file de tâches, rate limiting). Voir docs/ARCHITECTURE.md.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '.data', 'postgres');
const port = Number(process.env.LOCAL_PG_PORT ?? 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'mimo',
  password: 'mimo',
  port,
  persistent: true,
  // UTF-8 obligatoire (emojis, accents) : sous Windows, initdb choisirait sinon WIN1252.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));
if (firstRun) {
  console.log('Initialisation du cluster PostgreSQL local…');
  await pg.initialise();
}
await pg.start();
if (firstRun) {
  await pg.createDatabase('mimo');
  await pg.createDatabase('mimo_test');
}
console.log(
  `PostgreSQL local prêt sur le port ${port} (bases : mimo, mimo_test). Ctrl+C pour arrêter.`,
);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nArrêt de PostgreSQL…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
