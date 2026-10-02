import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import './setup-env';

/** Applique les migrations sur la base de test avant toute la suite. */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
