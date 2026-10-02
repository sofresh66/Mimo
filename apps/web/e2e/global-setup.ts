import { REMOTE_DATABASE_REFUSAL, assertLocalDatabase, describeDatabaseHost } from '@mimo/config';
import type { FullConfig } from '@playwright/test';
import { parse } from 'dotenv';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

/** URL effectivement utilisée : variable d'environnement, sinon fichier .env de la racine. */
function effectiveEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envFile = resolve(root, '.env');
  return existsSync(envFile) ? parse(readFileSync(envFile))[name] : undefined;
}

/**
 * Avant toute écriture, vérifie que les E2E ne visent QUE PostgreSQL local :
 * 1. l'URL utilisée par le seed (DATABASE_URL / DIRECT_URL) ;
 * 2. la base réellement utilisée par le serveur testé (via /api/health, déjà démarré ici).
 * Puis réinitialise la famille de démonstration (seed, lui-même protégé).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const databaseUrl = effectiveEnv('DATABASE_URL');
  const directUrl = effectiveEnv('DIRECT_URL');
  assertLocalDatabase('E2E', { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl });
  console.log(`[E2E] Base utilisée : ${describeDatabaseHost(databaseUrl)} (locale ✔)`);

  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const health = (await fetch(`${baseURL}/api/health`)
    .then((res) => res.json())
    .catch(() => null)) as { database?: string; redis?: string } | null;
  if (health?.database !== 'local') {
    throw new Error(
      `${REMOTE_DATABASE_REFUSAL} (E2E : le serveur testé sur ${baseURL} n'utilise pas une base locale — database=${health?.database ?? 'inconnue'})`,
    );
  }
  if (health.redis === 'remote') {
    throw new Error(
      `${REMOTE_DATABASE_REFUSAL} (E2E : le serveur testé utilise un Redis distant — ses workers BullMQ consommeraient les tâches de production)`,
    );
  }
  console.log(
    `[E2E] Le serveur testé utilise une base locale ✔ (Redis : ${health.redis ?? 'none'})`,
  );

  execSync('pnpm db:seed', {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
  });
}
