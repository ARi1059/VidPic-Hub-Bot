#!/usr/bin/env bash

set -euo pipefail

app_root="${APP_ROOT:-/opt/vidpic-hub-bot}"
target_release="${1:?Usage: rollback-release.sh <release-name-or-path>}"
api_port="${API_PORT:-}"

if [[ -z "$api_port" && -r /etc/vidpic-hub-bot.env ]]; then
  api_port="$(sed -n 's/^API_PORT=//p' /etc/vidpic-hub-bot.env | head -1)"
fi
api_port="${api_port:-3000}"

if [[ "$target_release" != /* ]]; then
  target_release="$app_root/releases/$target_release"
fi

target_release="$(readlink -f "$target_release")"
test -d "$target_release/api"
test -d "$target_release/bot-worker"
test -d "$target_release/web/dist"

ln -sfn "$target_release" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$app_root/current"

systemctl restart vidpic-api vidpic-bot-worker
systemctl reload nginx

health_response=""
for _ in {1..30}; do
  if health_response="$(curl --fail --silent "http://127.0.0.1:${api_port}/api/health")"; then
    break
  fi
  sleep 1
done
test -n "$health_response"
printf '%s' "$health_response"
printf '\nactive_release=%s\n' "$(readlink -f "$app_root/current")"
