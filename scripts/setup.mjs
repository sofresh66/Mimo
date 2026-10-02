#!/usr/bin/env node
/**
 * Prépare l'environnement local : crée `.env` à partir de `.env.example`
 * en générant des secrets aléatoires. Ne remplace jamais un `.env` existant.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

if (existsSync(envPath)) {
  console.log('.env existe déjà : rien à faire.');
} else {
  copyFileSync(examplePath, envPath);
  const content = readFileSync(envPath, 'utf8')
    .replace(
      /^JWT_ACCESS_SECRET=.*$/m,
      `JWT_ACCESS_SECRET=${randomBytes(48).toString('base64url')}`,
    )
    .replace(/^ENGINE_API_KEY=.*$/m, `ENGINE_API_KEY=${randomBytes(24).toString('base64url')}`);
  writeFileSync(envPath, content);
  console.log('.env créé avec des secrets aléatoires.');
}
