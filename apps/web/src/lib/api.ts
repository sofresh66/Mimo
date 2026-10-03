import type { ApiErrorBody } from '@mimo/types';
import { getStoredLocale } from '@/i18n/core';

/** Erreur d'API : `code` est stable et traduit dans l'interface (jamais de détail technique affiché). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'SESSION_STALE', 'UNAUTHENTICATED']);
/**
 * Routes qui ne déclenchent jamais de renouvellement automatique : le renouvellement lui-même
 * (pas de boucle) et les routes qui établissent ou ferment une session. Toutes les autres, dont
 * `/auth/me` (restauration de la session à l'ouverture), sont retentées UNE fois après un refresh.
 */
const NO_REFRESH = new Set(['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout']);
let refreshing: Promise<boolean> | null = null;

function postRefresh(): Promise<boolean> {
  return fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((res) => res.ok)
    .catch(() => false);
}

/**
 * Renouvelle la session une seule fois même si plusieurs requêtes échouent en même temps.
 * Entre onglets (ou PWA + navigateur), un verrou sérialise les renouvellements : le jeton de
 * rafraîchissement tournant à chaque usage, deux appels simultanés avec le même jeton feraient
 * échouer le second, qui effacerait alors les cookies tout juste renouvelés par le premier.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= lockedRefresh().finally(() => {
    setTimeout(() => {
      refreshing = null;
    }, 0);
  });
  return refreshing;
}

async function lockedRefresh(): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? await locks.request('mimo-auth-refresh', postRefresh) : postRefresh();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: options.signal,
      headers: {
        accept: 'application/json',
        'accept-language': getStoredLocale(),
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK', 'network error');
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const code = body?.code ?? 'HTTP_ERROR';
  // Une seule tentative : la requête rejouée (retry = false) ne relance jamais de refresh.
  if (res.status === 401 && retry && REFRESHABLE.has(code) && !NO_REFRESH.has(path)) {
    if (await refreshSession()) return api<T>(path, options, false);
  }
  throw new ApiError(res.status, code, body?.message ?? res.statusText, body?.details);
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
