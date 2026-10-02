'use client';

import type { ClientToServerEvents, ServerToClientEvents } from '@mimo/types';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { refreshSession } from './api';
import { useSession } from './session';

type MimoSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

interface Snapshot {
  socket: MimoSocket | null;
  status: RealtimeStatus;
}

/**
 * Gestion de la connexion Socket.IO hors de React (système externe), exposée via
 * useSyncExternalStore. Même origine + cookie HttpOnly ; reconnexion automatique, avec
 * renouvellement de session si le serveur a refusé un jeton expiré.
 */
class RealtimeManager {
  private snapshot: Snapshot = { socket: null, status: 'idle' };
  private readonly listeners = new Set<() => void>();
  private identity: string | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private set(next: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  connect(identity: string | null): void {
    if (identity === this.identity) return;
    this.disconnect();
    this.identity = identity;
    if (!identity) return;
    const socket: MimoSocket = io({
      path: '/socket.io',
      withCredentials: true,
      reconnectionDelayMax: 8_000,
    });
    socket.on('connect', () => this.set({ status: 'connected' }));
    socket.io.on('reconnect_attempt', () => this.set({ status: 'reconnecting' }));
    socket.on('disconnect', async (reason) => {
      this.set({ status: 'reconnecting' });
      if (reason === 'io server disconnect' && (await refreshSession())) socket.connect();
    });
    this.set({ socket, status: 'connecting' });
  }

  disconnect(): void {
    const { socket } = this.snapshot;
    this.identity = null;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    this.set({ socket: null, status: 'idle' });
  }
}

const manager = new RealtimeManager();
const SERVER_SNAPSHOT: Snapshot = { socket: null, status: 'idle' };
const RealtimeContext = createContext<Snapshot>(SERVER_SNAPSHOT);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const identity = me?.family ? `${me.user.id}:${me.mode}:${me.child?.id ?? ''}` : null;
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    manager.connect(identity);
  }, [identity]);
  useEffect(() => () => manager.disconnect(), []);

  return <RealtimeContext.Provider value={snapshot}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}

/** Abonnement à un événement temps réel (le gestionnaire le plus récent est toujours utilisé). */
export function useRealtimeEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): void {
  const { socket } = useContext(RealtimeContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args);
    // Typage Socket.IO générique : l'écouteur relaie les arguments de l'événement.
    (socket.on as (e: string, l: (...args: unknown[]) => void) => void)(event, listener);
    return () => {
      (socket.off as (e: string, l: (...args: unknown[]) => void) => void)(event, listener);
    };
  }, [socket, event]);
}
