#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /backups/YYYYMMDDTHHMMSSZ\n' "$0" >&2
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -f "${BACKUP_DIR}/mysql.sql" ]; then
  printf 'Missing mysql dump: %s/mysql.sql\n' "${BACKUP_DIR}" >&2
  exit 1
fi

if [ ! -f "${BACKUP_DIR}/uploads.tar.gz" ]; then
  printf 'Missing uploads archive: %s/uploads.tar.gz\n' "${BACKUP_DIR}" >&2
  exit 1
fi

mysql \
  --host=mysql \
  --user=root \
  --password="${MYSQL_ROOT_PASSWORD}" \
  < "${BACKUP_DIR}/mysql.sql"

rm -rf /uploads/*
tar -xzf "${BACKUP_DIR}/uploads.tar.gz" -C /uploads

printf 'Restored backup from %s\n' "${BACKUP_DIR}"
