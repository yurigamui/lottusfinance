#!/usr/bin/env bash
# Testa as migrações de supabase/migrations num Postgres LOCAL descartável (nunca no Supabase).
# Uso: scripts/test-db.sh            (precisa de initdb/pg_ctl/psql do PostgreSQL 15+)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"; PORT="${PG_PORT:-54330}"
RUN=(); [ "$(id -u)" = 0 ] && { chown postgres "$WORK"; chmod 755 "$WORK"; RUN=(su postgres -c); }
q() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi; }
q "$BIN/initdb -D $WORK/data -A trust -U postgres >/dev/null"
q "$BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start >/dev/null"
trap 'q "$BIN/pg_ctl -D $WORK/data -m fast stop >/dev/null" || true; rm -rf "$WORK"' EXIT
export PGOPTIONS="-c client_min_messages=warning"
P=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)
"${P[@]}" -f "$ROOT/supabase/tests/_stub_wealth.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do echo "· aplicando $(basename "$m")"; "${P[@]}" -f "$m"; done
for m in "$ROOT"/supabase/migrations/*.sql; do "${P[@]}" -f "$m"; done   # idempotência
echo "· migrações reaplicadas sem erro (idempotentes)"
for t in "$ROOT"/supabase/tests/[!_]*.sql; do echo "· teste $(basename "$t")"; PGOPTIONS="" "${P[@]}" -t -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^NOTICE:  /  /' | grep -v '^\s*$'; done
