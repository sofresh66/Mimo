import { REMOTE_DATABASE_REFUSAL } from '@mimo/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resetDatabase } from '../helpers';

/** Hôte distant fictif : le garde-fou doit refuser AVANT toute connexion. */
const REMOTE = 'postgresql://user:secret@db.remote-example.invalid:5432/app';
const apiRoot = resolve(__dirname, '../..');

describe('garde-fous anti-production', () => {
  it('db:seed refuse une base distante avant toute connexion', () => {
    const res = spawnSync(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', 'prisma/seed.ts'],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: REMOTE, DIRECT_URL: REMOTE, NODE_ENV: 'development' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(REMOTE_DATABASE_REFUSAL);
    expect(res.stderr).not.toContain('secret');
  });

  it('db:seed refuse aussi si seule DIRECT_URL est distante', () => {
    const res = spawnSync(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', 'prisma/seed.ts'],
      {
        cwd: apiRoot,
        env: { ...process.env, DIRECT_URL: REMOTE, NODE_ENV: 'development' },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('DIRECT_URL');
  });

  it('le script CLI devant db:migrate / db:reset refuse une base distante', () => {
    const res = spawnSync(process.execPath, ['scripts/assert-local-db.cjs', 'db:reset'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: REMOTE },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(REMOTE_DATABASE_REFUSAL);
  });

  it('le reset de la base de tests refuse une base distante (sans rien exécuter)', async () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = REMOTE;
    try {
      await expect(resetDatabase()).rejects.toThrow(REMOTE_DATABASE_REFUSAL);
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
