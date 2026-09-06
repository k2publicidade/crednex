#!/bin/bash
set -euo pipefail
release="${1:?Usage: install-release.sh /opt/crednex/releases/RELEASE}"
release="$(realpath "$release")"
case "$release" in /opt/crednex/releases/*) ;; *) echo 'Invalid release path' >&2; exit 1;; esac
test -f "$release/build/crednex-server.cjs"
test -f "$release/dist/index.html"
id crednex >/dev/null 2>&1 || useradd --system --home-dir /var/lib/crednex --shell /usr/sbin/nologin crednex
install -d -m 750 -o crednex -g crednex /var/lib/crednex
install -d -m 700 /etc/crednex /var/backups/crednex
if test ! -f /etc/crednex/crednex.env; then
  umask 077
  password="$(openssl rand -hex 24)"
  webhook="$(openssl rand -hex 32)"
  cron="$(openssl rand -hex 32)"
  printf '%s\n' 'NODE_ENV=production' 'PORT=4020' 'CREDNEX_DATA_FILE=/var/lib/crednex/crednex.json' 'CREDNEX_ADMIN_USERNAME=admin' 'CREDNEX_ADMIN_EMAIL=admin@crednex.local' "CREDNEX_ADMIN_PASSWORD=$password" "PIXPAY_WEBHOOK_TOKEN=$webhook" "CRON_SECRET=$cron" 'PIXPAY_BASE_URL=https://webhookxxx.2pp.online' > /etc/crednex/crednex.env
fi
previous="$(readlink -f /opt/crednex/current 2>/dev/null || true)"
ln -sfn "$release" /opt/crednex/current
install -m 644 "$release/deploy/crednex.service" /etc/systemd/system/crednex.service
install -m 644 "$release/deploy/crednex-backup.service" /etc/systemd/system/crednex-backup.service
install -m 644 "$release/deploy/crednex-backup.timer" /etc/systemd/system/crednex-backup.timer
install -m 750 "$release/deploy/backup.sh" /usr/local/sbin/crednex-backup
if test ! -e /etc/nginx/sites-available/crednex; then
  install -m 644 "$release/deploy/nginx-pending.conf" /etc/nginx/sites-available/crednex
  ln -s /etc/nginx/sites-available/crednex /etc/nginx/sites-enabled/crednex
fi
nginx -t
systemctl daemon-reload
systemctl enable crednex crednex-backup.timer nginx >/dev/null
systemctl restart crednex
healthy=0
for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:4020/api/health >/dev/null &&
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' -X DELETE http://127.0.0.1:4020/api/admin/users/deployment-probe)" = 401 &&
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4020/api/admin/deposits/deployment-probe/approve)" = 401 &&
    test "$(curl --silent --output /dev/null --write-out '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4020/api/admin/users/deployment-probe/balance)" = 401; then
    healthy=1; break
  fi
  sleep 1
done
if test "$healthy" = 0; then
  if test -n "$previous" && test "$previous" != /opt/crednex/current && test -d "$previous"; then
    ln -sfn "$previous" /opt/crednex/current
    systemctl restart crednex
  fi
  echo 'Health check failed' >&2
  exit 1
fi
systemctl start crednex-backup.timer
systemctl reload nginx
curl --fail --silent http://127.0.0.1:4020/api/public >/dev/null
systemctl start crednex-backup.service
printf 'RELEASE=%s\n' "$release"
systemctl is-active crednex nginx
