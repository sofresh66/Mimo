import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { assertLocalDatabase } from '@mimo/config';
import './setup-env';

/** Applique les migrations sur la base de test avant toute la suite. */
export default function globalSetup(): void {
  // Les migrations de test ne visent jamais une base distante.
  assertLocalDatabase('migrations de test', {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
