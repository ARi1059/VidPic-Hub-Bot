#!/usr/bin/env sh

set -eu

release_tag=${1:?Usage: rollback-compose.sh <release-tag>}
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
compose_file="$project_root/infra/compose/compose.yml"
env_file=${ENV_FILE:-$project_root/.env}

test -r "$env_file"
test -n "$release_tag"
export RELEASE_TAG="$release_tag"

docker compose --env-file "$env_file" -f "$compose_file" up -d --no-build
docker compose --env-file "$env_file" -f "$compose_file" exec -T api \
  wget -qO- http://localhost:3000/api/health/ready
docker compose --env-file "$env_file" -f "$compose_file" exec -T bot-worker \
  wget -qO- http://localhost:3001/health/ready
printf '\nrollback_release=%s\n' "$release_tag"
