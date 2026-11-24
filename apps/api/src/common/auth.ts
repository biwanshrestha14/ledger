import {
  CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config';
import { DatabaseService } from '../db/database.service';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthedRequest extends Request {
  userId: string;
  sessionId: string;
}

export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().userId,
);

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Global guard: every route requires a valid session cookie unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private reflector: Reflector, private db: DatabaseService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[config.sessionCookie];
    if (!token) throw new UnauthorizedException('Sign in to continue.');

    const session = this.db.get<{ id: string; user_id: string; expires_at: string }>(
      'SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ?',
      [hashToken(token)],
    );
    if (!session || new Date(session.expires_at) < new Date()) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    req.userId = session.user_id;
    req.sessionId = session.id;
    return true;
  }
}
