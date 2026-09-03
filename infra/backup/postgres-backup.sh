#!/usr/bin/env sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compose_file="$project_root/infra/compose/compose.yml"
env_file=${ENV_FILE:-$project_root/.env}
backup_dir=${BACKUP_DIR:-$project_root/backups/postgres}
retention_days=${BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
filename=film_bot-$timestamp.dump
output=$backup_dir/$filename

test -r "$env_file"
mkdir -p "$backup_dir"
umask 077

docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  pg_dump --username=film_bot --dbname=film_bot --format=custom --no-owner --no-acl > "$output"
test -s "$output"
(cd "$backup_dir" && sha256sum "$filename" > "$filename.sha256")
find "$backup_dir" -type f -name 'film_bot-*.dump*' -mtime "+$retention_days" -delete

printf 'backup=%s\nchecksum=%s\n' "$output" "$output.sha256"
printf '请将备份及校验文件同步到 VPS 之外的加密存储。\n'
