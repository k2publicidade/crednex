#!/bin/bash
set -euo pipefail
ip=178.105.216.86
test -f /etc/nginx/sites-available/crednex
test -f /root/crednex-gateway.env
apt-get install -y --no-install-recommends python3-venv >/tmp/crednex-acme-install.log 2>&1
test -x /opt/crednex-acme/bin/python || python3 -m venv /opt/crednex-acme
/opt/crednex-acme/bin/pip install --quiet 'certbot>=5.4,<6'
install -d -m 755 /var/www/crednex-acme
cp -a /etc/nginx/sites-available/crednex /etc/nginx/sites-available/crednex.before-https
cat >/etc/nginx/sites-available/crednex <<'NGINX'
server {
    listen 80;
    server_name 178.105.216.86;
    root /opt/crednex/current/deploy/pending;
    location ^~ /.well-known/acme-challenge/ { root /var/www/crednex-acme; }
    location = /brand.jpeg { alias /opt/crednex/current/dist/brand/crednex.jpeg; }
    location /api/ { return 503; }
    location / { try_files $uri /index.html; }
}
NGINX
nginx -t
systemctl reload nginx
/opt/crednex-acme/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --preferred-profile shortlived --webroot -w /var/www/crednex-acme --ip-address "$ip" --cert-name crednex-ip --dry-run
/opt/crednex-acme/bin/certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --preferred-profile shortlived --webroot -w /var/www/crednex-acme --ip-address "$ip" --cert-name crednex-ip
cat >/etc/nginx/sites-available/crednex <<'NGINX'
server {
    listen 80;
    server_name 178.105.216.86;
    location ^~ /.well-known/acme-challenge/ { root /var/www/crednex-acme; }
    location / { return 301 https://178.105.216.86$request_uri; }
}
server {
    listen 443 ssl;
    server_name 178.105.216.86;
    ssl_certificate /etc/letsencrypt/live/crednex-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crednex-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    server_tokens off;
    client_max_body_size 64k;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    location / {
        proxy_pass http://127.0.0.1:4020;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
    }
    location ^~ /api/webhooks/ {
        access_log off;
        proxy_pass http://127.0.0.1:4020;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX
python3 - <<'PY'
from pathlib import Path
config=Path('/etc/crednex/crednex.env')
values=dict(line.split('=',1) for line in config.read_text().splitlines() if '=' in line and not line.startswith('#'))
gateway=dict(line.split('=',1) for line in Path('/root/crednex-gateway.env').read_text().splitlines() if '=' in line)
required={'PIXPAY_API_KEY','PIXPAY_API_SECRET','PIXPAY_BASE_URL','APP_PUBLIC_URL'}
if set(gateway)!=required or not all(gateway.values()): raise SystemExit('Invalid gateway configuration')
values.update(gateway)
config.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n')
config.chmod(0o600)
PY
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx\n' >/etc/letsencrypt/renewal-hooks/deploy/crednex-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/crednex-nginx
cat >/etc/systemd/system/crednex-cert-renew.service <<'UNIT'
[Unit]
Description=Renew CREDNEX IP certificate
[Service]
Type=oneshot
ExecStart=/opt/crednex-acme/bin/certbot renew --cert-name crednex-ip --quiet
UNIT
cat >/etc/systemd/system/crednex-cert-renew.timer <<'UNIT'
[Unit]
Description=Check CREDNEX certificate twice daily
[Timer]
OnCalendar=*-*-* 00,12:00:00 UTC
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
UNIT
# Avoid the older distribution Certbot attempting to renew a newer IP profile.
systemctl disable --now certbot.timer
systemctl daemon-reload
systemctl enable --now crednex-cert-renew.timer
nginx -t
systemctl restart crednex
systemctl reload nginx
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent https://178.105.216.86/api/health
printf '\nHTTPS_AND_GATEWAY_CONFIGURED\n'
