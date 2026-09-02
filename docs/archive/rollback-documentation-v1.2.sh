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

expected_requirements="fa05c760e09c18a04b1e54eb59d163546f3fb79f067866fc51381b0e76b387b5"
expected_technical="d3c850b6d9d4cd108b7584dcdb41003f6d1a4deb2f7fb9650d9eacb7f5876c2c"
expected_patch="6a1378b86e5b26ae72c442d30b414adfc8ff253833c62a6e5d997265bf72920b"

v11_requirements="360b624d2dc9a6c1ec397b2bfb21f702662af3a9a534897935e09592b9e82fdf"
v11_technical="c8ffce376f8a5405d955bd542e483feadcf1ef21cf5594d17053566197c31b59"

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
verify_file "$archive_dir/requirements-v1.1.md" "$v11_requirements"
verify_file "$archive_dir/technical-development-v1.1.md" "$v11_technical"
verify_file "$archive_dir/documentation-v1.1.patch" "6ece0d7eb63940fbc217744d77515745f974b4732bb4f6c46c8d9c0014c85c15"
verify_file "$archive_dir/verification-record-v1.1.md" "3230116aa55920f47a4104580d7f6f431ec89ca5d511898feffb3f749b435fbb"
verify_file "$archive_dir/rollback-documentation-v1.1.sh" "dda722c841466edd4d229ce693f5287d122723783910ecd7c7bfb06f51baad72"

if [ "$mode" = "check" ]; then
  printf 'rollback check passed: %s\n' "$root"
  exit 0
fi

patch -R -d "$root" -p0 < "$update_patch"

verify_file "$requirements" "$v11_requirements"
verify_file "$technical" "$v11_technical"

cp "$archive_dir/documentation-v1.1.patch" "$root/docs/documentation.patch"
cp "$archive_dir/verification-record-v1.1.md" "$root/docs/verification-record.md"
cp "$archive_dir/rollback-documentation-v1.1.sh" "$root/scripts/rollback-documentation.sh.v11"
chmod +x "$root/scripts/rollback-documentation.sh.v11"

printf 'documentation rollback completed: 1.2 -> 1.1 at %s\n' "$root"
mv "$root/scripts/rollback-documentation.sh.v11" "$root/scripts/rollback-documentation.sh"
