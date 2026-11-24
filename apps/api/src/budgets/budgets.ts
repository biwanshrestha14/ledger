import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { UserId } from '../common/auth';
import { MONTH_RE, camel, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';

export class SetBudgetDto {
  @IsInt() @Min(1, { message: 'Enter a monthly limit greater than zero.' }) @Max(1e13) amount: number;
}
export class MonthQuery {
  @IsOptional() @Matches(MONTH_RE) month?: string;
}

export const monthRange = (month?: string) => {
  const m = month ?? new Date().toISOString().slice(0, 7);
  return { month: m, from: `${m}-01`, to: `${m}-31` };
};

@Injectable()
export class BudgetsService {
  constructor(private db: DatabaseService) {}

  list(userId: string, month?: string) {
    const r = monthRange(month);
    return this.db.all(
      `SELECT b.id, b.amount, b.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.category_id = b.category_id AND t.type = 'expense' AND t.date BETWEEN ? AND ?), 0) AS spent
       FROM budgets b JOIN categories c ON c.id = b.category_id
       WHERE b.user_id = ? ORDER BY c.name COLLATE NOCASE`,
      [r.from, r.to, userId],
    ).map(camel);
  }

  set(userId: string, categoryId: string, amount: number) {
    const cat = this.db.get<{ kind: string }>('SELECT kind FROM categories WHERE id = ? AND user_id = ?', [categoryId, userId]);
    if (!cat) throw new BadRequestException('Category not found.');
    if (cat.kind !== 'expense') throw new BadRequestException('Budgets can only be set on expense categories.');
    this.db.run(
      `INSERT INTO budgets (id, user_id, category_id, amount) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount`,
      [newId(), userId, categoryId, amount],
    );
    return this.list(userId).find((b: any) => b.categoryId === categoryId);
  }

  remove(userId: string, categoryId: string) {
    this.db.run('DELETE FROM budgets WHERE user_id = ? AND category_id = ?', [userId, categoryId]);
  }
}

@Controller('budgets')
export class BudgetsController {
  constructor(private svc: BudgetsService) {}
  @Get() list(@UserId() u: string, @Query() q: MonthQuery) { return this.svc.list(u, q.month); }
  @Put(':categoryId') set(@UserId() u: string, @Param('categoryId', ParseUUIDPipe) c: string, @Body() dto: SetBudgetDto) { return this.svc.set(u, c, dto.amount); }
  @Delete(':categoryId') @HttpCode(204) remove(@UserId() u: string, @Param('categoryId', ParseUUIDPipe) c: string) { this.svc.remove(u, c); }
}

@Module({ controllers: [BudgetsController], providers: [BudgetsService], exports: [BudgetsService] })
export class BudgetsModule {}
