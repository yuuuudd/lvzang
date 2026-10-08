#!/bin/bash
set -euo pipefail
cd /home/ubuntu/apps/lvzang
test "$(pwd -P)" = /home/ubuntu/apps/lvzang
test -f .lvzang-only
# Never replace a configuration that was not created for this application.
for path in /etc/systemd/system/lvzang.service /etc/nginx/sites-available/lvzang-http.conf /etc/nginx/sites-available/lvzang-https.conf; do
  if test -e "$path"; then grep -q '^# Managed by lvzang deployment only' "$path"; fi
done
before=$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)
old_pid=$(systemctl show shiguang.service -p MainPID --value)
chmod 600 .env release.tgz
mkdir -p output
sudo install -d -m 755 /var/www/lvzang-acme
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node deployment/bootstrap-account.mjs
sudo install -m 644 deployment/lvzang.service /etc/systemd/system/lvzang.service
sudo install -m 644 deployment/lvzang-http.conf /etc/nginx/sites-available/lvzang-http.conf
sudo ln -sfn /etc/nginx/sites-available/lvzang-http.conf /etc/nginx/sites-enabled/lvzang-http.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/lvzang-acme -d lvzang.gzaibuilders.cn --non-interactive --agree-tos --register-unsafely-without-email
sudo install -m 644 deployment/lvzang-https.conf /etc/nginx/sites-available/lvzang-https.conf
sudo ln -sfn /etc/nginx/sites-available/lvzang-https.conf /etc/nginx/sites-enabled/lvzang-https.conf
sudo systemctl daemon-reload
sudo systemctl enable --now lvzang.service
sudo nginx -t
sudo systemctl reload nginx
test "$before" = "$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)"
test "$old_pid" = "$(systemctl show shiguang.service -p MainPID --value)"
echo '旅藏独立部署完成；拾光配置与进程未变动。'
