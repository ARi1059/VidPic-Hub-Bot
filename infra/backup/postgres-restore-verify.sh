#!/usr/bin/env sh

set -eu

backup=${1:?Usage: postgres-restore-verify.sh <backup.dump>}
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compose_file="$project_root/infra/compose/compose.yml"
env_file=${ENV_FILE:-$project_root/.env}
verify_database=film_bot_restore_verify_$(date -u +%Y%m%d%H%M%S)

test -r "$env_file"
test -s "$backup"
if test -r "$backup.sha256"; then
  (cd "$(dirname -- "$backup")" && sha256sum -c "$(basename -- "$backup").sha256")
fi

cleanup() {
  docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
    dropdb --username=film_bot --if-exists "$verify_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  createdb --username=film_bot "$verify_database"
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  pg_restore --username=film_bot --dbname="$verify_database" --no-owner --no-acl < "$backup"

table_count=$(docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  psql --username=film_bot --dbname="$verify_database" --tuples-only --no-align \
  --command="select count(*) from information_schema.tables where table_schema = 'public';")
test "$table_count" -gt 0
printf 'restore_verification=passed\ndatabase=%s\npublic_tables=%s\n' "$verify_database" "$table_count"
