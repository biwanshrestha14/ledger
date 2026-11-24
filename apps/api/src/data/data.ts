import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, Post, Res } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { Response } from 'express';
import { UserId } from '../common/auth';
import { DATE_RE, addCadence, assertOwned, newId } from '../common/util';
import { DatabaseService } from '../db/database.service';
import { DEFAULT_CATEGORIES } from '../auth/defaults';
import { Throttle } from '@nestjs/throttler';

class ImportRow {
  @Matches(DATE_RE) date: string;
  /** Signed minor units: negative = expense, positive = income. */
  @IsInt() @Min(-1e13) @Max(1e13) amount: number;
  @IsOptional() @IsString() @MaxLength(120) payee?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
}
export class ImportDto {
  @IsUUID() accountId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10000) @ValidateNested({ each: true }) @Type(() => ImportRow) rows: ImportRow[];
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Injectable()
export class DataService {
  constructor(private db: DatabaseService) {}

  csv(userId: string) {
    const rows = this.db.all(
      `SELECT t.date, t.type, t.amount, t.payee, c.name AS category, a.name AS account, ta.name AS to_account, t.note
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id JOIN accounts a ON a.id = t.account_id
       LEFT JOIN accounts ta ON ta.id = t.to_account_id WHERE t.user_id = ? ORDER BY t.date DESC, t.created_at DESC`, [userId]);
    const head = 'Date,Type,Amount,Payee,Category,Account,To Account,Note';
    const lines = rows.map((r: any) => {
      const signed = r.type === 'expense' ? -r.amount : r.amount;
      return [r.date, r.type, (signed / 100).toFixed(2), r.payee, r.category ?? '', r.account, r.to_account ?? '', r.note].map(csvCell).join(',');
    });
    return [head, ...lines].join('\n');
  }

  json(userId: string) {
    const q = (sql: string) => this.db.all(sql, [userId]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      user: this.db.get('SELECT email, name, currency, locale FROM users WHERE id = ?', [userId]),
      accounts: q('SELECT id, name, type, color, opening_balance, archived FROM accounts WHERE user_id = ?'),
      categories: q('SELECT id, name, kind, color, icon, archived FROM categories WHERE user_id = ?'),
      transactions: q('SELECT id, account_id, to_account_id, category_id, type, amount, date, payee, note FROM transactions WHERE user_id = ?'),
      budgets: q('SELECT category_id, amount FROM budgets WHERE user_id = ?'),
      goals: q('SELECT name, target, saved, target_date, color FROM goals WHERE user_id = ?'),
      recurring: q('SELECT name, type, amount, account_id, category_id, cadence, next_date FROM recurring WHERE user_id = ?'),
    };
  }

  import(userId: string, dto: ImportDto) {
    assertOwned(this.db, 'accounts', dto.accountId, userId, 'Account');
    const cats = this.db.all<{ id: string; name: string; kind: string }>('SELECT id, name, kind FROM categories WHERE user_id = ?', [userId]);
    const find = (name: string, kind: string) => cats.find((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase());
    const ins = this.db.db.prepare(
      `INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, date, payee, note) VALUES (?,?,?,?,?,?,?,?,?)`);
    let imported = 0, skipped = 0;
    this.db.tx(() => {
      for (const r of dto.rows) {
        if (r.amount === 0) { skipped++; continue; }
        const type = r.amount < 0 ? 'expense' : 'income';
        let categoryId: string | null = null;
        const name = r.category?.trim();
        if (name) {
          let c = find(name, type);
          if (!c) {
            c = { id: newId(), name, kind: type };
            this.db.run('INSERT INTO categories (id, user_id, name, kind, color, icon) VALUES (?,?,?,?,?,?)',
              [c.id, userId, name, type, '#8e8e93', 'tag']);
            cats.push(c);
          }
          categoryId = c.id;
        }
        ins.run(newId(), userId, dto.accountId, categoryId, type, Math.abs(r.amount), r.date, r.payee?.trim() ?? '', r.note?.trim() ?? '');
        imported++;
      }
    });
    return { imported, skipped };
  }

  /** Erase all financial data and restore the default categories and account. Keeps the login. */
  reset(userId: string) {
    this.db.tx(() => {
      for (const t of ['transactions', 'recurring', 'budgets', 'goals', 'accounts', 'categories']) {
        this.db.run(`DELETE FROM ${t} WHERE user_id = ?`, [userId]);
      }
      for (const c of DEFAULT_CATEGORIES) {
        this.db.run('INSERT INTO categories (id, user_id, name, kind, color, icon) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), userId, c.name, c.kind, c.color, c.icon]);
      }
      this.db.run('INSERT INTO accounts (id, user_id, name, type, color) VALUES (?, ?, ?, ?, ?)',
        [newId(), userId, 'Everyday', 'checking', '#0088ff']);
    });
    return { ok: true };
  }

  /** Populate a realistic three-month history so a new user can explore the app. */
  sample(userId: string) {
    const existing = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ?', [userId])!.n;
    if (existing > 0) throw new BadRequestException('Sample data can only be added to an empty ledger.');
    const cats = this.db.all<{ id: string; name: string }>('SELECT id, name FROM categories WHERE user_id = ?', [userId]);
    const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? null;
    let checking = this.db.get<{ id: string }>(`SELECT id FROM accounts WHERE user_id = ? AND type = 'checking' ORDER BY sort_order LIMIT 1`, [userId])?.id;

    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

    this.db.tx(() => {
      if (!checking) {
        checking = newId();
        this.db.run('INSERT INTO accounts (id, user_id, name, type, color) VALUES (?,?,?,?,?)', [checking, userId, 'Everyday', 'checking', '#0088ff']);
      }
      this.db.run('UPDATE accounts SET opening_balance = 7500000 WHERE id = ?', [checking]);
      const savings = newId(), credit = newId();
      this.db.run('INSERT INTO accounts (id, user_id, name, type, color, opening_balance, sort_order) VALUES (?,?,?,?,?,?,?)',
        [savings, userId, 'Fixed Savings', 'savings', '#34c759', 30000000, 1]);
      this.db.run('INSERT INTO accounts (id, user_id, name, type, color, opening_balance, sort_order) VALUES (?,?,?,?,?,?,?)',
        [credit, userId, 'Credit Card', 'credit', '#ff8d28', -1200000, 2]);

      const tx = (acc: string, type: string, amount: number, date: string, payee: string, category: string | null, to: string | null = null) =>
        this.db.run(`INSERT INTO transactions (id, user_id, account_id, to_account_id, category_id, type, amount, date, payee)
          VALUES (?,?,?,?,?,?,?,?,?)`, [newId(), userId, acc, to, category ? cat(category) : null, type, amount, date, payee]);

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      for (let back = 2; back >= 0; back--) {
        const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        const ym = base.toISOString().slice(0, 7);
        const days = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
        const d = (n: number) => `${ym}-${String(Math.min(n, days)).padStart(2, '0')}`;
        const add = (date: string, ...a: [string, string, number, string, string | null, (string | null)?]) => {
          if (date <= todayStr) tx(a[0], a[1], a[2], date, a[3], a[4], a[5] ?? null);
        };
        const rs = (n: number) => Math.round(n) * 100; // rupees → paisa
        add(d(1), checking!, 'income', rs(125000), 'Himalayan Tech Pvt. Ltd.', 'Salary');
        add(d(1), checking!, 'expense', rs(25000), 'House Rent', 'Housing');
        add(d(3), checking!, 'expense', rs(799), 'StreamBox', 'Subscriptions');
        add(d(5), checking!, 'expense', rs(300), 'Cloud Storage Plus', 'Subscriptions');
        add(d(8), checking!, 'expense', rs(1500 + rand() * 1200), 'Electricity Bill', 'Utilities');
        add(d(12), checking!, 'expense', rs(1500), 'FiberNet Internet', 'Utilities');
        add(d(14), checking!, 'expense', rs(500), 'Mobile Top-up', 'Utilities');
        add(d(2), checking!, 'transfer', rs(20000), 'Monthly savings', null, savings);
        add(d(20), checking!, 'transfer', rs(12000), 'Card payment', null, credit);
        if (back === 1) add(d(18), checking!, 'income', rs(30000), 'Design project', 'Freelance');
        for (let day = 1; day <= days; day++) {
          if (rand() < 0.28) add(d(day), credit, 'expense', rs(600 + rand() * 2800), pick(['Fresh Mart', 'Local Kirana Pasal', 'Sabji Market']), 'Groceries');
          if (rand() < 0.3) add(d(day), credit, 'expense', rs(250 + rand() * 1500), pick(['Momo House', 'Thakali Kitchen', 'Café Himalaya', 'Newari Bhoj Ghar']), 'Dining');
          if (rand() < 0.18) add(d(day), credit, 'expense', rs(120 + rand() * 600), pick(['RideShare', 'Micro Bus', 'Petrol Pump']), 'Transport');
          if (rand() < 0.06) add(d(day), credit, 'expense', rs(1200 + rand() * 6000), pick(['Online Store', 'Clothing Store', 'Book Shop']), 'Shopping');
          if (rand() < 0.04) add(d(day), credit, 'expense', rs(400 + rand() * 1600), pick(['Cinema Hall', 'Concert', 'Game Store']), 'Entertainment');
        }
      }

      for (const [name, amount] of [['Groceries', 1500000], ['Dining', 800000], ['Transport', 500000], ['Shopping', 700000], ['Entertainment', 250000]] as const) {
        const id = cat(name);
        if (id) this.db.run(`INSERT INTO budgets (id, user_id, category_id, amount) VALUES (?,?,?,?)
          ON CONFLICT(user_id, category_id) DO UPDATE SET amount = excluded.amount`, [newId(), userId, id, amount]);
      }
      const inMonths = (n: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
      this.db.run('INSERT INTO goals (id, user_id, name, target, saved, target_date, color) VALUES (?,?,?,?,?,?,?)',
        [newId(), userId, 'Emergency Fund', 50000000, 35000000, inMonths(6), '#34c759']);
      this.db.run('INSERT INTO goals (id, user_id, name, target, saved, target_date, color) VALUES (?,?,?,?,?,?,?)',
        [newId(), userId, 'Annapurna Trek', 15000000, 4000000, inMonths(9), '#ff2d55']);
      const nextOf = (day: number) => {
        let dt = `${todayStr.slice(0, 7)}-${String(day).padStart(2, '0')}`;
        if (dt <= todayStr) dt = addCadence(dt, 'monthly');
        return dt;
      };
      for (const [name, amount, day, c] of [['House Rent', 2500000, 1, 'Housing'], ['StreamBox', 79900, 3, 'Subscriptions'], ['Cloud Storage Plus', 30000, 5, 'Subscriptions'], ['FiberNet Internet', 150000, 12, 'Utilities']] as const) {
        this.db.run('INSERT INTO recurring (id, user_id, name, type, amount, account_id, category_id, cadence, next_date) VALUES (?,?,?,?,?,?,?,?,?)',
          [newId(), userId, name, 'expense', amount, checking, cat(c), 'monthly', nextOf(day)]);
      }
    });
    return { ok: true };
  }
}

@Controller('data')
export class DataController {
  constructor(private svc: DataService) {}

  @Get('export.csv')
  csv(@UserId() u: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ledger-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + this.svc.csv(u));
  }

  @Get('export.json')
  json(@UserId() u: string, @Res() res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="ledger-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(this.svc.json(u));
  }

  @Post('import') @HttpCode(200)
  import(@UserId() u: string, @Body() dto: ImportDto) { return this.svc.import(u, dto); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset') @HttpCode(200)
  reset(@UserId() u: string) { return this.svc.reset(u); }

  @Post('sample') @HttpCode(200)
  sample(@UserId() u: string) { return this.svc.sample(u); }
}

@Module({ controllers: [DataController], providers: [DataService] })
export class DataModule {}
