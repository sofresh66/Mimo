import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import type { ClientToServerEvents, ServerToClientEvents } from '@mimo/types';
import type { Server, Socket } from 'socket.io';
import { ACCESS_COOKIE } from '../auth/auth.types';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService, rooms } from './realtime.service';

/**
 * Passerelle Socket.IO. L'authentification réutilise le cookie HttpOnly d'accès :
 * à la connexion, la session est vérifiée en base puis le socket rejoint ses salles
 * (enfant, parents, famille). Aucun message client → serveur n'est accepté.
 * Un adulte joueur (rôle ADULT_PLAYER) ne rejoint jamais la salle des parents : seulement
 * celle de son propre profil de jeu.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.realtime.attach(server);
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const authHeader = socket.handshake.auth as { token?: unknown } | undefined;
      const token =
        cookies[ACCESS_COOKIE] ?? (typeof authHeader?.token === 'string' ? authHeader.token : null);
      const payload = token ? this.tokens.verifyAccess(token) : null;
      if (!payload) throw new Error('jeton invalide');

      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid },
        include: {
          user: { select: { familyId: true, familyRole: true } },
          child: { select: { familyId: true, type: true, userId: true } },
        },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new Error('session terminée');
      }
      const familyId = session.user.familyId;
      if (!familyId) throw new Error('aucune famille');
      const role = session.user.familyRole;
      const child = session.child;
      const playerValid =
        session.mode === 'PLAYER' &&
        payload.mode === 'PLAYER' &&
        role === 'ADULT_PLAYER' &&
        !!child &&
        child.type === 'ADULT' &&
        child.userId === session.userId &&
        child.familyId === familyId &&
        payload.cid === session.childId;
      // Même règle que le garde HTTP : un adulte joueur n'existe qu'en mode PLAYER valide.
      if ((role === 'ADULT_PLAYER' || session.mode === 'PLAYER') && !playerValid) {
        throw new Error('session joueur invalide');
      }

      await socket.join([
        rooms.family(familyId),
        rooms.session(session.id),
        rooms.user(session.userId),
      ]);
      const parentActive =
        session.mode === 'PARENT' &&
        !!session.parentModeExpiresAt &&
        session.parentModeExpiresAt > new Date();
      if (parentActive && payload.mode === 'PARENT' && role === 'PARENT') {
        await socket.join(rooms.parents(familyId));
        // À l'expiration de l'espace parent, la socket est fermée (le client se reconnecte sans ces droits).
        const remaining = (session.parentModeExpiresAt?.getTime() ?? Date.now()) - Date.now();
        const timer = setTimeout(() => socket.disconnect(true), Math.max(0, remaining));
        socket.once('disconnect', () => clearTimeout(timer));
      }
      const childValid =
        session.mode === 'CHILD' &&
        payload.mode === 'CHILD' &&
        child?.type === 'CHILD' &&
        child.familyId === familyId &&
        payload.cid === session.childId;
      if ((childValid || playerValid) && session.childId) {
        await socket.join(rooms.child(session.childId));
      }
    } catch (error) {
      this.logger.debug(`Connexion temps réel refusée : ${String(error)}`);
      socket.disconnect(true);
    }
  }
}
