import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthSession } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/env';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  type AccessTokenPayload,
} from './auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
  }

  parentModeExpiry(): Date {
    return new Date(Date.now() + this.config.parentModeTtlMinutes * 60_000);
  }

  signAccess(session: AuthSession, familyId: string | null): string {
    const payload: AccessTokenPayload = {
      sub: session.userId,
      sid: session.id,
      fam: familyId,
      mode: session.mode,
      cid: session.childId,
    };
    return this.jwt.sign(payload, { expiresIn: `${this.config.accessTokenTtlMinutes}m` });
  }

  verifyAccess(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      return null;
    }
  }

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax' };
  }

  setCookies(res: Response, access: string, refresh?: string): void {
    res.cookie(ACCESS_COOKIE, access, {
      ...this.cookieBase(),
      path: '/',
      maxAge: this.config.accessTokenTtlMinutes * 60_000,
    });
    if (refresh) {
      res.cookie(REFRESH_COOKIE, refresh, {
        ...this.cookieBase(),
        path: REFRESH_COOKIE_PATH,
        maxAge: this.config.refreshTokenTtlDays * 86_400_000,
      });
    }
  }

  clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: REFRESH_COOKIE_PATH });
  }
}
