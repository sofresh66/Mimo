import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Réinitialise la famille de démonstration avant la suite E2E. */
export default function globalSetup(): void {
  execSync('pnpm db:seed', { cwd: resolve(__dirname, '../../..'), stdio: 'pipe' });
}
