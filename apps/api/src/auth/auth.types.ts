import type { FamilyUserRole, SessionMode } from '@prisma/client';

/** Contexte d'authentification attaché à chaque requête par l'AuthGuard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  familyId: string | null;
  /** Rôle du compte dans sa famille (lu en base à chaque requête). */
  role: FamilyUserRole;
  mode: SessionMode;
  /** Profil de jeu de la session (mode CHILD ou PLAYER). */
  childId: string | null;
  parentModeExpiresAt: Date | null;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  fam: string | null;
  mode: SessionMode;
  cid: string | null;
}

export const ACCESS_COOKIE = 'mimo_at';
export const REFRESH_COOKIE = 'mimo_rt';
export const REFRESH_COOKIE_PATH = '/api/auth';
