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
update_patch="$root/docs/documentation.patch"
archive_dir="$root/docs/archive"

expected_requirements="360b624d2dc9a6c1ec397b2bfb21f702662af3a9a534897935e09592b9e82fdf"
expected_technical="c8ffce376f8a5405d955bd542e483feadcf1ef21cf5594d17053566197c31b59"
expected_patch="6ece0d7eb63940fbc217744d77515745f974b4732bb4f6c46c8d9c0014c85c15"

v1_requirements="4aea3fd68001ebdb55bec346eaebc4eb25f2181891985d341a43426d515c66f9"
v1_technical="3700643100278aaa7377fba224d7030a172d4e2ef6902e6c134e58ed465cad94"

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
verify_file "$update_patch" "$expected_patch"
verify_file "$archive_dir/documentation-v1.0.patch" "15b3885a05c40388f4e46e396ee1184ff29ae92dfa5b1f1857eaa73a4ad92fac"
verify_file "$archive_dir/verification-record-v1.0.md" "9e497f11cebab9f47cccc0b93e7de738fda401a9f2aba5aadb822fe94cb44ee8"
verify_file "$archive_dir/rollback-documentation-v1.0.sh" "f7c5bd19eb7b860fbd3a5acfd244e492f24eeeffe8ce4c178e33ee7955f38d7f"

if [ "$mode" = "check" ]; then
  printf 'rollback check passed: %s\n' "$root"
  exit 0
fi

patch -R -d "$root" -p0 < "$update_patch"

verify_file "$requirements" "$v1_requirements"
verify_file "$technical" "$v1_technical"

cp "$archive_dir/documentation-v1.0.patch" "$root/docs/documentation.patch"
cp "$archive_dir/verification-record-v1.0.md" "$root/docs/verification-record.md"
cp "$archive_dir/rollback-documentation-v1.0.sh" "$root/scripts/rollback-documentation.sh"
chmod +x "$root/scripts/rollback-documentation.sh"

printf 'documentation rollback completed: 1.1 -> 1.0 at %s\n' "$root"
