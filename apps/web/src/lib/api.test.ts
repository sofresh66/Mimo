import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

type Reply = { status: number; body?: unknown };

/** Faux serveur : file de réponses par chemin, et journal des appels. */
function mockServer(routes: Record<string, Reply[]>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string) => {
    calls.push(input);
    const reply = routes[input]?.shift() ?? { status: 500 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const unauthenticated = { status: 401, body: { code: 'UNAUTHENTICATED', message: 'x' } };
const revoked = { status: 401, body: { code: 'SESSION_REVOKED', message: 'x' } };
const me = { status: 200, body: { user: { id: 'u1' } } };

describe('api : restauration silencieuse de la session', () => {
  // Le refresh partagé est libéré au tick suivant : on l'attend entre deux tests.
  beforeEach(() => new Promise((resolve) => setTimeout(resolve, 0)));
  afterEach(() => vi.unstubAllGlobals());

  it('/auth/me sans jeton d’accès : refresh silencieux puis session restaurée', async () => {
    const calls = mockServer({
      '/api/auth/me': [unauthenticated, me],
      '/api/auth/refresh': [{ status: 200, body: { ok: true } }],
    });
    await expect(api('/auth/me')).resolves.toEqual(me.body);
    expect(calls).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
  });

  it('refresh expiré ou révoqué : une seule tentative, puis 401 (écran de connexion)', async () => {
    const calls = mockServer({
      '/api/auth/me': [unauthenticated, unauthenticated],
      '/api/auth/refresh': [revoked, revoked],
    });
    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(calls).toEqual(['/api/auth/me', '/api/auth/refresh']);
  });

  it('la requête rejouée ne relance jamais de refresh (pas de boucle)', async () => {
    const calls = mockServer({
      '/api/me/home': [unauthenticated, unauthenticated, unauthenticated],
      '/api/auth/refresh': [{ status: 200 }, { status: 200 }],
    });
    await expect(api('/me/home')).rejects.toBeInstanceOf(ApiError);
    expect(calls.filter((c) => c === '/api/auth/refresh')).toHaveLength(1);
    expect(calls.filter((c) => c === '/api/me/home')).toHaveLength(2);
  });

  it('session révoquée : aucun refresh, refus immédiat', async () => {
    const calls = mockServer({ '/api/me/home': [revoked] });
    await expect(api('/me/home')).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(calls).toEqual(['/api/me/home']);
  });

  it('login, inscription, refresh et logout ne déclenchent jamais de refresh', async () => {
    for (const path of ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']) {
      const calls = mockServer({ [`/api${path}`]: [unauthenticated] });
      await expect(api(path, { method: 'POST', body: {} })).rejects.toMatchObject({ status: 401 });
      expect(calls).toEqual([`/api${path}`]);
    }
  });

  it('plusieurs requêtes simultanées partagent un seul refresh', async () => {
    const calls = mockServer({
      '/api/me/home': [unauthenticated, me],
      '/api/me/missions': [unauthenticated, me],
      '/api/auth/refresh': [{ status: 200 }],
    });
    await Promise.all([api('/me/home'), api('/me/missions')]);
    expect(calls.filter((c) => c === '/api/auth/refresh')).toHaveLength(1);
  });
});
