import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { MeResponse } from '@mimo/types';
import type { Request, Response } from 'express';
import { AuthService, type ClientInfo, type IssuedTokens } from './auth.service';
import type { AuthContext } from './auth.types';
import { REFRESH_COOKIE } from './auth.types';
import { AllowWithoutFamily, AnyMode, Auth, ParentOnly, Public } from './decorators';
import { ChangePasswordDto, LoginDto, PinDto, RegisterDto, UnlockChildDto } from './dto';
import { TokenService } from './token.service';

/** Limite stricte des routes sensibles (connexion, PIN), par minute et par IP. */
export const authRateLimit = () => Number(process.env.AUTH_RATE_LIMIT ?? 10);
const STRICT = { default: { limit: authRateLimit, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.apply(res, await this.auth.register(dto, client(req)));
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.apply(res, await this.auth.login(dto, client(req)));
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string> | undefined;
    try {
      this.apply(res, await this.auth.refresh(cookies?.[REFRESH_COOKIE]));
    } catch (error) {
      this.tokens.clearCookies(res);
      throw error;
    }
    return { ok: true };
  }

  @AnyMode()
  @AllowWithoutFamily()
  @HttpCode(200)
  @Post('logout')
  async logout(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth);
    this.tokens.clearCookies(res);
    return { ok: true };
  }

  @ParentOnly()
  @AllowWithoutFamily()
  @HttpCode(200)
  @Post('logout-all')
  async logoutAll(
    @Auth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutEverywhere(auth, client(req));
    this.tokens.clearCookies(res);
    return { ok: true };
  }

  @AnyMode()
  @AllowWithoutFamily()
  @Get('me')
  me(@Auth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth);
  }

  @AnyMode()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('unlock/parent')
  async unlockParent(
    @Auth() auth: AuthContext,
    @Body() dto: PinDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.apply(res, await this.auth.unlockParent(auth, dto.pin, client(req)));
    return { ok: true };
  }

  @AnyMode()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('unlock/child')
  async unlockChild(
    @Auth() auth: AuthContext,
    @Body() dto: UnlockChildDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.apply(res, await this.auth.unlockChild(auth, dto.childId, dto.pin, client(req)));
    return { ok: true };
  }

  @AnyMode()
  @HttpCode(200)
  @Post('lock')
  async lock(@Auth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    this.apply(res, await this.auth.lock(auth));
    return { ok: true };
  }

  @ParentOnly()
  @AllowWithoutFamily()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('password')
  async changePassword(
    @Auth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(auth, dto.currentPassword, dto.newPassword, client(req));
    return { ok: true };
  }

  private apply(res: Response, tokens: IssuedTokens): void {
    this.tokens.setCookies(res, tokens.access, tokens.refresh);
  }
}

function client(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}
