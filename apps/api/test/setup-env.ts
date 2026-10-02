/**
 * Environnement des tests : base de données dédiée, pas de Redis (implémentations
 * en mémoire), pas de moteur Python (repli local), explorations accélérées.
 */
import { config, parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../../../.env');
config({ path: envFile, quiet: true });
const devEnv = existsSync(envFile) ? parse(readFileSync(envFile)) : {};

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('TEST_DATABASE_URL est requis pour les tests (voir .env.example)');
if (testDb === devEnv.DATABASE_URL || testDb === devEnv.DIRECT_URL) {
  throw new Error(
    'TEST_DATABASE_URL doit être différent de DATABASE_URL et DIRECT_URL : les tests vident la base.',
  );
}

process.env.DATABASE_URL = testDb;
// Prisma passe par DIRECT_URL pour les migrations (`prisma migrate deploy` du global-setup) :
// elle doit viser la même base de test, jamais la base de développement.
process.env.DIRECT_URL = testDb;
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.ENGINE_URL = '';
process.env.EXPLORATION_TIME_SCALE = '0.001';
process.env.COOKIE_SECURE = 'false';
// Limite large pour les tests ; un test dédié vérifie la limite stricte.
process.env.AUTH_RATE_LIMIT = '1000';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-123456';
