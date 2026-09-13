#!/usr/bin/env bash
set -euo pipefail

database_path=${DATABASE_PATH:-/var/lib/beanstalk-notifications/beanstalk-notifications.sqlite}
backup_directory=${BACKUP_DIRECTORY:-/var/backups/beanstalk-notifications}
retention_days=${BACKUP_RETENTION_DAYS:-14}

if [[ $database_path == *"'"* || $backup_directory == *"'"* ]]; then
  echo "Paths containing a single quote are not supported" >&2
  exit 2
fi
if [[ ! $retention_days =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi

install -d -m 0700 "$backup_directory"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="$backup_directory/beanstalk-notifications-$timestamp.sqlite"
cleanup_sidecars() {
  rm -f "$destination-wal" "$destination-shm"
}
trap cleanup_sidecars EXIT
sqlite3 "$database_path" ".timeout 5000" ".backup '$destination'"
chmod 0600 "$destination"
sqlite3 -bail "$destination" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;" >/dev/null
cleanup_sidecars
sqlite3 "$destination" "PRAGMA integrity_check;" | grep -qx ok
retention_minutes=$(( (retention_days - 1) * 1440 ))
find "$backup_directory" -maxdepth 1 -type f -name 'beanstalk-notifications-*.sqlite' -mmin "+$retention_minutes" -delete
echo "$destination"
