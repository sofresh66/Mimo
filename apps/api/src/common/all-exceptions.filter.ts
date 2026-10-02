import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@mimo/types';
import type { Request, Response } from 'express';

/**
 * Filtre global : renvoie toujours un corps d'erreur homogène (`ApiErrorBody`),
 * sans jamais exposer de stack trace au client. Les détails techniques vont dans les logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(`${req.method} ${req.url} → ${body.statusCode} ${body.code}`);
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes, réessaie dans un instant.',
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        return response as ApiErrorBody;
      }
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message: string | string[] }).message
          : exception.message;
      return {
        statusCode: status,
        code: status === HttpStatus.BAD_REQUEST ? 'VALIDATION_ERROR' : httpCode(status),
        message: Array.isArray(message) ? message.join(', ') : message,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'Cette ressource existe déjà',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Ressource introuvable',
        };
      }
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Une erreur inattendue est survenue',
    };
  }
}

function httpCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'HTTP_ERROR';
  }
}
