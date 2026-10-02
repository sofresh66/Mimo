import * as argon2 from 'argon2';
import { Errors, type AppError } from '../common/errors';

/** Paramètres Argon2id (recommandations OWASP). */
const ARGON_OPTIONS = {
  type: argon2.argon2id as 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** Essais avant chaque verrouillage. */
export const PIN_MAX_ATTEMPTS = 5;
/**
 * Durées de verrouillage successives (minutes). Le compteur n'est remis à zéro qu'après un
 * PIN correct : 5 min, puis 30 min, puis 24 h — un PIN à 4 chiffres ne peut pas être deviné
 * en quelques jours.
 */
export const PIN_LOCK_STEPS_MINUTES = [5, 30, 24 * 60] as const;

export function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, ARGON_OPTIONS);
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

export interface PinState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

/** Lève une erreur si le PIN est temporairement verrouillé. */
export function assertPinNotLocked(state: PinState): void {
  if (state.lockedUntil && state.lockedUntil > new Date()) {
    const seconds = Math.ceil((state.lockedUntil.getTime() - Date.now()) / 1000);
    throw Errors.locked('PIN_LOCKED', 'Trop d’essais, patiente un peu', {
      retryInSeconds: seconds,
    });
  }
}

/**
 * Conséquence d'un échec, à partir du nombre total d'échecs déjà incrémenté atomiquement en base.
 * Retourne l'éventuelle date de fin de verrouillage et l'erreur à renvoyer.
 */
export function pinFailure(
  failedAttempts: number,
  now = Date.now(),
): { lockedUntil: Date | null; error: AppError } {
  const remaining = PIN_MAX_ATTEMPTS - (failedAttempts % PIN_MAX_ATTEMPTS);
  if (remaining === PIN_MAX_ATTEMPTS) {
    const step = Math.min(failedAttempts / PIN_MAX_ATTEMPTS, PIN_LOCK_STEPS_MINUTES.length) - 1;
    const minutes = PIN_LOCK_STEPS_MINUTES[step] ?? PIN_LOCK_STEPS_MINUTES[0];
    return {
      lockedUntil: new Date(now + minutes * 60_000),
      error: Errors.locked('PIN_LOCKED', 'Trop d’essais, patiente un peu', {
        retryInSeconds: minutes * 60,
      }),
    };
  }
  return {
    lockedUntil: null,
    error: Errors.badRequest('PIN_INVALID', 'Code PIN incorrect', { remainingAttempts: remaining }),
  };
}
