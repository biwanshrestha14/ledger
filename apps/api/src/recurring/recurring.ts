import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { UserId } from '../common/auth';
import { DATE_RE, addCadence, assertOwned, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
type Cadence = 'weekly' | 'monthly' | 'yearly';

export class CreateRecurringDto {
  @Transform(trim) @IsString() @Length(1, 60, { message: 'Enter a name.' }) name: string;
  @IsIn(['expense', 'income']) type: 'expense' | 'income';
  @IsInt() @Min(1, { message: 'Enter an amount greater than zero.' }) @Max(1e13) amount: number;
  @IsUUID() accountId: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsIn(['weekly', 'monthly', 'yearly']) cadence: Cadence;
  @Matches(DATE_RE, { message: 'Choose the next due date.' }) nextDate: string;
}
export class UpdateRecurringDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsIn(['expense', 'income']) type?: 'expense' | 'income';
  @IsOptional() @IsInt() @Min(1) @Max(1e13) amount?: number;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsIn(['weekly', 'monthly', 'yearly']) cadence?: Cadence;
  @IsOptional() @Matches(DATE_RE) nextDate?: string;
}

const SELECT = `SELECT r.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon, a.name AS account_name
  FROM recurring r LEFT JOIN categories c ON c.id = r.category_id JOIN accounts a ON a.id = r.account_id`;

@Injectable()
export class RecurringService {
  constructor(private db: DatabaseService) {}

  list(userId: string) {
    return this.db.all(`${SELECT} WHERE r.user_id = ? ORDER BY r.next_date, r.name`, [userId]).map(camel);
  }
  private one(userId: string, id: string) {
    assertOwned(this.db, 'recurring', id, userId, 'Recurring item');
    return camel<any>(this.db.get(`${SELECT} WHERE r.id = ?`, [id])!);
  }
  private check(userId: string, d: { accountId: string; categoryId?: string | null; type: string }) {
    assertOwned(this.db, 'accounts', d.accountId, userId, 'Account');
    if (d.categoryId) {
      const c = this.db.get<{ kind: string }>('SELECT kind FROM categories WHERE id = ? AND user_id = ?', [d.categoryId, userId]);
      if (!c) throw new BadRequestException('Category not found.');
      if (c.kind !== d.type) throw new BadRequestException(`Choose an ${d.type} category.`);
    }
  }
  create(userId: string, d: CreateRecurringDto) {
    this.check(userId, d);
    const id = newId();
    this.db.run(
      'INSERT INTO recurring (id, user_id, name, type, amount, account_id, category_id, cadence, next_date) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, userId, d.name, d.type, d.amount, d.accountId, d.categoryId ?? null, d.cadence, d.nextDate]);
    return this.one(userId, id);
  }
  update(userId: string, id: string, d: UpdateRecurringDto) {
    const c = this.one(userId, id);
    const m = {
      name: d.name ?? c.name, type: d.type ?? c.type, amount: d.amount ?? c.amount, accountId: d.accountId ?? c.accountId,
      categoryId: d.categoryId !== undefined ? d.categoryId : c.categoryId, cadence: d.cadence ?? c.cadence, nextDate: d.nextDate ?? c.nextDate,
    };
    this.check(userId, m);
    this.db.run('UPDATE recurring SET name=?, type=?, amount=?, account_id=?, category_id=?, cadence=?, next_date=? WHERE id=?',
      [m.name, m.type, m.amount, m.accountId, m.categoryId, m.cadence, m.nextDate, id]);
    return this.one(userId, id);
  }
  /** Record this occurrence as a transaction and advance to the next due date. */
  post(userId: string, id: string) {
    const r = this.one(userId, id);
    return this.db.tx(() => {
      this.db.run(
        `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, payee, note) VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId(), userId, r.accountId, r.categoryId, r.type, r.amount, r.nextDate, r.name, '']);
      this.db.run('UPDATE recurring SET next_date = ? WHERE id = ?', [addCadence(r.nextDate, r.cadence), id]);
      return this.one(userId, id);
    });
  }
  skip(userId: string, id: string) {
    const r = this.one(userId, id);
    this.db.run('UPDATE recurring SET next_date = ? WHERE id = ?', [addCadence(r.nextDate, r.cadence), id]);
    return this.one(userId, id);
  }
  remove(userId: string, id: string) {
    this.one(userId, id);
    this.db.run('DELETE FROM recurring WHERE id = ?', [id]);
  }
}

@Controller('recurring')
export class RecurringController {
  constructor(private svc: RecurringService) {}
  @Get() list(@UserId() u: string) { return this.svc.list(u); }
  @Post() create(@UserId() u: string, @Body() d: CreateRecurringDto) { return this.svc.create(u, d); }
  @Patch(':id') update(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateRecurringDto) { return this.svc.update(u, id, d); }
  @Post(':id/post') @HttpCode(200) post(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.post(u, id); }
  @Post(':id/skip') @HttpCode(200) skip(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { return this.svc.skip(u, id); }
  @Delete(':id') @HttpCode(204) remove(@UserId() u: string, @Param('id', ParseUUIDPipe) id: string) { this.svc.remove(u, id); }
}

@Module({ controllers: [RecurringController], providers: [RecurringService] })
export class RecurringModule {}
