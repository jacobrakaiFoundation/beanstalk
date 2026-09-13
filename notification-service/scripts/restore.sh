#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ ${1:-} != "--confirm" || -z ${2:-} ]]; then
  echo "Usage: restore.sh --confirm /absolute/path/to/backup.sqlite" >&2
  exit 2
fi

backup_path=$2
database_path=${DATABASE_PATH:-/var/lib/beanstalk-notifications/beanstalk-notifications.sqlite}
retention_days=${BACKUP_RETENTION_DAYS:-14}
script_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
quarantine_sql="$script_directory/quarantine-restored.sql"
if [[ $backup_path != /* || $database_path != /* ]]; then
  echo "Backup and database paths must be absolute" >&2
  exit 2
fi
if [[ ! -r $quarantine_sql ]]; then
  echo "Restore quarantine SQL is missing: $quarantine_sql" >&2
  exit 2
fi
if [[ ! $retention_days =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi
database_directory=$(dirname "$database_path")
if [[ $database_directory == / ]]; then
  echo "Database path must be inside a dedicated data directory" >&2
  exit 2
fi
install -d -m 0700 "$database_directory"
chmod 0700 "$database_directory"
for database_file in "$database_path" "$database_path-wal" "$database_path-shm"; do
  [[ ! -e $database_file ]] || chmod 0600 "$database_file"
done
retention_minutes=$(( (retention_days - 1) * 1440 ))
find "$database_directory" -maxdepth 1 -type f -name '*.before-restore-*' -mmin "+$retention_minutes" -delete
sqlite3 "$backup_path" "PRAGMA integrity_check;" | grep -qx ok
restore_candidate=$(mktemp "$database_directory/.restore-candidate.XXXXXX")
cleanup() {
  rm -f "$restore_candidate" "$restore_candidate-wal" "$restore_candidate-shm"
}
trap cleanup EXIT
install -m 0600 "$backup_path" "$restore_candidate"
sqlite3 -bail "$restore_candidate" <"$quarantine_sql"
sqlite3 -bail "$restore_candidate" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;" >/dev/null
rm -f "$restore_candidate-wal" "$restore_candidate-shm"
sqlite3 "$restore_candidate" "PRAGMA integrity_check;" | grep -qx ok
if [[ -f $database_path ]]; then
  install -m 0600 "$database_path" "$database_path.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
fi
rm -f "$database_path-wal" "$database_path-shm"
mv -f "$restore_candidate" "$database_path"
chmod 0600 "$database_path"
sqlite3 "$database_path" "PRAGMA integrity_check;" | grep -qx ok
echo "Restore complete with all restored devices quarantined: $database_path"
