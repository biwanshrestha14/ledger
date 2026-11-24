import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthedRequest, Public, UserId } from '../common/auth';
import { config } from '../config';
import { ChangePasswordDto, DeleteAccountDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(config.sessionCookie, token, {
      httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/api', expires,
    });
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = await this.auth.register(dto);
    const { token, expires } = this.auth.createSession(userId, req.headers['user-agent']);
    this.setCookie(res, token, expires);
    return this.auth.me(userId);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = await this.auth.login(dto);
    const { token, expires } = this.auth.createSession(userId, req.headers['user-agent']);
    this.setCookie(res, token, expires);
    return this.auth.me(userId);
  }

  @Post('logout') @HttpCode(204)
  logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    this.auth.destroySession(req.sessionId);
    res.clearCookie(config.sessionCookie, { path: '/api' });
  }

  @Get('me')
  me(@UserId() userId: string) {
    return this.auth.me(userId);
  }

  @Patch('me')
  update(@UserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password') @HttpCode(204)
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.userId, req.sessionId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me') @HttpCode(204)
  async remove(@UserId() userId: string, @Body() dto: DeleteAccountDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.deleteAccount(userId, dto.password);
    res.clearCookie(config.sessionCookie, { path: '/api' });
  }
}
