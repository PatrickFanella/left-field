#!/bin/sh
set -eu

prometheus_config=${PROMETHEUS_CONFIG:-/srv/apps/monitoring/config/prometheus/prometheus.yml}
source_rules=${SOURCE_RULES:-$(dirname "$0")/dsa-seats-alerts.yml}
installed_rules=${INSTALLED_RULES:-/srv/apps/monitoring/config/prometheus/alerts/dsa-seats-alerts.yml}
rule_reference=${PROMETHEUS_RULE_REFERENCE:-/etc/prometheus/alerts/dsa-seats-alerts.yml}
prometheus_container=${PROMETHEUS_CONTAINER:-prometheus}
docker_bin=${DOCKER:-docker}
registration_lock=${PROMETHEUS_RULES_LOCK:-$(dirname "$prometheus_config")/.dsa-seats-rules-registration.lock}
container_rules=/tmp/dsa-seats-alerts.candidate.$$.yml
container_config=/tmp/dsa-seats-prometheus.candidate.$$.yml

exec 9>"$registration_lock"
flock -n 9 || { echo "Another Prometheus rule registration is in progress" >&2; exit 1; }

[ -f "$prometheus_config" ] || { echo "Prometheus config not found" >&2; exit 1; }
[ -f "$source_rules" ] || { echo "Left Field rules not found" >&2; exit 1; }

config_dir=$(dirname "$prometheus_config")
rules_dir=$(dirname "$installed_rules")
install -d -m 0755 "$rules_dir"
config_candidate=$(mktemp "$config_dir/.prometheus.yml.dsa-seats.XXXXXX")
validation_config=$(mktemp "$config_dir/.prometheus.yml.dsa-seats-validation.XXXXXX")
rules_candidate=$(mktemp "$rules_dir/.dsa-seats-alerts.XXXXXX")
config_backup=$(mktemp "$config_dir/.prometheus.yml.dsa-seats-backup.XXXXXX")
rules_backup=$(mktemp "$rules_dir/.dsa-seats-alerts-backup.XXXXXX")
had_rules=0
commit_started=0
commit_complete=0

rollback() {
  mv -f "$config_backup" "$prometheus_config"
  if [ "$had_rules" -eq 1 ]; then mv -f "$rules_backup" "$installed_rules"; else rm -f "$installed_rules"; fi
}
cleanup() {
  status=$?
  if [ "$commit_started" -eq 1 ] && [ "$commit_complete" -eq 0 ]; then rollback; fi
  "$docker_bin" exec "$prometheus_container" rm -f "$container_rules" "$container_config" >/dev/null 2>&1 || true
  rm -f "$config_candidate" "$validation_config" "$rules_candidate" "$config_backup" "$rules_backup"
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

cp -p "$prometheus_config" "$config_backup"
if [ -f "$installed_rules" ]; then cp -p "$installed_rules" "$rules_backup"; had_rules=1; fi
cp "$source_rules" "$rules_candidate"
chmod 0644 "$rules_candidate"

if grep -Fqx "  - $rule_reference" "$prometheus_config"; then
  cp "$prometheus_config" "$config_candidate"
else
  grep -Fqx "rule_files:" "$prometheus_config" || { echo "Prometheus rule_files section not found" >&2; exit 1; }
  grep -Fqx "scrape_configs:" "$prometheus_config" || { echo "Prometheus scrape_configs section not found" >&2; exit 1; }
  awk -v rule="  - $rule_reference" '
    /^scrape_configs:$/ && !inserted { print rule; inserted=1 }
    { print }
    END { if (!inserted) exit 1 }
  ' "$prometheus_config" > "$config_candidate"
fi
chmod 0644 "$config_candidate"
sed "s|$rule_reference|$container_rules|g" "$config_candidate" > "$validation_config"
chmod 0644 "$validation_config"

"$docker_bin" cp "$rules_candidate" "$prometheus_container:$container_rules"
"$docker_bin" cp "$validation_config" "$prometheus_container:$container_config"
"$docker_bin" exec "$prometheus_container" promtool check rules "$container_rules" >/dev/null
"$docker_bin" exec "$prometheus_container" promtool check config "$container_config" >/dev/null

commit_started=1
mv -f "$rules_candidate" "$installed_rules"
mv -f "$config_candidate" "$prometheus_config"
commit_complete=1

echo "Left Field Prometheus rules registered; restart Prometheus to activate the atomically replaced config."
