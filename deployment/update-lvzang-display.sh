#!/bin/bash
set -euo pipefail
cd /home/ubuntu/apps/lvzang
test -f .lvzang-only
test "$(pwd -P)" = /home/ubuntu/apps/lvzang
before=$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)
old_pid=$(systemctl show shiguang.service -p MainPID --value)
backup="output/deployment-backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
tar -czf "$backup/display-before.tgz" server.js server-library.js collection-jobs.js public/src/server-keepsake-store.js public/src/collection-generation.js public/src/travel-gallery.js public/travel-gallery.css
tar -xzf lvzang-display-fix.tgz
node --check server.js
node --check server-library.js
node --check public/src/travel-gallery.js
sudo systemctl restart lvzang.service
sleep 2
systemctl is-active lvzang.service
curl -fsS --max-time 15 https://lvzang.gzaibuilders.cn/api/auth/me
test "$before" = "$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)"
test "$old_pid" = "$(systemctl show shiguang.service -p MainPID --value)"
echo '旅藏展示修复已更新，旧代码已备份；拾光配置和进程不变。'
