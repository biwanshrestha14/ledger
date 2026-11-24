import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { UserId } from '../common/auth';
import { camel } from '../common/util';
import { DatabaseService } from '../db/database.service';
import { BALANCE_SQL } from '../accounts/accounts';
import { MonthQuery } from '../budgets/budgets';

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

@Injectable()
export class InsightsService {
  constructor(private db: DatabaseService) {}

  private totals(userId: string, month: string) {
    return this.db.get<{ income: number; expense: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
       FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ?`, [userId, `${month}-01`, `${month}-31`])!;
  }

  private dailyCumulative(userId: string, month: string) {
    const rows = this.db.all<{ day: number; amount: number }>(
      `SELECT CAST(substr(date, 9, 2) AS INTEGER) AS day, SUM(amount) AS amount FROM transactions
       WHERE user_id = ? AND type = 'expense' AND date BETWEEN ? AND ? GROUP BY day`,
      [userId, `${month}-01`, `${month}-31`]);
    const byDay = new Map(rows.map((r) => [r.day, r.amount]));
    let run = 0;
    return Array.from({ length: daysIn(month) }, (_, i) => (run += byDay.get(i + 1) ?? 0));
  }

  overview(userId: string, monthArg?: string) {
    const month = monthArg ?? new Date().toISOString().slice(0, 7);
    const prev = shiftMonth(month, -1);
    const cur = this.totals(userId, month);
    const last = this.totals(userId, prev);

    const accounts = this.db.all<{ type: string; balance: number }>(
      `SELECT a.type, (${BALANCE_SQL}) AS balance FROM accounts a WHERE a.user_id = ? AND a.archived = 0`, [userId]);
    const assets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
    const liabilities = accounts.filter((a) => a.balance < 0).reduce((s, a) => s - a.balance, 0);

    const byCategory = this.db.all(
      `SELECT t.category_id, COALESCE(c.name, 'Uncategorized') AS name, COALESCE(c.color, '#8e8e93') AS color,
              COALESCE(c.icon, 'circle-help') AS icon, SUM(t.amount) AS amount, COUNT(*) AS count
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.type = 'expense' AND t.date BETWEEN ? AND ?
       GROUP BY t.category_id ORDER BY amount DESC`, [userId, `${month}-01`, `${month}-31`]).map(camel);

    const topPayees = this.db.all(
      `SELECT payee, SUM(amount) AS amount, COUNT(*) AS count FROM transactions
       WHERE user_id = ? AND type = 'expense' AND payee != '' AND date BETWEEN ? AND ?
       GROUP BY payee COLLATE NOCASE ORDER BY amount DESC LIMIT 5`, [userId, `${month}-01`, `${month}-31`]);

    // 12-month cash-flow trend ending at the selected month.
    const start = shiftMonth(month, -11);
    const flows = this.db.all<{ month: string; income: number; expense: number }>(
      `SELECT substr(date, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense
       FROM transactions WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY month`,
      [userId, `${start}-01`, `${month}-31`]);
    const flowMap = new Map(flows.map((f) => [f.month, f]));

    // Net worth at each month end = opening balances + all income − all expenses up to that date.
    const opening = this.db.get<{ s: number }>(
      'SELECT COALESCE(SUM(opening_balance),0) AS s FROM accounts WHERE user_id = ? AND archived = 0', [userId])!.s;
    const before = this.db.get<{ s: number }>(
      `SELECT COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount WHEN t.type='expense' THEN -t.amount ELSE 0 END),0) AS s
       FROM transactions t JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = ? AND a.archived = 0 AND t.date < ?`, [userId, `${start}-01`])!.s;
    let running = opening + before;
    const trend = Array.from({ length: 12 }, (_, i) => {
      const m = shiftMonth(start, i);
      const f = flowMap.get(m) ?? { income: 0, expense: 0 };
      running += f.income - f.expense;
      return { month: m, income: f.income, expense: f.expense, netWorth: running };
    });

    const upcoming = this.db.all(
      `SELECT r.id, r.name, r.type, r.amount, r.next_date, r.cadence, c.color AS category_color, c.icon AS category_icon
       FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.user_id = ? ORDER BY r.next_date LIMIT 5`, [userId]).map(camel);

    const isCurrent = month === new Date().toISOString().slice(0, 7);
    const dayOfMonth = isCurrent ? new Date().getUTCDate() : daysIn(month);

    return {
      month,
      netWorth: assets - liabilities,
      assets,
      liabilities,
      income: cur.income,
      expense: cur.expense,
      net: cur.income - cur.expense,
      savingsRate: cur.income > 0 ? (cur.income - cur.expense) / cur.income : null,
      previous: { month: prev, income: last.income, expense: last.expense },
      byCategory,
      topPayees,
      trend,
      daily: { current: this.dailyCumulative(userId, month), previous: this.dailyCumulative(userId, prev), dayOfMonth },
      upcoming,
    };
  }
}

@Controller('insights')
export class InsightsController {
  constructor(private svc: InsightsService) {}
  @Get('overview') overview(@UserId() u: string, @Query() q: MonthQuery) { return this.svc.overview(u, q.month); }
}

@Module({ controllers: [InsightsController], providers: [InsightsService] })
export class InsightsModule {}
