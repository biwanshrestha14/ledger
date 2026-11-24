#!/usr/bin/env sh
# Online, consistent SQLite backup from the running container.
# Usage: ./deploy/backup.sh [output-dir] [compose-file]
#   e.g. ./deploy/backup.sh ~/backups docker-compose.prod.yml
set -eu
OUT="${1:-./backups}"
FILE="${2:-docker-compose.yml}"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose -f "$FILE" exec -T api node -e "
  const D=require('better-sqlite3'); const db=new D(process.env.DATABASE_PATH, { readonly: true });
  db.backup('/data/backup.db').then(()=>console.log('ok'));"
docker compose -f "$FILE" cp api:/data/backup.db "$OUT/ledger-$STAMP.db"
docker compose -f "$FILE" exec -T api rm -f /data/backup.db
# Keep the 14 most recent backups.
ls -1t "$OUT"/ledger-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Saved $OUT/ledger-$STAMP.db"
