#!/bin/bash
set -euo pipefail
cd /home/ubuntu/apps/lvzang
test -f .lvzang-only
test "$(pwd -P)" = /home/ubuntu/apps/lvzang
stage=/tmp/lvzang-integrated-20261008
backup="/home/ubuntu/apps/lvzang-backups/integration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
before=$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)
old_pid=$(systemctl show shiguang.service -p MainPID --value)
while IFS= read -r file; do
  case "$file" in /*|*..*|output/*|.env*) echo 'Unsafe release path'; exit 1;; esac
  if test -f "$file"; then printf '%s\n' "$file"; fi
done < "$stage/files.txt" > "$backup/existing.txt"
tar -czf "$backup/source-before.tgz" -T "$backup/existing.txt"
cp -p .env "$backup/env-before"
rollback() {
  trap - ERR
  sudo systemctl stop lvzang.service
  tar -xzf "$backup/source-before.tgz"
  cp -p "$backup/env-before" .env
  sudo systemctl reset-failed lvzang.service
  sudo systemctl start lvzang.service
  echo "Release failed; previous source restored. Backup: $backup"
  exit 1
}
trap rollback ERR
sudo systemctl stop lvzang.service
tar --exclude=output/library/blobs --exclude=output/deployment-backups -czf "$backup/data-before.tgz" output/accounts output/library
tar -xzf "$stage/update.tgz"
sha256sum -c "$stage/after.sha256" > "$backup/verification.txt"
node --input-type=module <<'JS'
import fs from 'node:fs';
const additions=fs.readFileSync('/tmp/lvzang-amap-20261008.env','utf8').trim().split(/\r?\n/);
if(additions.length!==2||!additions.every(line=>/^(AMAP_JS_API_KEY|AMAP_SECURITY_JS_CODE)=[a-f0-9]{32}$/.test(line)))throw Error('Invalid private map configuration');
const original=fs.readFileSync('.env','utf8').split(/\r?\n/).filter(line=>!/^AMAP_(JS_API_KEY|SECURITY_JS_CODE)=/.test(line));
fs.writeFileSync('.env',[...original,...additions,''].join('\n'),{mode:0o600});
fs.chmodSync('.env',0o600);
fs.unlinkSync('/tmp/lvzang-amap-20261008.env');
JS
node --check server.js
sudo systemctl reset-failed lvzang.service
sudo systemctl start lvzang.service
for attempt in {1..20}; do
  if curl -fsS --max-time 3 http://127.0.0.1:4182/api/auth/me > /dev/null; then break; fi
  sleep 1
done
systemctl is-active lvzang.service
curl -fsS --max-time 10 http://127.0.0.1:4182/api/auth/me > /dev/null
test "$before" = "$(sudo sha256sum /etc/nginx/sites-enabled/gzaibuilders.cn /etc/nginx/snippets/shiguang.conf)"
test "$old_pid" = "$(systemctl show shiguang.service -p MainPID --value)"
trap - ERR
echo "Integrated release active. Data retained. Backup: $backup"
