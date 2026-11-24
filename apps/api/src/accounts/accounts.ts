import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { UserId } from '../common/auth';
import { COLOR_RE, assertOwned, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

const TYPES = ['checking', 'savings', 'credit', 'cash', 'investment'];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAccountDto {
  @Transform(trim) @IsString() @Length(1, 60, { message: 'Enter an account name.' }) name: string;
  @IsIn(TYPES) type: string;
  @Matches(COLOR_RE) color: string;
  @IsOptional() @IsInt() @Min(-1e13) @Max(1e13) openingBalance?: number;
}

export class UpdateAccountDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @Matches(COLOR_RE) color?: string;
  @IsOptional() @IsInt() @Min(-1e13) @Max(1e13) openingBalance?: number;
  @IsOptional() @IsBoolean() archived?: boolean;
}

/** SQL expression for an account's current balance (minor units). */
export const BALANCE_SQL = `
  a.opening_balance
  + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
              FROM transactions t WHERE t.account_id = a.id), 0)
  + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id AND t.type = 'transfer'), 0)`;

@Injectable()
export class AccountsService {
  constructor(private db: DatabaseService) {}

  list(userId: string) {
    return this.db
      .all(
        `SELECT a.*, (${BALANCE_SQL}) AS balance,
           (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id OR t.to_account_id = a.id) AS transaction_count
         FROM accounts a WHERE a.user_id = ? ORDER BY a.archived, a.sort_order, a.created_at`,
        [userId],
      )
      .map((r) => ({ ...camel(r), archived: !!r.archived }));
  }

  get(userId: string, id: string) {
    assertOwned(this.db, 'accounts', id, userId, 'Account');
    return this.list(userId).find((a: any) => a.id === id);
  }

  create(userId: string, dto: CreateAccountDto) {
    const id = newId();
    const order = this.db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM accounts WHERE user_id = ?', [userId])!.n;
    this.db.run(
      'INSERT INTO accounts (id, user_id, name, type, color, opening_balance, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, dto.name, dto.type, dto.color, dto.openingBalance ?? 0, order],
    );
    return this.get(userId, id);
  }

  update(userId: string, id: string, dto: UpdateAccountDto) {
    const cur: any = this.get(userId, id);
    this.db.run('UPDATE accounts SET name = ?, type = ?, color = ?, opening_balance = ?, archived = ? WHERE id = ? AND user_id = ?', [
      dto.name ?? cur.name, dto.type ?? cur.type, dto.color ?? cur.color,
      dto.openingBalance ?? cur.openingBalance, (dto.archived ?? cur.archived) ? 1 : 0, id, userId,
    ]);
    return this.get(userId, id);
  }

  remove(userId: string, id: string) {
    assertOwned(this.db, 'accounts', id, userId, 'Account');
    this.db.run('DELETE FROM accounts WHERE id = ? AND user_id = ?', [id, userId]);
  }
}

@Controller('accounts')
export class AccountsController {
  constructor(private svc: AccountsService) {}
  @Get() list(@UserId() u: string) { return this.svc.list(u); }
  @Post() create(@UserId() u: string, @Body() dto: CreateAccountDto) { return this.svc.create(u, dto); }
  @Patch(':id') update(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { this.svc.remove(u, id); }
}

@Module({ controllers: [AccountsController], providers: [AccountsService], exports: [AccountsService] })
export class AccountsModule {}
