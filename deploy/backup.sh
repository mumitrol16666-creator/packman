#!/usr/bin/env bash
# Резервная копия всего, что нельзя восстановить из git: контент, фото, афиши, статистика.
# В cron:  15 4 * * *  bash /opt/pacman/deploy/backup.sh
# Копии лежат на том же сервере, поэтому раз в день их стоит забирать наружу (rsync, Storage Box, S3).
set -euo pipefail

DEST="${BACKUP_DIR:-/var/backups/pacman}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F)"

mkdir -p "$DEST"
docker run --rm \
  -v pacman_pacman-content:/backup/content:ro \
  -v pacman_pacman-photos:/backup/photos:ro \
  -v pacman_pacman-events:/backup/events:ro \
  -v pacman_pacman-data:/backup/data:ro \
  -v "$DEST":/out \
  node:24-bookworm-slim tar czf "/out/pacman-$STAMP.tar.gz" -C /backup .

find "$DEST" -name 'pacman-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
ls -lh "$DEST" | tail -3
