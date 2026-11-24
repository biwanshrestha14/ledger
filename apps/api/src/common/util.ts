import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../db/database.service';

export const newId = () => randomUUID();

const OWNED_TABLES = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'recurring'] as const;
type OwnedTable = (typeof OWNED_TABLES)[number];

/** Throws 404 unless the row exists and belongs to the user. Prevents cross-user access. */
export function assertOwned(db: DatabaseService, table: OwnedTable, id: string, userId: string, label: string) {
  if (!OWNED_TABLES.includes(table)) throw new Error('Invalid table');
  const row = db.get(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`, [id, userId]);
  if (!row) throw new NotFoundException(`${label} not found.`);
}

/** Convert snake_case DB rows to camelCase API objects. */
export function camel<T = any>(row: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out as T;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function addCadence(date: string, cadence: 'weekly' | 'monthly' | 'yearly'): string {
  const [y, m, d] = date.split('-').map(Number);
  if (cadence === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }
  const months = cadence === 'monthly' ? 1 : 12;
  const targetMonth = m - 1 + months;
  // Clamp to the last day of the target month (Jan 31 -> Feb 28).
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
