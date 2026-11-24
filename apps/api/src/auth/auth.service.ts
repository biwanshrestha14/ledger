import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../common/auth';
import { camel, newId } from '../common/util';
import { config } from '../config';
import { DatabaseService } from '../db/database.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { DEFAULT_CATEGORIES } from './defaults';

// Constant-time-ish defence: compare against a dummy hash when the email doesn't exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

@Injectable()
export class AuthService {
  constructor(private db: DatabaseService) {}

  async register(dto: RegisterDto) {
    const exists = this.db.get('SELECT id FROM users WHERE email = ?', [dto.email]);
    if (exists) throw new ConflictException('An account with this email already exists.');
    const id = newId();
    const hash = await bcrypt.hash(dto.password, 12);
    this.db.tx(() => {
      this.db.run(
        'INSERT INTO users (id, email, name, password_hash, currency, locale) VALUES (?, ?, ?, ?, ?, ?)',
        [id, dto.email.toLowerCase(), dto.name, hash, dto.currency ?? 'NPR', 'en-IN'],
      );
      for (const c of DEFAULT_CATEGORIES) {
        this.db.run('INSERT INTO categories (id, user_id, name, kind, color, icon) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), id, c.name, c.kind, c.color, c.icon]);
      }
      this.db.run('INSERT INTO accounts (id, user_id, name, type, color) VALUES (?, ?, ?, ?, ?)',
        [newId(), id, 'Everyday', 'checking', '#0088ff']);
    });
    return id;
  }

  async login(dto: LoginDto) {
    const user = this.db.get<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = ?', [dto.email]);
    const ok = await bcrypt.compare(dto.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('The email or password is incorrect.');
    return user.id;
  }

  createSession(userId: string, userAgent?: string) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + config.sessionDays * 86400_000);
    this.db.run('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', [userId, new Date().toISOString()]);
    this.db.run('INSERT INTO sessions (id, user_id, token_hash, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), userId, hashToken(token), userAgent?.slice(0, 300) ?? null, expires.toISOString()]);
    return { token, expires };
  }

  destroySession(sessionId: string) {
    this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  me(userId: string) {
    const row = this.db.get('SELECT id, email, name, currency, locale, created_at FROM users WHERE id = ?', [userId]);
    if (!row) throw new UnauthorizedException();
    return camel(row);
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    const u = this.me(userId);
    this.db.run('UPDATE users SET name = ?, currency = ?, locale = ? WHERE id = ?',
      [dto.name ?? u.name, dto.currency ?? u.currency, dto.locale ?? u.locale, userId]);
    return this.me(userId);
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto) {
    const row = this.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!row || !(await bcrypt.compare(dto.currentPassword, row.password_hash))) {
      throw new BadRequestException('Your current password is incorrect.');
    }
    const hash = await bcrypt.hash(dto.newPassword, 12);
    this.db.tx(() => {
      this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
      // Sign out every other device.
      this.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', [userId, sessionId]);
    });
  }

  async deleteAccount(userId: string, password: string) {
    const row = this.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new BadRequestException('Your password is incorrect.');
    }
    this.db.run('DELETE FROM users WHERE id = ?', [userId]);
  }
}
