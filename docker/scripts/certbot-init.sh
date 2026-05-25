#!/bin/sh
set -eu

if [ -z "${APP_DOMAIN:-}" ]; then
  printf 'APP_DOMAIN is required\n' >&2
  exit 1
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  printf 'CERTBOT_EMAIL is required\n' >&2
  exit 1
fi

certbot certonly \
  --standalone \
  --preferred-challenges http \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  -d "${APP_DOMAIN}"
