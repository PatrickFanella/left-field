#!/usr/bin/env bash
set -Eeuo pipefail

# Snapshot recovery restores an already-published backup. It does not authorize
# publication or satisfy the separate rollback/roll-forward contract.
recovery_mode=lifecycle
case "${1:-}" in
  '') [[ $# == 0 ]] || exit 64 ;;
  --snapshot-only) [[ $# == 1 ]] || exit 64; recovery_mode=snapshot ;;
  *) printf 'Usage: %s [--snapshot-only]\n' "$0" >&2; exit 64 ;;
esac
readonly recovery_mode
metric_prefix=dsa_seats_restore_drill
metric_basename=dsa_seats_restore.prom
if [[ "$recovery_mode" == snapshot ]]; then
  metric_prefix=dsa_seats_snapshot_restore
  metric_basename=dsa_seats_snapshot_restore.prom
fi
readonly metric_prefix metric_basename

readonly RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-sftp:onnwee@10.0.0.50:/mnt/data2/backups/nuc/restic}"
readonly RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/nuc-router-backup/restic-password}"
readonly ROUTER_BACKUP_SSH_KEY="${ROUTER_BACKUP_SSH_KEY:-/home/onnwee/.ssh/id_ed25519}"
readonly RESTORE_PARENT="${RESTORE_PARENT:-/srv/server/restore-tests}"
readonly RESTORE_SUBNET="${RESTORE_SUBNET:-10.253.0.0/24}"
readonly EVIDENCE_ROOT="${EVIDENCE_ROOT:-/srv/server/restore-evidence/dsa-seats}"
readonly METRIC_FILE="${METRIC_FILE:-/srv/server/monitoring/data/node-exporter-textfile/${metric_basename}}"
readonly FEC_V2_TLS_DIR="${FEC_V2_TLS_DIR:-/srv/server/projects/dsa-seats-r1/runtime/fec-v2-tls}"
# The pinned MinIO client must be loaded from the independent recovery image
# archive before this drill; do not silently pull a different client version.
readonly SFTP_ARGS="-i ${ROUTER_BACKUP_SSH_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes"

started_epoch="$(date -u +%s)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
suffix="$(date -u +%Y%m%dT%H%M%SZ)-$$"
network="dsa-seats-restore-${suffix}"
postgres_container="${network}-postgres"
rawstore_container="${network}-rawstore"
fecstore_container="${network}-fecstore"
app_container="${network}-app"
migrate_container="${network}-migrate"
postgres_volume="${network}-postgres-data"
raw_volume="${network}-raw-objects"
map_volume="${network}-map-artifacts"
fec_v2_volume="${network}-fec-v2-objects"
restore_root=""
evidence_file=""
snapshot_id=""
snapshot_path=""
drill_success=0

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fatal() { log "ERROR: $*"; exit 1; }

run_restic() {
  restic -r "$RESTIC_REPOSITORY" -o "sftp.args=$SFTP_ARGS" "$@"
}

require_recovery_images() {
  local image
  for image in \
    postgis/postgis:16-3.4-alpine \
    minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e \
    sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727; do
    docker image inspect "$image" >/dev/null 2>&1 \
      || fatal "required retained recovery image is missing: $image; load the verified archive before retrying"
  done
}

resolve_recovery_image() {
  local identity=$1 resolved
  [[ "$identity" =~ ^sha256:[a-f0-9]{64}$ ]] || fatal "backed-up application image ID is malformed"
  resolved="$(docker image inspect "$identity" --format '{{.Id}}' 2>/dev/null)" \
    || fatal "exact backed-up application image is missing"
  [[ "$resolved" == "$identity" ]] || fatal "local recovery image does not match the backed-up image ID"
  printf '%s\n' "$identity"
}

write_metrics() {
  local success=$1 completed_at=${2:-0} duration=${3:-0} temporary
  install -d -m 0755 "$(dirname "$METRIC_FILE")"
  temporary="${METRIC_FILE}.tmp.$$"
  {
    printf '# HELP %s_success Whether the selected isolated recovery contract passed.\n' "$metric_prefix"
    printf '# TYPE %s_success gauge\n' "$metric_prefix"
    printf '%s_success{project="dsa-seats",environment="factual-r1"} %s\n' "$metric_prefix" "$success"
    printf '# HELP %s_last_success_unixtime Unix time of the latest successful selected recovery contract.\n' "$metric_prefix"
    printf '# TYPE %s_last_success_unixtime gauge\n' "$metric_prefix"
    printf '%s_last_success_unixtime{project="dsa-seats",environment="factual-r1"} %s\n' "$metric_prefix" "$completed_at"
    printf '# HELP %s_duration_seconds Duration of the selected recovery contract.\n' "$metric_prefix"
    printf '# TYPE %s_duration_seconds gauge\n' "$metric_prefix"
    printf '%s_duration_seconds{project="dsa-seats",environment="factual-r1"} %s\n' "$metric_prefix" "$duration"
  } > "$temporary"
  chmod 0644 "$temporary"
  mv -f -- "$temporary" "$METRIC_FILE"
}

append_evidence() {
  [[ -n "$evidence_file" ]] || return 0
  printf '%s\n' "$*" >> "$evidence_file"
}

cleanup() {
  local rc=$? completed_epoch duration
  completed_epoch="$(date -u +%s)"
  duration=$((completed_epoch - started_epoch))
  if [[ "$drill_success" == 1 && $rc -eq 0 ]]; then
    append_evidence "status=pass"
    append_evidence "completed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    append_evidence "duration_seconds=$duration"
    write_metrics 1 "$completed_epoch" "$duration" || true
  else
    append_evidence "status=failed"
    append_evidence "failed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    append_evidence "duration_seconds=$duration"
    write_metrics 0 0 "$duration" || true
  fi

  [[ "$app_container" == dsa-seats-restore-* ]] && docker rm -f "$app_container" >/dev/null 2>&1 || true
  [[ "$migrate_container" == dsa-seats-restore-* ]] && docker rm -f "$migrate_container" >/dev/null 2>&1 || true
  [[ "$rawstore_container" == dsa-seats-restore-* ]] && docker rm -f "$rawstore_container" >/dev/null 2>&1 || true
  [[ "$fecstore_container" == dsa-seats-restore-* ]] && docker rm -f "$fecstore_container" >/dev/null 2>&1 || true
  [[ "$postgres_container" == dsa-seats-restore-* ]] && docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  [[ "$network" == dsa-seats-restore-* ]] && docker network rm "$network" >/dev/null 2>&1 || true
  for volume in "$postgres_volume" "$raw_volume" "$map_volume" "$fec_v2_volume"; do
    [[ "$volume" == dsa-seats-restore-* ]] && docker volume rm "$volume" >/dev/null 2>&1 || true
  done
  if [[ -n "$restore_root" && "$restore_root" == "$RESTORE_PARENT"/dsa-seats.* ]]; then
    rm -rf -- "$restore_root"
  fi
}
record_error() {
  local line=$1 command=${2//$'\n'/ }
  append_evidence "error_line=$line"
  append_evidence "error_command=$command"
}
trap 'record_error "$LINENO" "$BASH_COMMAND"' ERR
trap cleanup EXIT

wait_for_health() {
  local container=$1 attempts=${2:-60}
  for attempt in $(seq 1 "$attempts"); do
    local state
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    [[ "$state" == "healthy" ]] && return 0
    sleep 2
  done
  docker logs --tail 80 "$container" >&2 || true
  fatal "container did not become healthy: $container"
}

main() {
  [[ $EUID -eq 0 ]] || fatal "run as root"
  for command in docker restic jq sha256sum diff flock; do
    command -v "$command" >/dev/null || fatal "missing command: $command"
  done
  require_recovery_images
  [[ -r "$RESTIC_PASSWORD_FILE" ]] || fatal "restic password file is missing or unreadable"
  [[ -r "$ROUTER_BACKUP_SSH_KEY" ]] || fatal "router backup SSH key is missing or unreadable"
  export RESTIC_PASSWORD_FILE

  install -d -m 0700 "$RESTORE_PARENT" "$EVIDENCE_ROOT"
  exec 9>"$EVIDENCE_ROOT/.restore.lock"
  flock -n 9 || fatal "another factual restore drill is running"
  restore_root="$(mktemp -d "$RESTORE_PARENT/dsa-seats.XXXXXX")"
  chmod 0700 "$restore_root"
  evidence_file="$EVIDENCE_ROOT/${suffix}.txt"
  : > "$evidence_file"
  chmod 0600 "$evidence_file"
  append_evidence "evidence_class=encrypted-off-host-factual-restore"
  append_evidence "started_at=$started_at"

  local snapshots_json
  snapshots_json="$(run_restic snapshots --tag dsa-seats-r1 --json)"
  snapshot_id="$(jq -er 'if length > 0 then max_by(.time).id else error("no DSA snapshot found") end' <<<"$snapshots_json")"
  snapshot_path="$(jq -er 'if (length > 0 and ((max_by(.time).paths | length) == 1)) then max_by(.time).paths[0] else error("expected one DSA snapshot path") end' <<<"$snapshots_json")"
  [[ "$snapshot_id" =~ ^[a-f0-9]{64}$ ]] || fatal "latest snapshot ID is malformed"
  [[ "$snapshot_path" =~ ^/srv/server/backups/dsa-seats-r1/20[0-9]{6}T[0-9]{6}Z$ ]] || fatal "latest snapshot path is outside the factual backup namespace"
  append_evidence "snapshot_id=$snapshot_id"
  append_evidence "snapshot_path=$snapshot_path"

  log "restoring the latest encrypted off-host snapshot"
  run_restic restore "$snapshot_id" --target "$restore_root" --include "$snapshot_path"
  local restored_backup="$restore_root$snapshot_path"
  [[ -d "$restored_backup" ]] || fatal "restored factual backup path is absent"
  (
    cd "$restored_backup"
    sha256sum --check SHA256SUMS
  ) >/dev/null
  append_evidence "backup_checksums=pass"

  local source_tree_sha source_lock_sha git_revision app_image_id app_image
  source_tree_sha="$(awk -F, '$1=="source_tree_sha256"{print $2}' "$restored_backup/deployment.csv")"
  source_lock_sha="$(awk -F, '$1=="source_lock_sha256"{print $2}' "$restored_backup/deployment.csv")"
  git_revision="$(awk -F, '$1=="git_revision"{print $2}' "$restored_backup/deployment.csv")"
  app_image_id="$(awk -F, '$1=="app_image_id"{print $2}' "$restored_backup/deployment.csv")"
  [[ "$source_tree_sha" =~ ^[a-f0-9]{64}$ && "$source_lock_sha" =~ ^[a-f0-9]{64}$ ]] || fatal "deployment checksums are malformed"
  # SHA256SUMS verifies the archive bytes; source_tree_sha identifies the image
  # build input, not a newly packed backup tarball. Match its embedded lock too.
  [[ "$(tar -xOf "$restored_backup/source.tar" ./data/source-lock.json | sha256sum | cut -d' ' -f1)" == "$source_lock_sha" ]] \
    || fatal "restored source archive does not contain the deployed source lock"
  [[ "$(sha256sum "$restored_backup/source-lock.json" | cut -d' ' -f1)" == "$source_lock_sha" ]] || fatal "restored source lock does not match deployment identity"
  # Multiple runtime-patched images can share the same application source.
  # Restore the recorded immutable image, never a source-hash tag alias.
  app_image="$(resolve_recovery_image "$app_image_id")"
  append_evidence "source_tree_sha256=$source_tree_sha"
  append_evidence "source_lock_sha256=$source_lock_sha"
  append_evidence "git_revision=$git_revision"
  append_evidence "app_image_id=$app_image_id"

  docker network create --internal --subnet "$RESTORE_SUBNET" "$network" >/dev/null
  docker volume create "$postgres_volume" >/dev/null
  docker volume create "$raw_volume" >/dev/null
  docker volume create "$map_volume" >/dev/null
  docker volume create "$fec_v2_volume" >/dev/null

  docker run --cpus=1 --memory=1536m --pids-limit=256 -d --name "$postgres_container" --network "$network" \
    --health-cmd 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U dsa_restore_admin -d dsa_seats_restore' \
    --health-interval 2s --health-timeout 2s --health-retries 60 \
    -e POSTGRES_USER=dsa_restore_admin \
    -e POSTGRES_DB=dsa_seats_restore \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -v "$postgres_volume:/var/lib/postgresql/data" \
    postgis/postgis:16-3.4-alpine >/dev/null
  wait_for_health "$postgres_container"
  docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -v ON_ERROR_STOP=1 -Atqc "SELECT 1" | grep -Fx 1 >/dev/null

  local admin_url="postgresql://dsa_restore_admin@${postgres_container}:5432/dsa_seats_restore"
  if ! docker run --cpus=1 --memory=1536m --pids-limit=256 --name "$migrate_container" --network "$network" \
    -e DATABASE_URL="$admin_url" \
    --entrypoint /app/deploy/nuc/run-with-secrets.sh \
    "$app_image" npm run db:migrate; then
    append_evidence "migration_container_state=$(docker inspect --format 'exit={{.State.ExitCode}},oom={{.State.OOMKilled}},error={{.State.Error}}' "$migrate_container")"
    append_evidence "postgres_log_tail_begin"
    docker logs --tail 120 "$postgres_container" >> "$evidence_file" 2>&1 || true
    append_evidence "postgres_log_tail_end"
    fatal "isolated migration container failed"
  fi
  docker rm "$migrate_container" >/dev/null

  local restore_list="$restore_root/restore.list" filtered_restore_list="$restore_root/restore-data.list"
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network none -v "$restored_backup:/backup:ro" \
    postgis/postgis:16-3.4-alpine pg_restore --list /backup/dsa_seats_r1.dump > "$restore_list"
  awk '!/TABLE DATA drizzle __drizzle_migrations/' "$restore_list" > "$filtered_restore_list"
  grep -F 'TABLE DATA drizzle __drizzle_migrations' "$restore_list" >/dev/null || fatal "backup restore list has no Drizzle migration ledger"
  if grep -F 'TABLE DATA drizzle __drizzle_migrations' "$filtered_restore_list" >/dev/null; then
    fatal "Drizzle migration ledger was not excluded from data replay"
  fi
  docker cp "$filtered_restore_list" "$postgres_container:/tmp/restore-data.list"
  docker cp "$restored_backup/dsa_seats_r1.dump" "$postgres_container:/tmp/dsa_seats_r1.dump"
  docker exec "$postgres_container" pg_restore \
    --username dsa_restore_admin \
    --dbname dsa_seats_restore \
    --data-only \
    --no-owner \
    --no-privileges \
    --disable-triggers \
    --use-list=/tmp/restore-data.list \
    --exit-on-error \
    /tmp/dsa_seats_r1.dump
  append_evidence "postgres_restore=pass"
  # A data-only logical restore does not carry PostgreSQL planner statistics.
  # Rebuild them before exercising the same bounded nationwide validation
  # queries used by production release lifecycle operations.
  docker exec "$postgres_container" psql -X \
    --username dsa_restore_admin \
    --dbname dsa_seats_restore \
    -v ON_ERROR_STOP=1 \
    --command "ANALYZE;" >/dev/null
  append_evidence "postgres_analyze=pass"

  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network none -v "$raw_volume:/target" -v "$restored_backup:/backup:ro" \
    postgis/postgis:16-3.4-alpine tar -C /target -xzf /backup/raw_objects.tgz
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network none -v "$map_volume:/target" -v "$restored_backup:/backup:ro" \
    postgis/postgis:16-3.4-alpine tar -C /target -xzf /backup/map_artifacts.tgz
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network none -v "$fec_v2_volume:/target" -v "$restored_backup:/backup:ro" \
    postgis/postgis:16-3.4-alpine tar -C /target -xzf /backup/fec_v2_objects.tgz
  append_evidence "raw_object_restore=pass"
  append_evidence "map_object_restore=pass"
  append_evidence "fec_v2_object_restore=pass"

  local actual_releases="$restore_root/releases.csv" actual_digests="$restore_root/release-digests.csv" actual_runs="$restore_root/ingest-runs.csv"
  docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore --csv \
    --command "SELECT r.id,r.status,r.source_cutoff,r.published_at,m.schema_version,m.canonical_data_checksum_sha256,m.geometry_checksum_sha256,m.content_checksum_sha256 FROM data_releases r JOIN release_manifests m ON m.release_id=r.id ORDER BY r.created_at" > "$actual_releases"
  docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore --csv \
    --command "SELECT d.release_id,d.domain,d.row_count,d.sha256 FROM release_content_digests d JOIN data_releases r ON r.id=d.release_id WHERE r.status IN ('published','retired') ORDER BY d.release_id,d.domain" > "$actual_digests"
  docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore --csv \
    --command "SELECT release_id,source_id,status,count(*) AS run_count FROM ingest_runs GROUP BY release_id,source_id,status ORDER BY release_id,source_id,status" > "$actual_runs"
  diff -u "$restored_backup/releases.csv" "$actual_releases" >/dev/null
  diff -u "$restored_backup/release-digests.csv" "$actual_digests" >/dev/null
  diff -u "$restored_backup/ingest-runs.csv" "$actual_runs" >/dev/null
  append_evidence "release_identity_parity=pass"
  append_evidence "seven_digest_parity=pass"
  append_evidence "ingest_run_parity=pass"

  local published_release_id previous_release_id published_release_label release_stage invariant_row expected_closure
  published_release_id="$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc \
    "SELECT id FROM data_releases WHERE status='published'")"
  [[ "$published_release_id" =~ ^rel_[A-Za-z0-9_-]+$ ]] || fatal "restored published release ID is malformed"
  previous_release_id="$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc \
    "SELECT previous_release_id FROM data_releases WHERE id='${published_release_id}'")"
  [[ "$previous_release_id" =~ ^rel_[A-Za-z0-9_-]+$ ]] || fatal "restored predecessor release ID is malformed"
  published_release_label="$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc \
    "SELECT label FROM data_releases WHERE id='${published_release_id}'")"
  [[ -n "$published_release_label" ]] || fatal "restored published release label is empty"
  release_stage="$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc "
    SELECT CASE
      WHEN count(*) FILTER (WHERE release_id='${published_release_id}')=1311
       AND (SELECT count(*) FROM acs_variables WHERE release_id='${published_release_id}')=3
      THEN 'acs'
      WHEN count(*) FILTER (WHERE release_id='${published_release_id}')=0
       AND (SELECT count(*) FROM acs_variables WHERE release_id='${published_release_id}')=0
      THEN 'member'
      ELSE 'invalid'
    END
    FROM acs_observations;
  ")"
  [[ "$release_stage" == "acs" || "$release_stage" == "member" ]] || fatal "restored published release has an unsupported enrichment stage"
  append_evidence "published_release_id=$published_release_id"
  append_evidence "previous_release_id=$previous_release_id"
  append_evidence "release_stage=$release_stage"

  invariant_row="$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -AtF, --command "
    SELECT
      (SELECT count(*) FROM seat_cycles WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM geography_versions WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM memberships WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM biographical_facts WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM acs_variables WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM acs_observations WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM release_content_digests WHERE release_id='${published_release_id}'),
      (SELECT count(*) FROM ingest_runs WHERE status IN ('running','failed')),
      (SELECT count(*) FROM map_artifacts WHERE release_id='${published_release_id}');
  ")"
  if [[ "$release_stage" == "acs" ]]; then
    expected_closure="541,497,537,1074,3,1311,7,0,441"
  else
    expected_closure="541,497,537,1074,0,0,7,0,0"
  fi
  [[ "$invariant_row" == "$expected_closure" ]] || fatal "restored factual closure is incorrect: $invariant_row"
  append_evidence "factual_closure=$invariant_row"

  docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -v ON_ERROR_STOP=1 --command "
    CREATE ROLE dsa_restore_web LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE dsa_restore_ingest LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE dsa_restore_preflight LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE dsa_restore_operator LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    CREATE ROLE dsa_restore_verifier LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    GRANT dsa_seats_web TO dsa_restore_web;
    GRANT dsa_seats_ingest TO dsa_restore_ingest;
    GRANT dsa_seats_release_preflight TO dsa_restore_preflight;
    GRANT dsa_seats_release_operator TO dsa_restore_operator;
    GRANT dsa_seats_launch_verifier TO dsa_restore_verifier;
  " >/dev/null
  docker exec "$postgres_container" psql -X --username dsa_restore_web --dbname dsa_seats_restore -Atqc \
    "SELECT count(*) FROM data_releases WHERE status='published'" | grep -Fx 1 >/dev/null
  if docker exec "$postgres_container" psql -X --username dsa_restore_web --dbname dsa_seats_restore -v ON_ERROR_STOP=1 --command \
    "INSERT INTO data_releases(id,label,status,source_cutoff,created_at) VALUES('rel_forbidden','forbidden','candidate','2026-07-18',clock_timestamp())" >/dev/null 2>&1; then
    fatal "restored web role unexpectedly wrote release data"
  fi
  append_evidence "web_role_read=pass"
  append_evidence "web_role_write_rejected=pass"

  local raw_root_user="$restore_root/raw-root-user" raw_root_password="$restore_root/raw-root-password"
  printf 'restore%s' "$(openssl rand -hex 8)" > "$raw_root_user"
  openssl rand -hex 32 > "$raw_root_password"
  chmod 0600 "$raw_root_user" "$raw_root_password"
  docker run --cpus=1 --memory=1536m --pids-limit=256 -d --name "$rawstore_container" --network "$network" \
    --health-cmd 'curl -fsS http://127.0.0.1:9000/minio/health/live' \
    --health-interval 2s --health-timeout 2s --health-retries 60 \
    -e MINIO_ROOT_USER_FILE=/run/secrets/root_user \
    -e MINIO_ROOT_PASSWORD_FILE=/run/secrets/root_password \
    -v "$raw_root_user:/run/secrets/root_user:ro" \
    -v "$raw_root_password:/run/secrets/root_password:ro" \
    -v "$raw_volume:/data" \
    minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e \
    server /data >/dev/null
  wait_for_health "$rawstore_container"
  append_evidence "rawstore_health=pass"
  docker stop --time 30 "$rawstore_container" >/dev/null
  append_evidence "rawstore_stopped_after_health=pass"
  docker stop --time 30 "$postgres_container" >/dev/null
  append_evidence "postgres_stopped_before_fec_restore=pass"

  local fec_root_user="$restore_root/fec-root-user" fec_root_password="$restore_root/fec-root-password"
  [[ -r "$FEC_V2_TLS_DIR/public.crt" && -r "$FEC_V2_TLS_DIR/private.key" && -r "$FEC_V2_TLS_DIR/CAs/root.crt" ]] || fatal "FEC v2 TLS recovery path is unavailable"
  [[ "$(sha256sum "$FEC_V2_TLS_DIR/CAs/root.crt" | cut -d' ' -f1)" == "$(sha256sum "$restored_backup/fec-v2-root.crt" | cut -d' ' -f1)" ]] || fatal "FEC v2 recovered CA does not match the backed-up public CA"
  local expected_certificate_sha
  expected_certificate_sha="$(awk -F= '$1=="certificate_sha256"{print $2}' "$restored_backup/fec-v2-retention-evidence.txt")"
  [[ "$expected_certificate_sha" =~ ^[a-f0-9]{64}$ && "$(sha256sum "$FEC_V2_TLS_DIR/public.crt" | cut -d' ' -f1)" == "$expected_certificate_sha" ]] || fatal "FEC v2 recovered server certificate does not match retention evidence"
  printf 'restore%s' "$(openssl rand -hex 8)" > "$fec_root_user"
  openssl rand -hex 32 > "$fec_root_password"
  chmod 0600 "$fec_root_user" "$fec_root_password"
  docker run --cpus=1 --memory=1536m --pids-limit=256 -d --name "$fecstore_container" --network "$network" --network-alias fecstore \
    --health-cmd 'curl --cacert /certs/CAs/root.crt -fsS https://fecstore:9000/minio/health/live' \
    --health-interval 2s --health-timeout 2s --health-retries 60 \
    -e MINIO_ROOT_USER_FILE=/run/secrets/root_user \
    -e MINIO_ROOT_PASSWORD_FILE=/run/secrets/root_password \
    -v "$fec_root_user:/run/secrets/root_user:ro" \
    -v "$fec_root_password:/run/secrets/root_password:ro" \
    -v "$fec_v2_volume:/data" \
    -v "$FEC_V2_TLS_DIR:/certs:ro" \
    minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e \
    server --certs-dir /certs /data >/dev/null
  wait_for_health "$fecstore_container"
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network "$network" \
    -v "$fec_root_user:/run/secrets/root_user:ro" \
    -v "$fec_root_password:/run/secrets/root_password:ro" \
    -v "$FEC_V2_TLS_DIR/CAs/root.crt:/certs/CAs/root.crt:ro" \
    --entrypoint /bin/sh \
    sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727 \
    -ec '
      export SSL_CERT_FILE=/certs/CAs/root.crt
      root_user=$(tr -d "\r\n" < /run/secrets/root_user)
      root_password=$(tr -d "\r\n" < /run/secrets/root_password)
      alias_ready=0
      for attempt in 1 2 3 4 5 6 7 8 9 10; do
        if mc alias set restored https://fecstore:9000 "$root_user" "$root_password" >/dev/null 2>&1; then
          alias_ready=1
          break
        fi
        sleep 1
      done
      [ "$alias_ready" = 1 ] || { echo FEC_V2_RESTORE_ALIAS_FAILED >&2; exit 21; }
      version_info=$(mc version info restored/dsa-seats-fec-v2) \
        || { echo FEC_V2_RESTORE_VERSION_QUERY_FAILED >&2; exit 22; }
      retention_info=$(mc retention info --default restored/dsa-seats-fec-v2) \
        || { echo FEC_V2_RESTORE_RETENTION_QUERY_FAILED >&2; exit 23; }
      retained_object=$(mc stat --json restored/dsa-seats-fec-v2/operational-preflight/tls-versioning-retention-v1.txt) \
        || { echo FEC_V2_RESTORE_OBJECT_QUERY_FAILED >&2; exit 24; }
      case "$version_info" in *"versioning is enabled"*) ;; *) echo FEC_V2_RESTORE_VERSION_ASSERTION_FAILED >&2; exit 25 ;; esac
      case "$retention_info" in *"Object locking '\''COMPLIANCE'\'' is configured for 1YEARS."*) ;; *) echo FEC_V2_RESTORE_RETENTION_ASSERTION_FAILED >&2; exit 26 ;; esac
      case "$retained_object" in *"\"status\":\"success\""*"\"X-Amz-Object-Lock-Mode\":\"COMPLIANCE\""*"\"X-Amz-Object-Lock-Retain-Until-Date\":\""*) ;; *) echo FEC_V2_RESTORE_OBJECT_LOCK_ASSERTION_FAILED >&2; exit 27 ;; esac
      version_id=${retained_object#*\"versionID\":\"}
      version_id=${version_id%%\"*}
      [ -n "$version_id" ] && [ "$version_id" != "$retained_object" ] \
        || { echo FEC_V2_RESTORE_VERSION_ID_ASSERTION_FAILED >&2; exit 28; }
      echo fec_v2_tls_retention_probe=pass
    '
  append_evidence "fec_v2_store_health=pass"
  append_evidence "fec_v2_tls_recovery_path=pass"
  append_evidence "fec_v2_ca_binding_restore=pass"
  append_evidence "fec_v2_certificate_binding_restore=pass"
  append_evidence "fec_v2_versioning_restore=pass"
  append_evidence "fec_v2_one_year_compliance_retention_restore=pass"
  docker stop --time 30 "$fecstore_container" >/dev/null
  docker start "$postgres_container" >/dev/null
  wait_for_health "$postgres_container"
  append_evidence "postgres_restarted_after_fec_restore=pass"

  local web_url="postgresql://dsa_restore_web@${postgres_container}:5432/dsa_seats_restore"
  docker run --cpus=1 --memory=1536m --pids-limit=256 -d --name "$app_container" --network "$network" \
    -e NODE_ENV=production \
    -e WEB_DATABASE_URL="$web_url" \
    -e MAP_ARTIFACT_ROOT=/var/lib/dsa-seats/maps/r1-factual \
    -e EXPECTED_RELEASE_LABEL="$published_release_label" \
    -e PUBLISHED_RELEASE_ID="$published_release_id" \
    -v "$map_volume:/var/lib/dsa-seats/maps:ro" \
    "$app_image" npm run start -- -H 0.0.0.0 >/dev/null
  for attempt in $(seq 1 60); do
    if docker exec "$app_container" node -e "fetch('http://127.0.0.1:3000/sources').then(async r=>{const b=await r.text();if(!r.ok||b.length<10000||b.includes('Synthetic')||!b.includes(process.env.EXPECTED_RELEASE_LABEL))process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      break
    fi
    [[ "$attempt" == 60 ]] && { docker logs --tail 80 "$app_container" >&2; fatal "restored application did not satisfy its factual body contract"; }
    sleep 2
  done
  docker exec "$app_container" node -e "
    const paths=['/','/seats/seat_house_ak_al_current','/sources','/methodology'];
    Promise.all(paths.map(async path=>{const r=await fetch('http://127.0.0.1:3000'+path);const b=await r.text();if(!r.ok||b.length<500||b.includes('Synthetic'))throw new Error(path)}))
      .then(async()=>{const r=await fetch('http://127.0.0.1:3000/maps/'+process.env.PUBLISHED_RELEASE_ID+'/geo_house_ak_al');if(r.status!==404)throw new Error('map missing-state contract')})
      .catch(()=>process.exit(1));
  "
  append_evidence "web_browse_profile_sources_methodology=pass"
  append_evidence "map_missing_artifact_contract=pass"

  if [[ "$recovery_mode" == snapshot ]]; then
    local snapshot_health
    snapshot_health="$(docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network "$network" \
      -e RELEASE_PREFLIGHT_DATABASE_URL="postgresql://dsa_restore_preflight@${postgres_container}:5432/dsa_seats_restore" \
      "$app_image" npm run --silent release:health -- --release "$published_release_id")"
    printf '%s\n' "$snapshot_health" > "${evidence_file%.txt}.health.json"
    jq -e --arg release "$published_release_id" '
      .releaseId == $release and .repositoryStatus == "pass" and
      ([.checks[] | select(.name == "validation_gate" and .status == "pass")] | length) == 1
    ' "${evidence_file%.txt}.health.json" >/dev/null
    [[ "$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc "SELECT id FROM data_releases WHERE status='published'")" == "$published_release_id" ]] || fatal "snapshot validation changed the published pointer"
    append_evidence "recovery_contract=published_snapshot"
    append_evidence "repository_health=pass"
    append_evidence "publication_lifecycle=not_run"
    drill_success=1
    log "isolated published-snapshot recovery passed; lifecycle qualification is separate"
    return
  fi

  local ingest_url="postgresql://dsa_restore_ingest@${postgres_container}:5432/dsa_seats_restore"
  local preflight_url="postgresql://dsa_restore_preflight@${postgres_container}:5432/dsa_seats_restore"
  local operator_url="postgresql://dsa_restore_operator@${postgres_container}:5432/dsa_seats_restore"
  local verifier_url="postgresql://dsa_restore_verifier@${postgres_container}:5432/dsa_seats_restore"
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network "$network" \
    -e INGEST_DATABASE_URL="$ingest_url" \
    -e RELEASE_PREFLIGHT_DATABASE_URL="$preflight_url" \
    -e RELEASE_OPERATOR_DATABASE_URL="$operator_url" \
    -e LAUNCH_VERIFIER_DATABASE_URL="$verifier_url" \
    "$app_image" npm run release:lifecycle -- rollback >/dev/null
  [[ "$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc "SELECT id FROM data_releases WHERE status='published'")" == "$previous_release_id" ]] || fatal "isolated factual rollback did not publish the predecessor"
  append_evidence "factual_rollback=pass"
  docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network "$network" \
    -e INGEST_DATABASE_URL="$ingest_url" \
    -e RELEASE_PREFLIGHT_DATABASE_URL="$preflight_url" \
    -e RELEASE_OPERATOR_DATABASE_URL="$operator_url" \
    -e LAUNCH_VERIFIER_DATABASE_URL="$verifier_url" \
    "$app_image" npm run release:lifecycle -- roll-forward --release "$published_release_id" --launch-factual >/dev/null
  [[ "$(docker exec "$postgres_container" psql -X --username dsa_restore_admin --dbname dsa_seats_restore -Atqc "SELECT id FROM data_releases WHERE status='published'")" == "$published_release_id" ]] || fatal "isolated factual roll-forward did not restore the backed-up release"
  append_evidence "factual_roll_forward=pass"

  local health_output
  health_output="$(docker run --cpus=1 --memory=1536m --pids-limit=256 --rm --network "$network" \
    -e RELEASE_PREFLIGHT_DATABASE_URL="$preflight_url" \
    "$app_image" npm run release:health -- --release "$published_release_id")"
  grep -F '"repositoryStatus":"pass"' <<<"$health_output" >/dev/null || fatal "restored repository health did not pass"
  append_evidence "repository_health=pass"

  drill_success=1
  log "isolated factual restore drill passed; evidence: $evidence_file"
}

main "$@"
