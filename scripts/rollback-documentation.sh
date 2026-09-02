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

expected_requirements="59dfa6ac775fe20a5de8f73a4b097ff37f2f9283a822efe5ead3c545964a2a7d"
expected_technical="e2233db3625dbb5e15f8b76c91aa0be4676348362ecba781b3a4d1776dd76db0"
expected_patch="5a4bc21ad9bf97cfd6a966a013919e39f461c3fb97f87ad0ce7f96f920ae1e3d"

v12_requirements="fa05c760e09c18a04b1e54eb59d163546f3fb79f067866fc51381b0e76b387b5"
v12_technical="d3c850b6d9d4cd108b7584dcdb41003f6d1a4deb2f7fb9650d9eacb7f5876c2c"

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
verify_file "$archive_dir/requirements-v1.2.md" "$v12_requirements"
verify_file "$archive_dir/technical-development-v1.2.md" "$v12_technical"
verify_file "$archive_dir/documentation-v1.2.patch" "6a1378b86e5b26ae72c442d30b414adfc8ff253833c62a6e5d997265bf72920b"
verify_file "$archive_dir/verification-record-v1.2.md" "d11f681d8acaf1c31c35a3c3eb05835e71eb5c4e71247a6b7e3a9fb3032ea244"
verify_file "$archive_dir/rollback-documentation-v1.2.sh" "12e4ea7116fde76eddcece753f0523a2273692a9500aa21b0722b202387e811a"

if [ "$mode" = "check" ]; then
  printf 'rollback check passed: %s\n' "$root"
  exit 0
fi

patch -R -d "$root" -p0 < "$update_patch"

verify_file "$requirements" "$v12_requirements"
verify_file "$technical" "$v12_technical"

cp "$archive_dir/documentation-v1.2.patch" "$root/docs/documentation.patch"
cp "$archive_dir/verification-record-v1.2.md" "$root/docs/verification-record.md"
cp "$archive_dir/rollback-documentation-v1.2.sh" "$root/scripts/rollback-documentation.sh.v12"
chmod +x "$root/scripts/rollback-documentation.sh.v12"

printf 'documentation rollback completed: 1.3 -> 1.2 at %s\n' "$root"
mv "$root/scripts/rollback-documentation.sh.v12" "$root/scripts/rollback-documentation.sh"
