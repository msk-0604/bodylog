#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL database and runs RLS/constraint tests.
#
# Usage:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/db-test.sh
# The target database is DROPPED and recreated as "bodylog_test" on that server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${DATABASE_URL:?DATABASE_URL is required (server admin connection)}"
TEST_DB="bodylog_test"
TEST_URL="${BASE_URL%/*}/${TEST_DB}"

psql "$BASE_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists ${TEST_DB}" -c "create database ${TEST_DB}"

run() { psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

run "$ROOT/supabase/local-tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  run "$f"
done
# Food import SQL (fictional fixture rows), imported twice to check idempotency.
node "$ROOT/scripts/foods/testing/fixture-sql.ts" fixture-v1 2>/dev/null | psql "$TEST_URL" -v ON_ERROR_STOP=1 -q
node "$ROOT/scripts/foods/testing/fixture-sql.ts" fixture-v2 2>/dev/null | psql "$TEST_URL" -v ON_ERROR_STOP=1 -q
echo "import: food fixture (v1, v2)"

for f in "$ROOT"/supabase/local-tests/[1-9]*.sql; do
  echo "test: $(basename "$f")"
  run "$f"
done
