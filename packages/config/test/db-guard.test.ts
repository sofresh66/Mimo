import { describe, expect, it } from 'vitest';
import {
  REMOTE_DATABASE_REFUSAL,
  assertLocalDatabase,
  describeDatabaseHost,
  isLocalDatabaseUrl,
  isLocalRedisUrl,
} from '../src/db-guard';

const NEON =
  'postgresql://user:secret@ep-example-000000-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('isLocalDatabaseUrl', () => {
  it('accepte les hôtes locaux', () => {
    for (const url of [
      'postgresql://mimo:mimo@localhost:5432/mimo?schema=public',
      'postgres://mimo:mimo@127.0.0.1:5432/mimo_test',
      'postgresql://mimo:mimo@[::1]:5432/mimo',
      'postgresql://mimo:mimo@LOCALHOST/mimo',
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(true);
    }
  });

  it('refuse Neon et toute base distante', () => {
    for (const url of [
      NEON,
      'postgresql://u:p@db.example.com:5432/app',
      'postgresql://u:p@10.0.0.5:5432/app',
      'postgresql://u:p@postgres:5432/app',
      'postgresql://u:p@localhost.evil.com/app',
      'postgresql://u:p@127.0.0.1.nip.io/app',
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(false);
    }
  });

  it('tient compte du paramètre host= qui remplace l’hôte de l’URL', () => {
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost/app?host=db.example.com')).toBe(false);
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost/app?host=localhost,db.example.com')).toBe(
      false,
    );
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost/app?host=127.0.0.1')).toBe(true);
  });

  it('refuse les valeurs absentes, invalides ou d’un autre protocole', () => {
    for (const url of [undefined, null, '', 'pas une url', 'mysql://u:p@localhost/app']) {
      expect(isLocalDatabaseUrl(url)).toBe(false);
    }
  });
});

describe('isLocalRedisUrl', () => {
  it('accepte un Redis local et refuse un Redis distant (ex. Upstash)', () => {
    expect(isLocalRedisUrl('redis://localhost:6379')).toBe(true);
    expect(isLocalRedisUrl('redis://127.0.0.1:6379/0')).toBe(true);
    expect(isLocalRedisUrl('rediss://default:secret@example-redis-000.upstash.io:6379')).toBe(
      false,
    );
    expect(isLocalRedisUrl('redis://redis:6379')).toBe(false);
    expect(isLocalRedisUrl('http://localhost:6379')).toBe(false);
    expect(isLocalRedisUrl('')).toBe(false);
  });
});

describe('assertLocalDatabase', () => {
  it('laisse passer des URL locales', () => {
    expect(() =>
      assertLocalDatabase('test', {
        DATABASE_URL: 'postgresql://m:m@localhost:5432/mimo',
        DIRECT_URL: undefined,
      }),
    ).not.toThrow();
  });

  it('refuse dès qu’une seule URL est distante, sans afficher les identifiants', () => {
    let message = '';
    try {
      assertLocalDatabase('db:seed', {
        DATABASE_URL: 'postgresql://m:m@localhost:5432/mimo',
        DIRECT_URL: NEON,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(REMOTE_DATABASE_REFUSAL);
    expect(message).toContain('DIRECT_URL');
    expect(message).toContain('neon.tech');
    expect(message).not.toContain('secret');
  });

  it('refuse s’il n’y a aucune URL à vérifier', () => {
    expect(() => assertLocalDatabase('e2e', { DATABASE_URL: undefined })).toThrow(
      REMOTE_DATABASE_REFUSAL,
    );
  });

  it('describeDatabaseHost n’expose jamais les identifiants', () => {
    expect(describeDatabaseHost(NEON)).not.toContain('secret');
    expect(describeDatabaseHost('postgresql://m:m@localhost:5432/mimo_test')).toBe(
      'localhost:5432/mimo_test',
    );
  });
});
