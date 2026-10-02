'use client';

import type { MeResponse } from '@mimo/types';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError, http } from './api';

export const ME_KEY = ['me'] as const;

/**
 * Change de contexte (connexion, profil, verrouillage) : supprime toutes les données mises
 * en cache pour ne jamais afficher celles d'un autre profil, puis relit la session.
 * `clear()` n'est pas utilisé car il détacherait les observateurs persistants
 * (ex. la connexion temps réel), qui ne verraient plus la nouvelle session.
 */
export async function resetSessionCache(client: QueryClient): Promise<void> {
  client.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
  const me = await http.get<MeResponse>('/auth/me').catch(() => null);
  client.setQueryData(ME_KEY, me);
}

/** Session courante (null = appareil non connecté). */
export function useSession() {
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await http.get<MeResponse>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
  return { me: query.data ?? null, loading: query.isPending, error: query.error };
}

/** Actions qui changent le mode de session (PIN enfant/parent, verrouillage, déconnexion). */
export function useSessionActions() {
  const client = useQueryClient();
  const reset = useCallback(() => resetSessionCache(client), [client]);

  return {
    unlockChild: async (childId: string, pin: string) => {
      await http.post('/auth/unlock/child', { childId, pin });
      await reset();
    },
    unlockParent: async (pin: string) => {
      await http.post('/auth/unlock/parent', { pin });
      await reset();
    },
    lock: async () => {
      await http.post('/auth/lock');
      await reset();
    },
    logout: async () => {
      await http.post('/auth/logout').catch(() => undefined);
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      client.setQueryData(ME_KEY, null);
    },
    reload: reset,
  };
}
