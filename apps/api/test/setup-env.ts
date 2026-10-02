/**
 * Environnement des tests : base de données dédiée, pas de Redis (implémentations
 * en mémoire), pas de moteur Python (repli local), explorations accélérées.
 */
import { config, parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../../../.env');
config({ path: envFile, quiet: true });
const devDatabaseUrl = existsSync(envFile) ? parse(readFileSync(envFile)).DATABASE_URL : undefined;

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('TEST_DATABASE_URL est requis pour les tests (voir .env.example)');
if (testDb === devDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL doit être différent de DATABASE_URL : les tests vident la base.',
  );
}

process.env.DATABASE_URL = testDb;
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
process.env.ENGINE_URL = '';
process.env.EXPLORATION_TIME_SCALE = '0.001';
process.env.COOKIE_SECURE = 'false';
// Limite large pour les tests ; un test dédié vérifie la limite stricte.
process.env.AUTH_RATE_LIMIT = '1000';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-123456';
