#!/usr/bin/env bash
set -Eeuo pipefail

readonly BACKUP_ROOT="${BACKUP_ROOT:-/srv/server/backups/dsa-seats-r1}"
readonly POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-dsa-seats-r1-postgres-1}"
readonly RAWSTORE_CONTAINER="${RAWSTORE_CONTAINER:-dsa-seats-r1-rawstore-1}"
readonly FECSTORE_CONTAINER="${FECSTORE_CONTAINER:-dsa-seats-r1-fecstore-1}"
readonly APP_CONTAINER="${APP_CONTAINER:-dsa-seats-r1-app-1}"
readonly POSTGRES_VOLUME="${POSTGRES_VOLUME:-dsa-seats-r1_postgres_data}"
readonly RAW_VOLUME="${RAW_VOLUME:-dsa-seats-r1_raw_objects}"
readonly MAP_VOLUME="${MAP_VOLUME:-dsa-seats-r1_map_artifacts}"
readonly FEC_V2_VOLUME="${FEC_V2_VOLUME:-dsa-seats-r1_fec_v2_objects}"
readonly RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-sftp:onnwee@10.0.0.50:/mnt/data2/backups/nuc/restic}"
readonly RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/nuc-router-backup/restic-password}"
readonly ROUTER_BACKUP_SSH_KEY="${ROUTER_BACKUP_SSH_KEY:-/home/onnwee/.ssh/id_ed25519}"
readonly NTFY_URL="${NTFY_URL:-http://10.0.0.56:8085/backups}"
readonly METRIC_FILE="${METRIC_FILE:-/srv/server/monitoring/data/node-exporter-textfile/dsa_seats_backup.prom}"
readonly RESTORE_METRIC_FILE="${RESTORE_METRIC_FILE:-/srv/server/monitoring/data/node-exporter-textfile/dsa_seats_restore.prom}"
readonly FACTUAL_METRIC_FILE="${FACTUAL_METRIC_FILE:-/srv/server/monitoring/data/node-exporter-textfile/dsa_seats_factual.prom}"
readonly PROMETHEUS_CONFIG="${PROMETHEUS_CONFIG:-/srv/server/monitoring/config/prometheus/prometheus.yml}"
readonly PROMETHEUS_ALERTS="${PROMETHEUS_ALERTS:-/srv/server/monitoring/config/prometheus/alerts/dsa-seats-alerts.yml}"
readonly RESTORE_EVIDENCE_ROOT="${RESTORE_EVIDENCE_ROOT:-/srv/server/restore-evidence/dsa-seats}"
readonly RELEASE_ROOT="${RELEASE_ROOT:-/srv/server/projects/dsa-seats-r1/releases}"
readonly SOURCE_RECEIPT_FILE="${SOURCE_RECEIPT_FILE:-/srv/server/projects/dsa-seats-r1/runtime/backup-source.json}"
readonly FEC_V2_TLS_DIR="${FEC_V2_TLS_DIR:-/srv/server/projects/dsa-seats-r1/runtime/fec-v2-tls}"
readonly FEC_V2_RETENTION_EVIDENCE_FILE="${FEC_V2_RETENTION_EVIDENCE_FILE:-/srv/server/projects/dsa-seats-r1/runtime/evidence/fec-v2-store-current.txt}"
readonly SFTP_ARGS="-i ${ROUTER_BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/known_hosts"

stage=""
rawstore_stopped=0
fecstore_stopped=0
source_check_only=0
case "${1:-}" in
  '') [[ $# == 0 ]] || exit 64 ;;
  --check-source-only) [[ $# == 1 ]] || exit 64; source_check_only=1 ;;
  *) printf 'Usage: %s [--check-source-only]\n' "$0" >&2; exit 64 ;;
esac

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fatal() { log "ERROR: $*"; exit 1; }

notify_failure() {
  command -v curl >/dev/null || return 0
  curl -fsS \
    -H 'Title: DSA Seats factual backup failed' \
    -H 'Priority: high' \
    -H 'Tags: warning,floppy_disk' \
    --data-binary "DSA Seats factual backup failed on nuc at $(date -u +%Y-%m-%dT%H:%M:%SZ); inspect dsa-seats-factual-backup.service." \
    "$NTFY_URL" >/dev/null 2>&1 || true
}

write_metrics() {
  local success=$1 completed_at=${2:-0} snapshot_timestamp=${3:-0} temporary
  install -d -m 0755 "$(dirname "$METRIC_FILE")"
  temporary="${METRIC_FILE}.tmp.$$"
  {
    printf '# HELP dsa_seats_backup_success Whether the latest factual backup completed locally and in encrypted off-host storage.\n'
    printf '# TYPE dsa_seats_backup_success gauge\n'
    printf 'dsa_seats_backup_success{project="dsa-seats",environment="factual-r1"} %s\n' "$success"
    printf '# HELP dsa_seats_backup_last_success_unixtime Unix time of the latest complete factual backup.\n'
    printf '# TYPE dsa_seats_backup_last_success_unixtime gauge\n'
    printf 'dsa_seats_backup_last_success_unixtime{project="dsa-seats",environment="factual-r1"} %s\n' "$completed_at"
    printf '# HELP dsa_seats_backup_snapshot_unixtime Unix time encoded by the latest complete encrypted snapshot.\n'
    printf '# TYPE dsa_seats_backup_snapshot_unixtime gauge\n'
    printf 'dsa_seats_backup_snapshot_unixtime{project="dsa-seats",environment="factual-r1"} %s\n' "$snapshot_timestamp"
  } > "$temporary"
  chmod 0644 "$temporary"
  mv -f -- "$temporary" "$METRIC_FILE"
}

cleanup() {
  local rc=$?
  [[ "$source_check_only" == 1 ]] && return
  if [[ "$rawstore_stopped" == 1 ]]; then
    docker start "$RAWSTORE_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ "$fecstore_stopped" == 1 ]]; then
    docker start "$FECSTORE_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ $rc -ne 0 ]]; then
    [[ -n "$stage" && -d "$stage" ]] && rm -rf -- "$stage"
    write_metrics 0 0 0 || true
    notify_failure
  fi
}
trap cleanup EXIT

require_container() {
  local container=$1
  docker inspect "$container" >/dev/null 2>&1 || fatal "required container is absent: $container"
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == "true" ]] || fatal "required container is not running: $container"
}

require_volume() {
  docker volume inspect "$1" >/dev/null 2>&1 || fatal "required volume is absent: $1"
}

archive_volume() {
  local volume=$1 output=$2
  docker run --rm --network none \
    --volume "${volume}:/source:ro" \
    postgis/postgis:16-3.4-alpine \
    tar -C /source -czf - . > "$output"
  [[ -s "$output" ]] || fatal "empty volume archive: $volume"
}

run_restic() {
  restic -r "$RESTIC_REPOSITORY" -o "sftp.args=$SFTP_ARGS" "$@"
}

resolve_source() {
  image_id="$(docker inspect --format '{{.Image}}' "$APP_CONTAINER")"
  image_revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$APP_CONTAINER")"
  source_tree_sha="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.source-tree-sha256"}}' "$APP_CONTAINER")"
  local receipt_used=0
  if [[ ! "$source_tree_sha" =~ ^[a-f0-9]{64}$ ]]; then
    [[ ! -L "$SOURCE_RECEIPT_FILE" && -f "$SOURCE_RECEIPT_FILE" && -r "$SOURCE_RECEIPT_FILE" ]] \
      || fatal "application source-tree label is absent or malformed; an image-bound source receipt is required"
    [[ "$(stat -c %u "$SOURCE_RECEIPT_FILE")" == 0 && "$(stat -c %a "$SOURCE_RECEIPT_FILE")" == 600 ]] \
      || fatal "source receipt must be root-owned mode 0600"
    [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && "$image_revision" =~ ^[a-f0-9]{40}$ ]] \
      || fatal "application image identity is malformed"
    source_tree_sha="$(jq -er --arg image "$image_id" --arg revision "$image_revision" '
      select(.schema_version == 1 and .source_kind == "immutable-image-filesystem" and
             .image_id == $image and .git_revision == $revision) | .source_tree_sha256
    ' "$SOURCE_RECEIPT_FILE")" || fatal "source receipt does not match the deployed image and revision"
    [[ "$source_tree_sha" =~ ^[a-f0-9]{64}$ ]] || fatal "source receipt checksum is malformed"
    receipt_used=1
  fi
  source_archive="$RELEASE_ROOT/$source_tree_sha/source.tar"
  source_directory="$RELEASE_ROOT/$source_tree_sha/source"
  [[ -r "$source_archive" ]] || fatal "exact application source archive is missing"
  [[ "$(sha256sum "$source_archive" | cut -d' ' -f1)" == "$source_tree_sha" ]] \
    || fatal "application source archive checksum does not match its identity"
  [[ -r "$source_directory/data/source-lock.json" ]] || fatal "deployed source lock is missing"
  source_lock_sha="$(sha256sum "$source_directory/data/source-lock.json" | cut -d' ' -f1)"
  [[ "$(tar -xOf "$source_archive" ./data/source-lock.json | sha256sum | cut -d' ' -f1)" == "$source_lock_sha" ]] \
    || fatal "source archive and deployed source lock differ"
  if [[ "$receipt_used" == 1 ]]; then
    [[ "$(jq -er '.source_lock_sha256' "$SOURCE_RECEIPT_FILE")" == "$source_lock_sha" ]] \
      || fatal "source receipt lock checksum differs"
  fi
}

main() {
  [[ $EUID -eq 0 ]] || fatal "run as root"
  for command in docker jq stat sha256sum tar; do command -v "$command" >/dev/null || fatal "missing command: $command"; done
  local source_tree_sha source_archive source_directory source_lock_sha image_id image_revision
  resolve_source
  if [[ "$source_check_only" == 1 ]]; then
    printf 'image_id=%s\nsource_tree_sha256=%s\nsource_lock_sha256=%s\n' "$image_id" "$source_tree_sha" "$source_lock_sha"
    return
  fi
  for command in restic flock; do command -v "$command" >/dev/null || fatal "missing command: $command"; done
  [[ -r "$RESTIC_PASSWORD_FILE" ]] || fatal "restic password file is missing or unreadable"
  [[ -r "$ROUTER_BACKUP_SSH_KEY" ]] || fatal "router backup SSH key is missing or unreadable"
  export RESTIC_PASSWORD_FILE
  require_container "$POSTGRES_CONTAINER"
  require_container "$RAWSTORE_CONTAINER"
  require_container "$FECSTORE_CONTAINER"
  require_container "$APP_CONTAINER"
  require_volume "$POSTGRES_VOLUME"
  require_volume "$RAW_VOLUME"
  require_volume "$MAP_VOLUME"
  require_volume "$FEC_V2_VOLUME"

  install -d -m 0700 "$BACKUP_ROOT"
  exec 9>"$BACKUP_ROOT/.backup.lock"
  flock -n 9 || fatal "another factual backup is running"

  local timestamp final
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  stage="$BACKUP_ROOT/.partial-$timestamp"
  final="$BACKUP_ROOT/$timestamp"
  [[ ! -e "$stage" && ! -e "$final" ]] || fatal "backup timestamp collision"
  install -d -m 0700 "$stage"

  log "creating transaction-consistent PostgreSQL dump"
  docker exec "$POSTGRES_CONTAINER" pg_dump \
    --username dsa_seats_admin \
    --dbname dsa_seats_r1 \
    --format custom \
    --no-owner \
    --no-privileges > "$stage/dsa_seats_r1.dump"
  [[ -s "$stage/dsa_seats_r1.dump" ]] || fatal "PostgreSQL dump is empty"

  log "pausing the immutable raw store for a filesystem-consistent archive"
  docker stop --time 30 "$RAWSTORE_CONTAINER" >/dev/null
  rawstore_stopped=1
  archive_volume "$RAW_VOLUME" "$stage/raw_objects.tgz"
  docker start "$RAWSTORE_CONTAINER" >/dev/null
  rawstore_stopped=0

  log "archiving release-addressed map objects"
  archive_volume "$MAP_VOLUME" "$stage/map_artifacts.tgz"

  log "pausing the retained FEC v2 store for a filesystem-consistent archive"
  docker stop --time 30 "$FECSTORE_CONTAINER" >/dev/null
  fecstore_stopped=1
  archive_volume "$FEC_V2_VOLUME" "$stage/fec_v2_objects.tgz"
  docker start "$FECSTORE_CONTAINER" >/dev/null
  fecstore_stopped=0

  cp --reflink=auto --preserve=mode,timestamps "$source_archive" "$stage/source.tar"
  cp --preserve=mode,timestamps "$source_directory/data/source-lock.json" "$stage/source-lock.json"
  [[ -r "$FEC_V2_RETENTION_EVIDENCE_FILE" && -r "$FEC_V2_TLS_DIR/CAs/root.crt" ]] || fatal "FEC v2 retention evidence or public CA is unavailable"
  cp --preserve=mode,timestamps "$FEC_V2_RETENTION_EVIDENCE_FILE" "$stage/fec-v2-retention-evidence.txt"
  cp --preserve=mode,timestamps "$FEC_V2_TLS_DIR/CAs/root.crt" "$stage/fec-v2-root.crt"
  cp --preserve=mode,timestamps /usr/local/sbin/dsa-seats-factual-backup.sh "$stage/backup-factual.sh"
  cp --preserve=mode,timestamps /usr/local/sbin/dsa-seats-factual-restore-drill.sh "$stage/restore-factual-drill.sh"
  cp --preserve=mode,timestamps /usr/local/sbin/dsa-seats-factual-monitor.sh "$stage/monitor-factual.sh"
  cp --preserve=mode,timestamps /etc/systemd/system/dsa-seats-factual-backup.service "$stage/dsa-seats-factual-backup.service"
  cp --preserve=mode,timestamps /etc/systemd/system/dsa-seats-factual-backup.timer "$stage/dsa-seats-factual-backup.timer"
  cp --preserve=mode,timestamps /etc/systemd/system/dsa-seats-factual-monitor.service "$stage/dsa-seats-factual-monitor.service"
  cp --preserve=mode,timestamps /etc/systemd/system/dsa-seats-factual-monitor.timer "$stage/dsa-seats-factual-monitor.timer"
  cp --preserve=mode,timestamps /etc/dsa-seats-factual-monitor.env "$stage/dsa-seats-factual-monitor.env"
  cp --preserve=mode,timestamps "$PROMETHEUS_CONFIG" "$stage/prometheus.yml"
  cp --preserve=mode,timestamps "$PROMETHEUS_ALERTS" "$stage/dsa-seats-alerts.yml"
  local latest_restore_evidence
  latest_restore_evidence="$(find "$RESTORE_EVIDENCE_ROOT" -maxdepth 1 -type f -name '*.txt' -printf '%T@ %p\n' 2>/dev/null | LC_ALL=C sort -nr | head -1 | cut -d' ' -f2-)"
  if [[ -n "$latest_restore_evidence" && -r "$latest_restore_evidence" ]]; then
    cp --preserve=mode,timestamps "$latest_restore_evidence" "$stage/latest-restore-evidence.txt"
  else
    printf 'status=not_observed\n' > "$stage/latest-restore-evidence.txt"
  fi
  if [[ -r "$RESTORE_METRIC_FILE" ]]; then
    cp --preserve=mode,timestamps "$RESTORE_METRIC_FILE" "$stage/dsa_seats_restore.prom"
  else
    printf 'dsa_seats_restore_drill_success{project="dsa-seats",environment="factual-r1"} 0\n' > "$stage/dsa_seats_restore.prom"
  fi
  if [[ -r "$FACTUAL_METRIC_FILE" ]]; then
    cp --preserve=mode,timestamps "$FACTUAL_METRIC_FILE" "$stage/dsa_seats_factual.prom"
  else
    printf 'dsa_seats_monitor_last_run_unixtime{project="dsa-seats",environment="factual-r1"} 0\n' > "$stage/dsa_seats_factual.prom"
  fi

  [[ "$(docker inspect --format '{{.Image}}' "$APP_CONTAINER")" == "$image_id" ]] \
    || fatal "application image changed during backup"
  {
    printf 'source_tree_sha256,%s\n' "$source_tree_sha"
    printf 'source_lock_sha256,%s\n' "$source_lock_sha"
    printf 'git_revision,%s\n' "$image_revision"
    printf 'app_image_id,%s\n' "$image_id"
    printf 'compose_config,%s\n' "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$APP_CONTAINER")"
    printf 'backup_schedule,%s\n' 'daily'
    printf 'backup_retention,%s\n' '14 daily; 8 weekly; 12 monthly'
    printf 'recovery_owner,%s\n' 'DSA Seats operations'
    printf 'recovery_rpo,%s\n' '24 hours'
    printf 'recovery_rto,%s\n' '2 hours'
  } > "$stage/deployment.csv"

  docker inspect \
    --format '{{.Name}} {{.Config.Image}} {{.Image}}' \
    "$APP_CONTAINER" "$POSTGRES_CONTAINER" "$RAWSTORE_CONTAINER" "$FECSTORE_CONTAINER" \
    | LC_ALL=C sort > "$stage/container-images.txt"
  docker volume inspect "$POSTGRES_VOLUME" "$RAW_VOLUME" "$MAP_VOLUME" "$FEC_V2_VOLUME" \
    --format '{{.Name}} {{.Driver}}' | LC_ALL=C sort > "$stage/volumes.txt"
  docker exec "$POSTGRES_CONTAINER" psql \
    --username dsa_seats_admin \
    --dbname dsa_seats_r1 \
    --csv \
    --command "SELECT r.id,r.status,r.source_cutoff,r.published_at,m.schema_version,m.canonical_data_checksum_sha256,m.geometry_checksum_sha256,m.content_checksum_sha256 FROM data_releases r JOIN release_manifests m ON m.release_id=r.id ORDER BY r.created_at" \
    > "$stage/releases.csv"
  docker exec "$POSTGRES_CONTAINER" psql \
    --username dsa_seats_admin \
    --dbname dsa_seats_r1 \
    --csv \
    --command "SELECT d.release_id,d.domain,d.row_count,d.sha256 FROM release_content_digests d JOIN data_releases r ON r.id=d.release_id WHERE r.status IN ('published','retired') ORDER BY d.release_id,d.domain" \
    > "$stage/release-digests.csv"
  docker exec "$POSTGRES_CONTAINER" psql \
    --username dsa_seats_admin \
    --dbname dsa_seats_r1 \
    --csv \
    --command "SELECT release_id,source_id,status,count(*) AS run_count FROM ingest_runs GROUP BY release_id,source_id,status ORDER BY release_id,source_id,status" \
    > "$stage/ingest-runs.csv"
  (
    cd "$stage"
    sha256sum dsa_seats_r1.dump raw_objects.tgz map_artifacts.tgz fec_v2_objects.tgz source.tar source-lock.json fec-v2-retention-evidence.txt fec-v2-root.crt backup-factual.sh restore-factual-drill.sh monitor-factual.sh dsa-seats-factual-backup.service dsa-seats-factual-backup.timer dsa-seats-factual-monitor.service dsa-seats-factual-monitor.timer dsa-seats-factual-monitor.env prometheus.yml dsa-seats-alerts.yml latest-restore-evidence.txt dsa_seats_restore.prom dsa_seats_factual.prom deployment.csv container-images.txt volumes.txt releases.csv release-digests.csv ingest-runs.csv > SHA256SUMS
  )
  chmod 0600 "$stage"/*
  mv -- "$stage" "$final"
  stage=""

  log "sending the exact backup set to encrypted off-host Restic storage"
  run_restic backup "$final" --tag dsa-seats-r1 --tag factual --tag "$timestamp"
  # Both the timestamp tag and timestamped backup path are evidence, not
  # retention groups. The DSA tag scopes this command; group only by host so
  # successive factual snapshots are actually subject to one policy.
  run_restic forget --tag dsa-seats-r1 --group-by host --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
  run_restic check

  printf '%s\n' "$timestamp" > "$BACKUP_ROOT/LAST_SUCCESS"
  chmod 0600 "$BACKUP_ROOT/LAST_SUCCESS"
  write_metrics 1 "$(date -u +%s)" "$(date -u -d "${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}:${timestamp:13:2}" +%s)"
  # Restic owns the long-term 14-daily/8-weekly/12-monthly retention above.
  # Keep only the two newest local staging generations so a burst of manual
  # backups cannot exhaust /srv before age-based cleanup has a chance to run.
  mapfile -t expired_local_backups < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
      -name '20??????T??????Z' -printf '%f\n' \
      | LC_ALL=C sort \
      | head -n -2
  )
  if ((${#expired_local_backups[@]})); then
    printf '%s\0' "${expired_local_backups[@]}" \
      | xargs -0 -r -I{} rm -rf -- "$BACKUP_ROOT/{}"
  fi
  log "factual backup complete: $final"
}

main "$@"
