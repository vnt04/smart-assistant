#!/bin/sh
set -eu

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/backups/${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"

mysqldump \
  --host=mysql \
  --user=root \
  --password="${MYSQL_ROOT_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --databases "${MYSQL_DATABASE}" \
  > "${BACKUP_DIR}/mysql.sql"

tar -czf "${BACKUP_DIR}/uploads.tar.gz" -C /uploads .

cat > "${BACKUP_DIR}/manifest.txt" <<EOF
created_at=${TIMESTAMP}
mysql_database=${MYSQL_DATABASE}
retention_days=${RETENTION_DAYS}
EOF

find /backups -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +

printf 'Backup created at %s\n' "${BACKUP_DIR}"


