#!/bin/sh
set -eu
umask 077
source_file=/var/lib/crednex/crednex.json
backup_dir=/var/backups/crednex
test -f "$source_file" || exit 0
test "$(realpath "$backup_dir")" = /var/backups/crednex
stamp=$(date -u +%Y%m%dT%H%M%SZ)
gzip -c "$source_file" > "$backup_dir/state-$stamp.json.gz"
gzip -t "$backup_dir/state-$stamp.json.gz"
# Only this application's dated backup files are expired after 30 days.
find "$backup_dir" -maxdepth 1 -type f -name 'state-????????T??????Z.json.gz' -mtime +30 -delete
