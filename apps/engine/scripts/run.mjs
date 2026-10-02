#!/usr/bin/env node
/**
 * Lance le moteur Python depuis le monorepo (pnpm dev / pnpm test).
 * Crée automatiquement l'environnement virtuel `.venv` et installe les dépendances
 * au premier lancement. Si Python est absent, le moteur est ignoré : l'API utilise
 * alors son repli local (le MVP fonctionne sans le moteur).
 *
 * Usage : node scripts/run.mjs [dev|test|lint]
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'dev';
const isWin = process.platform === 'win32';
const venv = join(root, '.venv');
const python = join(venv, isWin ? 'Scripts/python.exe' : 'bin/python');
const stamp = join(venv, '.installed');

function findSystemPython() {
  for (const candidate of isWin ? ['python', 'py'] : ['python3', 'python']) {
    const res = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (res.status === 0) return candidate;
  }
  return null;
}

function loadRootEnv() {
  const envFile = join(root, '..', '..', '.env');
  if (!existsSync(envFile)) return {};
  const env = {};
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function ensureVenv() {
  if (!existsSync(python)) {
    const system = findSystemPython();
    if (!system) {
      console.warn('[engine] Python introuvable : moteur ignoré (repli local côté API).');
      return false;
    }
    console.log('[engine] Création de l’environnement virtuel…');
    if (spawnSync(system, ['-m', 'venv', venv], { stdio: 'inherit' }).status !== 0) return false;
  }
  const requirements = join(root, 'requirements-dev.txt');
  const needsInstall =
    !existsSync(stamp) || statSync(requirements).mtimeMs > statSync(stamp).mtimeMs;
  if (needsInstall) {
    console.log('[engine] Installation des dépendances Python…');
    const res = spawnSync(python, ['-m', 'pip', 'install', '-q', '-r', requirements], {
      stdio: 'inherit',
      cwd: root,
    });
    if (res.status !== 0) return false;
    writeFileSync(stamp, new Date().toISOString());
  }
  return true;
}

if (!ensureVenv()) {
  process.exit(mode === 'dev' ? 0 : 1);
}

const env = { ...loadRootEnv(), ...process.env };
const commands = {
  dev: ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', env.ENGINE_PORT ?? '8000'],
  test: ['-m', 'pytest', '-q'],
  lint: ['-m', 'ruff', 'check', 'app', 'tests'],
};
const args = commands[mode];
if (!args) {
  console.error(`Mode inconnu : ${mode}`);
  process.exit(1);
}
const child = spawn(python, args, { stdio: 'inherit', cwd: root, env });
child.on('exit', (code) => process.exit(code ?? 0));
