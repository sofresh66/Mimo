import { Injectable } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents } from '@mimo/types';
import type { Server } from 'socket.io';

type MimoServer = Server<ClientToServerEvents, ServerToClientEvents>;
type EventName = keyof ServerToClientEvents;
type EventArgs<E extends EventName> = Parameters<ServerToClientEvents[E]>;

export const rooms = {
  child: (childId: string) => `child:${childId}`,
  parents: (familyId: string) => `parents:${familyId}`,
  /** Un parent précis, uniquement avec l'espace parent déverrouillé (courrier personnel). */
  parentUser: (userId: string) => `parent-user:${userId}`,
  family: (familyId: string) => `family:${familyId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  user: (userId: string) => `user:${userId}`,
};

/** Émission d'événements temps réel vers les salles Socket.IO (enfant, parents, famille). */
@Injectable()
export class RealtimeService {
  private server: MimoServer | null = null;

  attach(server: MimoServer): void {
    this.server = server;
  }

  toChild<E extends EventName>(childId: string, event: E, ...args: EventArgs<E>): void {
    this.server?.to(rooms.child(childId)).emit(event, ...args);
  }

  toParents<E extends EventName>(familyId: string, event: E, ...args: EventArgs<E>): void {
    this.server?.to(rooms.parents(familyId)).emit(event, ...args);
  }

  toParentUser<E extends EventName>(userId: string, event: E, ...args: EventArgs<E>): void {
    this.server?.to(rooms.parentUser(userId)).emit(event, ...args);
  }

  /**
   * Ferme les sockets d'une session (changement de mode, verrouillage, déconnexion) :
   * le client se reconnecte avec ses nouveaux droits, les anciennes salles sont quittées.
   */
  disconnectSession(sessionId: string): void {
    this.server?.in(rooms.session(sessionId)).disconnectSockets(true);
  }

  /** Ferme toutes les sockets d'un parent (déconnexion de tous les appareils, nouveau mot de passe). */
  disconnectUser(userId: string): void {
    this.server?.in(rooms.user(userId)).disconnectSockets(true);
  }

  toFamily<E extends EventName>(familyId: string, event: E, ...args: EventArgs<E>): void {
    this.server?.to(rooms.family(familyId)).emit(event, ...args);
  }
}
