import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config';
import { migrations } from './migrations';

type Params = Record<string, unknown> | unknown[];

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger('Database');
  readonly db: Database.Database;

  constructor() {
    const path = config.databasePath;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
    const applied = new Set(
      this.db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version),
    );
    for (const m of migrations) {
      if (applied.has(m.version)) continue;
      this.db.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      })();
      this.logger.log(`Applied migration ${m.version}_${m.name}`);
    }
  }

  all<T = any>(sql: string, params: Params = []): T[] {
    return this.db.prepare(sql).all(params as any) as T[];
  }

  get<T = any>(sql: string, params: Params = []): T | undefined {
    return this.db.prepare(sql).get(params as any) as T | undefined;
  }

  run(sql: string, params: Params = []) {
    return this.db.prepare(sql).run(params as any);
  }

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  onModuleDestroy() {
    this.db.close();
  }
}
