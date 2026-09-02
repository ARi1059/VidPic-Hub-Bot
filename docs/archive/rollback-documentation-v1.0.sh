#!/bin/sh
set -eu

mode="apply"
if [ "${1:-}" = "--check" ]; then
  mode="check"
  shift
fi

if [ "$#" -gt 0 ]; then
  root=$1
else
  script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  root=$(CDPATH= cd -- "$script_dir/.." && pwd)
fi

requirements="$root/docs/requirements.md"
technical="$root/docs/technical-development.md"

expected_requirements="4aea3fd68001ebdb55bec346eaebc4eb25f2181891985d341a43426d515c66f9"
expected_technical="3700643100278aaa7377fba224d7030a172d4e2ef6902e6c134e58ed465cad94"

verify_file() {
  path=$1
  expected=$2

  if [ ! -f "$path" ]; then
    printf 'missing: %s\n' "$path" >&2
    exit 1
  fi

  actual=$(shasum -a 256 "$path" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    printf 'changed: %s\n' "$path" >&2
    exit 1
  fi
}

verify_file "$requirements" "$expected_requirements"
verify_file "$technical" "$expected_technical"

if [ "$mode" = "check" ]; then
  printf 'rollback check passed: %s\n' "$root"
  exit 0
fi

rm -f \
  "$requirements" \
  "$technical" \
  "$root/docs/documentation.patch" \
  "$root/docs/verification-record.md"

printf 'documentation rollback completed: %s\n' "$root"
