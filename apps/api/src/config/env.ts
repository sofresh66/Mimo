/**
 * Lecture et validation des variables d'environnement au démarrage.
 * L'application refuse de démarrer si la configuration est invalide.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  webOrigin: string;
  databaseUrl: string;
  redisUrl: string | null;
  jwtAccessSecret: string;
  accessTokenTtlMinutes: number;
  refreshTokenTtlDays: number;
  parentModeTtlMinutes: number;
  cookieSecure: boolean;
  explorationTimeScale: number;
  /** Fuseau horaire des familles (découpage des missions quotidiennes/hebdomadaires). */
  timezone: string;
  engineUrl: string | null;
  engineApiKey: string | null;
}

function num(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} doit être un nombre positif`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const errors: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) errors.push('DATABASE_URL est requis');

  const jwtAccessSecret = env.JWT_ACCESS_SECRET ?? '';
  if (jwtAccessSecret.length < 32)
    errors.push('JWT_ACCESS_SECRET doit contenir au moins 32 caractères');
  if (nodeEnv === 'production' && jwtAccessSecret.startsWith('change-me')) {
    errors.push('JWT_ACCESS_SECRET doit être personnalisé en production');
  }

  const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : nodeEnv === 'production';
  if (nodeEnv === 'production' && !cookieSecure)
    errors.push('COOKIE_SECURE doit être true en production');

  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n- ${errors.join('\n- ')}`);
  }

  return {
    nodeEnv,
    port: num('API_PORT', 4000, env),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
    databaseUrl,
    redisUrl: env.REDIS_URL ? env.REDIS_URL : null,
    jwtAccessSecret,
    accessTokenTtlMinutes: num('ACCESS_TOKEN_TTL_MINUTES', 15, env),
    refreshTokenTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30, env),
    parentModeTtlMinutes: num('PARENT_MODE_TTL_MINUTES', 30, env),
    cookieSecure,
    explorationTimeScale: num('EXPLORATION_TIME_SCALE', 1, env),
    timezone: env.APP_TIMEZONE ?? 'Europe/Paris',
    engineUrl: env.ENGINE_URL ? env.ENGINE_URL : null,
    engineApiKey: env.ENGINE_API_KEY ? env.ENGINE_API_KEY : null,
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
