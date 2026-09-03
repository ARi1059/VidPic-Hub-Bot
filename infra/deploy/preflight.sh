#!/usr/bin/env sh

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compose_file="$project_root/infra/compose/compose.yml"
env_file=${ENV_FILE:-$project_root/.env}

test -r "$env_file"
command -v docker >/dev/null
docker compose version >/dev/null

required='POSTGRES_PASSWORD REDIS_PASSWORD BOT_TOKEN BOT_USERNAME TELEGRAM_STORAGE_CHAT_ID TELEGRAM_WEBHOOK_SECRET SESSION_SECRET MEDIA_SIGNING_SECRET MINI_APP_DOMAIN ADMIN_APP_DOMAIN API_DOMAIN ACME_EMAIL'
for name in $required; do
  value=$(sed -n "s/^$name=//p" "$env_file" | tail -1)
  if test -z "$value" || printf '%s' "$value" | grep -Eqi 'replace|example\.com|0000000000'; then
    printf 'invalid or missing environment variable: %s\n' "$name" >&2
    exit 1
  fi
done

node_env=$(sed -n 's/^NODE_ENV=//p' "$env_file" | tail -1)
webhook=$(sed -n 's/^BOT_USE_WEBHOOK=//p' "$env_file" | tail -1)
test "$node_env" = production
test "$webhook" = true
if grep -Eq '^VITE_ENABLE_MOCKS=true$' "$env_file"; then
  printf 'VITE_ENABLE_MOCKS must not be true in production\n' >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
printf 'preflight=passed\ncompose=%s\nenvironment=%s\n' "$compose_file" "$env_file"
