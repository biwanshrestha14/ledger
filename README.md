# Ledger: Personal Finance Tracker

A calm, private personal finance tracker you host yourself. It's an installable PWA with an Apple-style interface (system type, grouped surfaces, glass navigation, light and dark modes) backed by a NestJS API and SQLite.

```
Browser (React PWA) → Nginx (static files + /api proxy) → NestJS API → SQLite
```

## Features

- **Overview:** net worth with a 12-month trend, spending pace compared with last month, spending by category, budgets, upcoming bills, cash flow and a plain-language insight.
- **Transactions:** quick entry (press `N` anywhere), payee autocomplete that remembers categories, expense/income/transfer types, search (`/`), filters, grouping by day, bulk categorize/delete, and undo on add and delete.
- **Budgets:** monthly limits per category, a marker for today, a "spending fast" warning, a daily allowance and suggestions based on last month.
- **Accounts:** checking, savings, credit, cash and investment accounts, with live balances, assets and debts, and archiving.
- **Goals:** savings targets with progress rings and the monthly amount needed to hit a date.
- **Bills:** recurring expenses and income. Mark one paid in one tap and it records the transaction and advances the due date.
- **Categories:** custom colors and icons, plus archiving.
- **Data:** CSV import with column mapping and preview, CSV export, a full JSON backup, sample data and Erase All Data.
- **Settings:** Nepalese Rupees (Rs, lakh grouping) by default, plus 16 other currencies, appearance (Auto/Light/Dark), password change and account deletion.

## Production-readiness

- Money is stored as **integer minor units**, so there's no floating-point drift.
- **httpOnly, SameSite cookie sessions** use hashed tokens stored server-side, so they can be revoked. Changing the password signs out other devices.
- Passwords are hashed with bcrypt, and failed logins take the same time whether or not the email exists.
- Rate limits apply globally and are tighter on auth.
- All input is validated and stripped of unknown fields. Every query is scoped per user (covered by tests).
- Helmet and Nginx set security headers, including a strict CSP.
- CSV export guards against formula injection.
- **Versioned SQL migrations**, WAL mode and foreign keys on.
- PWA: works offline for recent data, auto-updates, and installs on iOS, Android and desktop.
- Accessible: keyboard navigation, focus rings, focus-trapped dialogs, labels, `prefers-reduced-motion` / `prefers-contrast` / `prefers-reduced-transparency`.

## Run in production (Docker)

```sh
docker compose up -d --build        # → http://localhost:8080
PORT=80 docker compose up -d        # choose another port
```

Data lives in the `ledger-data` volume. Put the stack behind HTTPS (Caddy, Traefik or a cloud load balancer), then set `COOKIE_SECURE=true`:

```sh
COOKIE_SECURE=true docker compose up -d
```

**Backups:** `./deploy/backup.sh ./backups` writes a consistent snapshot of the live database. Each user can also download a JSON backup from Settings.

## Deploy to a small VPS with HTTPS (e.g. Oracle Cloud free tier, 1 GB)

`docker-compose.prod.yml` adds Caddy in front of Nginx for automatic Let's Encrypt HTTPS and caps memory (about 175 MB used in total).

1. **DNS:** add an `A` record for your subdomain pointing at the server's public IP.
2. **Oracle firewall:** in the VCN subnet's security list, allow ingress TCP 80 and 443 from `0.0.0.0/0`.
3. **Copy the code** from your computer:
   `rsync -av --exclude node_modules --exclude dist --exclude apps/api/data -e "ssh -i KEY" ./ ubuntu@IP:~/ledger/`
4. **On the server:** `sudo bash ~/ledger/deploy/server-setup.sh` (swap, Docker, OS firewall), log out and back in, then:
   ```sh
   cd ~/ledger
   echo "DOMAIN=ledger.example.com" > .env
   docker compose -f docker-compose.prod.yml up -d --build
   ```
5. **Nightly backups:** `crontab -e` →
   `0 3 * * * cd ~/ledger && ./deploy/backup.sh ~/backups docker-compose.prod.yml >> ~/backups/backup.log 2>&1`

To update, re-run the `rsync` and then `docker compose -f docker-compose.prod.yml up -d --build`.

## Develop

Requires Node 22+ (24 recommended).

```sh
npm install
npm run dev --workspace apps/api    # API on :3000 (DB at apps/api/data/ledger.db)
npm run dev --workspace apps/web    # App on :5173, proxies /api → :3000
npm test                            # API end-to-end tests
npm run build                       # production builds of both
```

## Layout

```
apps/api     NestJS + better-sqlite3 (src/<feature>/…, db/migrations.ts)
apps/web     React 19 + Vite + TanStack Query + Recharts + vite-plugin-pwa
  src/styles/tokens.css   design tokens (Apple HIG values)
  src/styles/app.css      app styles built only from tokens
deploy/      Nginx config, Dockerfiles, backup script
```

To change the schema, append a new entry to `apps/api/src/db/migrations.ts`. Migrations run automatically on startup.
