#!/usr/bin/env bash
# Backs up the database (pg_dump custom format) and uploaded photos of the running stack.
# Usage: scripts/backup.sh [backup-dir]   (default /var/backups/smartasset, keeps 14 days)
# Cron:  30 2 * * * cd /opt/smartasset && scripts/backup.sh >> /var/log/smartasset-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
dest="${1:-/var/backups/smartasset}"
keep_days="${KEEP_DAYS:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$dest"
docker compose exec -T db pg_dump -U inventory_owner -d inventory -Fc > "$dest/db-$stamp.dump"
docker compose exec -T api tar -C /data/media -czf - . > "$dest/media-$stamp.tgz"

find "$dest" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'media-*.tgz' \) -mtime +"$keep_days" -delete
echo "$(date -Is) backup ok: $dest/db-$stamp.dump $dest/media-$stamp.tgz"
