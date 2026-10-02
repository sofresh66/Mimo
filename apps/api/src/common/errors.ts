import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Erreur métier avec un code stable. Le message est destiné aux logs et au développeur ;
 * l'interface traduit le `code` en message simple et bienveillant.
 */
export class AppError extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const Errors = {
  notFound: (what: string) =>
    new AppError('NOT_FOUND', `${what} introuvable`, HttpStatus.NOT_FOUND),
  forbidden: (message = 'Action non autorisée') =>
    new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  unauthorized: (code = 'UNAUTHENTICATED', message = 'Authentification requise') =>
    new AppError(code, message, HttpStatus.UNAUTHORIZED),
  conflict: (code: string, message: string) => new AppError(code, message, HttpStatus.CONFLICT),
  badRequest: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, message, HttpStatus.BAD_REQUEST, details),
  locked: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, message, HttpStatus.LOCKED, details),
  tooMany: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, message, HttpStatus.TOO_MANY_REQUESTS, details),
};
