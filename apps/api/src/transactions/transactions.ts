import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { UserId } from '../common/auth';
import { DATE_RE, assertOwned, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
type TxType = 'expense' | 'income' | 'transfer';

export class CreateTransactionDto {
  @IsIn(['expense', 'income', 'transfer']) type: TxType;
  @IsInt({ message: 'Enter an amount.' }) @Min(1, { message: 'Enter an amount greater than zero.' }) @Max(1e13) amount: number;
  @IsUUID() accountId: string;
  @IsOptional() @IsUUID() toAccountId?: string | null;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @Matches(DATE_RE, { message: 'Choose a date.' }) date: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) payee?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsIn(['expense', 'income', 'transfer']) type?: TxType;
  @IsOptional() @IsInt() @Min(1) @Max(1e13) amount?: number;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() toAccountId?: string | null;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @Matches(DATE_RE) date?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) payee?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

export class ListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsString() categoryId?: string; // uuid or "none"
  @IsOptional() @IsIn(['expense', 'income', 'transfer']) type?: TxType;
  @IsOptional() @Matches(DATE_RE) from?: string;
  @IsOptional() @Matches(DATE_RE) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class BulkDeleteDto {
  @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true }) ids: string[];
}

export class BulkCategorizeDto {
  @IsArray() @ArrayMaxSize(1000) @IsUUID('all', { each: true }) ids: string[];
  @IsOptional() @IsUUID() categoryId: string | null;
}

const SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         a.name AS account_name, a.color AS account_color, ta.name AS to_account_name
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id`;

@Injectable()
export class TransactionsService {
  constructor(private db: DatabaseService) {}

  list(userId: string, q: ListQuery) {
    const where = ['t.user_id = @userId'];
    const p: Record<string, unknown> = { userId };
    if (q.q) {
      where.push(`(t.payee LIKE @q ESCAPE '\\' OR t.note LIKE @q ESCAPE '\\' OR c.name LIKE @q ESCAPE '\\')`);
      p.q = `%${q.q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    }
    if (q.accountId) { where.push('(t.account_id = @accountId OR t.to_account_id = @accountId)'); p.accountId = q.accountId; }
    if (q.categoryId === 'none') where.push(`t.category_id IS NULL AND t.type != 'transfer'`);
    else if (q.categoryId) { where.push('t.category_id = @categoryId'); p.categoryId = q.categoryId; }
    if (q.type) { where.push('t.type = @type'); p.type = q.type; }
    if (q.from) { where.push('t.date >= @from'); p.from = q.from; }
    if (q.to) { where.push('t.date <= @to'); p.to = q.to; }
    const whereSql = where.join(' AND ');
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;

    const items = this.db
      .all(`${SELECT} WHERE ${whereSql} ORDER BY t.date DESC, t.created_at DESC LIMIT ${limit} OFFSET ${offset}`, p)
      .map(camel);
    const totals = this.db.get<any>(
      `SELECT COUNT(*) AS count,
         COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount END), 0) AS expense
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE ${whereSql}`, p)!;
    return { items, total: totals.count, income: totals.income, expense: totals.expense, limit, offset };
  }

  get(userId: string, id: string) {
    const row = this.db.get(`${SELECT} WHERE t.id = ? AND t.user_id = ?`, [id, userId]);
    if (!row) assertOwned(this.db, 'transactions', id, userId, 'Transaction');
    return camel(row!);
  }

  private validate(userId: string, t: { type: TxType; accountId: string; toAccountId?: string | null; categoryId?: string | null }) {
    assertOwned(this.db, 'accounts', t.accountId, userId, 'Account');
    if (t.type === 'transfer') {
      if (!t.toAccountId) throw new BadRequestException('Choose the account to transfer to.');
      if (t.toAccountId === t.accountId) throw new BadRequestException('Choose two different accounts for a transfer.');
      assertOwned(this.db, 'accounts', t.toAccountId, userId, 'Destination account');
      t.categoryId = null;
    } else {
      t.toAccountId = null;
      if (t.categoryId) {
        const cat = this.db.get<{ kind: string }>('SELECT kind FROM categories WHERE id = ? AND user_id = ?', [t.categoryId, userId]);
        if (!cat) throw new BadRequestException('Category not found.');
        if (cat.kind !== t.type) throw new BadRequestException(`Choose an ${t.type} category.`);
      }
    }
  }

  create(userId: string, dto: CreateTransactionDto) {
    const t = { ...dto };
    this.validate(userId, t);
    const id = newId();
    this.db.run(
      `INSERT INTO transactions (id, user_id, account_id, to_account_id, category_id, type, amount, date, payee, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, t.accountId, t.toAccountId ?? null, t.categoryId ?? null, t.type, t.amount, t.date, t.payee ?? '', t.note ?? ''],
    );
    return this.get(userId, id);
  }

  update(userId: string, id: string, dto: UpdateTransactionDto) {
    const cur: any = this.get(userId, id);
    const t = {
      type: dto.type ?? cur.type,
      amount: dto.amount ?? cur.amount,
      accountId: dto.accountId ?? cur.accountId,
      toAccountId: dto.toAccountId !== undefined ? dto.toAccountId : cur.toAccountId,
      categoryId: dto.categoryId !== undefined ? dto.categoryId : cur.categoryId,
      date: dto.date ?? cur.date,
      payee: dto.payee ?? cur.payee,
      note: dto.note ?? cur.note,
    };
    this.validate(userId, t);
    this.db.run(
      `UPDATE transactions SET type=?, amount=?, account_id=?, to_account_id=?, category_id=?, date=?, payee=?, note=?
       WHERE id = ? AND user_id = ?`,
      [t.type, t.amount, t.accountId, t.toAccountId, t.categoryId, t.date, t.payee, t.note, id, userId],
    );
    return this.get(userId, id);
  }

  remove(userId: string, id: string) {
    assertOwned(this.db, 'transactions', id, userId, 'Transaction');
    this.db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
  }

  bulkDelete(userId: string, ids: string[]) {
    const del = this.db.db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?');
    let n = 0;
    this.db.tx(() => { for (const id of ids) n += del.run(id, userId).changes; });
    return { deleted: n };
  }

  bulkCategorize(userId: string, dto: BulkCategorizeDto) {
    let kind: string | null = null;
    if (dto.categoryId) {
      const cat = this.db.get<{ kind: string }>('SELECT kind FROM categories WHERE id = ? AND user_id = ?', [dto.categoryId, userId]);
      if (!cat) throw new BadRequestException('Category not found.');
      kind = cat.kind;
    }
    const upd = this.db.db.prepare(
      `UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ? AND type != 'transfer' AND (? IS NULL OR type = ?)`);
    let n = 0;
    this.db.tx(() => { for (const id of dto.ids) n += upd.run(dto.categoryId ?? null, id, userId, kind, kind).changes; });
    return { updated: n };
  }

  /** Recent distinct payees with their most-used category, for autocomplete. */
  payees(userId: string) {
    return this.db.all(
      `SELECT payee, type, category_id AS categoryId, account_id AS accountId, COUNT(*) AS uses, MAX(date) AS last
       FROM transactions WHERE user_id = ? AND payee != '' AND type != 'transfer'
       GROUP BY payee COLLATE NOCASE ORDER BY uses DESC, last DESC LIMIT 200`, [userId]);
  }
}

@Controller('transactions')
export class TransactionsController {
  constructor(private svc: TransactionsService) {}
  @Get() list(@UserId() u: string, @Query() q: ListQuery) { return this.svc.list(u, q); }
  @Get('payees') payees(@UserId() u: string) { return this.svc.payees(u); }
  @Get(':id') get(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post() create(@UserId() u: string, @Body() dto: CreateTransactionDto) { return this.svc.create(u, dto); }
  @Post('bulk-delete') @HttpCode(200) bulkDelete(@UserId() u: string, @Body() dto: BulkDeleteDto) { return this.svc.bulkDelete(u, dto.ids); }
  @Post('bulk-categorize') @HttpCode(200) bulkCat(@UserId() u: string, @Body() dto: BulkCategorizeDto) { return this.svc.bulkCategorize(u, dto); }
  @Patch(':id') update(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTransactionDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { this.svc.remove(u, id); }
}

@Module({ controllers: [TransactionsController], providers: [TransactionsService], exports: [TransactionsService] })
export class TransactionsModule {}
