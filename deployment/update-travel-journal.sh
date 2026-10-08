#!/bin/bash
set -euo pipefail
cd /home/ubuntu/apps/lvzang
test -f .lvzang-only
test "$(pwd -P)" = /home/ubuntu/apps/lvzang
stage=/tmp/lvzang-travel-journal-20261008
# Refuse to overwrite a live edit made since the reviewed base revision.
sha256sum -c "$stage/before.sha256"
backup="/home/ubuntu/apps/lvzang-backups/travel-journal-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
while IFS= read -r file; do
  case "$file" in public/travel.html|public/travel-journal.css|public/src/travel.js|public/src/travel-guide-layout.js|public/src/travel-workspace.js|server.js) ;;
    *) echo 'Unexpected release path'; exit 1;; esac
  if test -f "$file"; then printf '%s\n' "$file"; fi
done < "$stage/files.txt" > "$backup/existing.txt"
tar -czf "$backup/source-before.tgz" -T "$backup/existing.txt"
old_pid=$(systemctl show shiguang.service -p MainPID --value)
rollback() {
  trap - ERR
  tar -xzf "$backup/source-before.tgz"
  sudo systemctl restart lvzang.service
  echo "Release failed; previous source restored. Backup: $backup"
  exit 1
}
trap rollback ERR
tar -xzf "$stage/update.tgz"
sha256sum -c "$stage/after.sha256" > "$backup/verification.txt"
node --check server.js
sudo systemctl restart lvzang.service
for attempt in {1..20}; do
  if curl -fsS --max-time 3 http://127.0.0.1:4182/api/auth/me > /dev/null; then break; fi
  sleep 1
done
systemctl is-active lvzang.service
curl -fsS --max-time 10 http://127.0.0.1:4182/api/auth/me > /dev/null
curl -fsS --max-time 10 http://127.0.0.1:4182/travel-journal.css > /dev/null
test "$old_pid" = "$(systemctl show shiguang.service -p MainPID --value)"
trap - ERR
echo "Travel journal release active. Accounts, work library and private configuration unchanged. Backup: $backup"
