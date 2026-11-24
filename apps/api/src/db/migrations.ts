/**
 * Versioned schema migrations. Append new entries; never edit shipped ones.
 * All money is stored as integer minor units (cents) to avoid float drift.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        locale TEXT NOT NULL DEFAULT 'en-US',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('checking','savings','credit','cash','investment')),
        color TEXT NOT NULL,
        opening_balance INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_accounts_user ON accounts(user_id);

      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_categories_user ON categories(user_id);

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        date TEXT NOT NULL,
        payee TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_tx_user_date ON transactions(user_id, date DESC);
      CREATE INDEX idx_tx_account ON transactions(account_id);
      CREATE INDEX idx_tx_to_account ON transactions(to_account_id);
      CREATE INDEX idx_tx_category ON transactions(category_id);

      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL CHECK (amount > 0),
        UNIQUE (user_id, category_id)
      );

      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target INTEGER NOT NULL CHECK (target > 0),
        saved INTEGER NOT NULL DEFAULT 0,
        target_date TEXT,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE recurring (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        cadence TEXT NOT NULL CHECK (cadence IN ('weekly','monthly','yearly')),
        next_date TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_recurring_user ON recurring(user_id, next_date);
    `,
  },
  {
    version: 2,
    name: 'switch_to_npr',
    // Existing users move to Nepalese Rupees with lakh grouping (Rs 12,34,567).
    // This relabels amounts; it does not convert them.
    sql: `UPDATE users SET currency = 'NPR', locale = 'en-IN';`,
  },
];
