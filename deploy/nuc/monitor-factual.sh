#!/usr/bin/env bash
set -Eeuo pipefail

readonly PUBLIC_URL="${PUBLIC_URL:-https://left-field.subcult.tv}"
readonly CADDY_URL="${CADDY_URL:-http://10.0.0.200}"
readonly ORIGIN_URL="${ORIGIN_URL:-http://10.0.0.56:3045}"
readonly CADDY_HOST="${CADDY_HOST:-left-field.subcult.tv}"
readonly METRIC_FILE="${METRIC_FILE:-/srv/server/monitoring/data/node-exporter-textfile/dsa_seats_factual.prom}"
readonly POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-dsa-seats-r1-postgres-1}"
readonly APP_CONTAINER="${APP_CONTAINER:-dsa-seats-r1-app-1}"
readonly RAWSTORE_CONTAINER="${RAWSTORE_CONTAINER:-dsa-seats-r1-rawstore-1}"
readonly FECSTORE_CONTAINER="${FECSTORE_CONTAINER:-dsa-seats-r1-fecstore-1}"
readonly CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"

[[ "${EXPECTED_RELEASE_ID:-}" =~ ^rel_[A-Za-z0-9_-]+$ ]] || {
  printf 'EXPECTED_RELEASE_ID must be a release ID\n' >&2
  exit 1
}
[[ -n "${EXPECTED_RELEASE_LABEL:-}" && ${#EXPECTED_RELEASE_LABEL} -le 160 ]] || {
  printf 'EXPECTED_RELEASE_LABEL must be a nonempty bounded label\n' >&2
  exit 1
}

work_root="$(mktemp -d /tmp/dsa-seats-monitor.XXXXXX)"
cleanup() {
  [[ "$work_root" == /tmp/dsa-seats-monitor.* ]] && rm -rf -- "$work_root"
}
trap cleanup EXIT

response_probe() {
  local name=$1 url=$2 host_header=${3:-}
  local body="$work_root/${name}.body" headers="$work_root/${name}.headers"
  local status=000 curl_args=(--silent --show-error --location --max-time "$CURL_TIMEOUT_SECONDS" --dump-header "$headers" --output "$body" --write-out '%{http_code}')
  [[ -z "$host_header" ]] || curl_args+=(--header "Host: $host_header")
  status="$(curl "${curl_args[@]}" "$url" 2>/dev/null || true)"
  local bytes=0 label=0 synthetic=0 available=0 body_contract=0
  [[ -f "$body" ]] && bytes="$(wc -c < "$body" | tr -d ' ')"
  [[ "$status" == 200 ]] && available=1
  [[ -f "$body" ]] && grep -Fq "$EXPECTED_RELEASE_LABEL" "$body" && label=1
  [[ -f "$body" ]] && grep -Fq "Synthetic" "$body" && synthetic=1
  [[ "$available" == 1 && "$bytes" -ge 10000 && "$label" == 1 && "$synthetic" == 0 ]] && body_contract=1
  printf '%s,%s,%s,%s,%s\n' "$available" "$body_contract" "$label" "$synthetic" "$bytes"
}

container_health() {
  local container=$1
  [[ "$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)" == healthy ]] && printf 1 || printf 0
}

public_probe="$(response_probe public "$PUBLIC_URL/")"
caddy_probe="$(response_probe caddy "$CADDY_URL/" "$CADDY_HOST")"
origin_probe="$(response_probe origin "$ORIGIN_URL/")"
IFS=, read -r public_available public_body public_label public_synthetic public_bytes <<<"$public_probe"
IFS=, read -r caddy_available caddy_body caddy_label caddy_synthetic caddy_bytes <<<"$caddy_probe"
IFS=, read -r origin_available origin_body origin_label origin_synthetic origin_bytes <<<"$origin_probe"

app_healthy="$(container_health "$APP_CONTAINER")"
postgres_healthy="$(container_health "$POSTGRES_CONTAINER")"
rawstore_healthy="$(container_health "$RAWSTORE_CONTAINER")"
fecstore_healthy="$(container_health "$FECSTORE_CONTAINER")"

database_probe="$(
  docker exec "$POSTGRES_CONTAINER" sh -ec '
    export PGPASSWORD="$(tr -d "\r\n" < /run/secrets/db_preflight_password)"
    exec psql -X --set ON_ERROR_STOP=1 --host 127.0.0.1 \
      --username dsa_seats_preflight_login --dbname dsa_seats_r1 -AtF, --command "
        WITH published AS (
          SELECT id FROM data_releases WHERE status='\''published'\''
        ), current_runs AS (
          SELECT DISTINCT ON (source_id,snapshot_id) status,started_at
          FROM ingest_runs
          WHERE release_id=(SELECT id FROM published) AND snapshot_id IS NOT NULL
          ORDER BY source_id,snapshot_id,started_at DESC,id DESC
        )
        SELECT
          (SELECT id FROM published),
          CASE WHEN (SELECT count(*) FROM nationwide_validation_gates
                     WHERE release_id=(SELECT id FROM published)
                       AND domain_count=7
                       AND manifest_checksum_sha256 ~ '\''^[a-f0-9]{64}$'\''
                       AND geometry_checksum_sha256 ~ '\''^[a-f0-9]{64}$'\''
                       AND content_checksum_sha256 ~ '\''^[a-f0-9]{64}$'\''
                       AND domain_checksum_sha256 ~ '\''^[a-f0-9]{64}$'\'')=1
               THEN 1 ELSE 0 END,
          (SELECT count(*) FROM current_runs WHERE status='\''failed'\''),
          (SELECT count(*) FROM current_runs WHERE status='\''running'\''),
          (SELECT count(*) FROM map_artifacts WHERE release_id=(SELECT id FROM published)),
          (SELECT count(*) FROM map_artifacts ma
             WHERE ma.release_id=(SELECT id FROM published)
               AND NOT EXISTS (
                 SELECT 1 FROM map_artifact_receipts mr
                 WHERE mr.release_id=ma.release_id
                   AND mr.map_artifact_id=ma.id
                   AND mr.sha256 ~ '\''^[a-f0-9]{64}$'\''
                   AND mr.byte_size>0
                   AND length(mr.version_id)>0
               ))
      "
  ' 2>/dev/null || true
)"

database_read_healthy=0
published_release_id=""
validation_gate_valid=0
failed_ingestion=0
running_ingestion=0
map_artifacts=0
map_integrity_failures=0
if [[ "$database_probe" =~ ^rel_[A-Za-z0-9_-]+,[01],[0-9]+,[0-9]+,[0-9]+,[0-9]+$ ]]; then
  IFS=, read -r published_release_id validation_gate_valid failed_ingestion running_ingestion map_artifacts map_integrity_failures <<<"$database_probe"
  database_read_healthy=1
fi
release_identity_valid=0
[[ "$published_release_id" == "$EXPECTED_RELEASE_ID" && "$public_label" == 1 && "$caddy_label" == 1 && "$origin_label" == 1 ]] && release_identity_valid=1

map_route_healthy=0
map_status=000
map_body="$work_root/map.body"
map_headers="$work_root/map.headers"
if [[ "$database_read_healthy" == 1 && "$map_artifacts" == 0 ]]; then
  map_status="$(curl --silent --show-error --max-time "$CURL_TIMEOUT_SECONDS" --output "$map_body" --dump-header "$map_headers" --write-out '%{http_code}' "$PUBLIC_URL/maps/$EXPECTED_RELEASE_ID/geo_house_ak_al" 2>/dev/null || true)"
  [[ "$map_status" == 404 ]] && map_route_healthy=1
elif [[ "$database_read_healthy" == 1 && "$map_artifacts" -gt 0 ]]; then
  map_sample="$(
    docker exec "$POSTGRES_CONTAINER" sh -ec '
      export PGPASSWORD="$(tr -d "\r\n" < /run/secrets/db_preflight_password)"
      exec psql -X --set ON_ERROR_STOP=1 --host 127.0.0.1 \
        --username dsa_seats_preflight_login --dbname dsa_seats_r1 -AtF, --command "
          SELECT ma.geography_version_id,mr.sha256
          FROM map_artifacts ma
          JOIN map_artifact_receipts mr
            ON mr.release_id=ma.release_id AND mr.map_artifact_id=ma.id
          WHERE ma.release_id=(SELECT id FROM data_releases WHERE status='\''published'\'')
          ORDER BY ma.geography_version_id COLLATE \"C\" LIMIT 1
        "
    ' 2>/dev/null || true
  )"
  if [[ "$map_sample" =~ ^[A-Za-z0-9:_-]+,[a-f0-9]{64}$ ]]; then
    IFS=, read -r map_geography map_sha256 <<<"$map_sample"
    map_status="$(curl --silent --show-error --max-time "$CURL_TIMEOUT_SECONDS" --output "$map_body" --dump-header "$map_headers" --write-out '%{http_code}' "$PUBLIC_URL/maps/$EXPECTED_RELEASE_ID/$map_geography" 2>/dev/null || true)"
    actual_map_sha256=""
    [[ -f "$map_body" ]] && actual_map_sha256="$(sha256sum "$map_body" | cut -d' ' -f1)"
    if [[ "$map_status" == 200 && "$actual_map_sha256" == "$map_sha256" ]] \
      && grep -Eiq '^content-type:[[:space:]]*(application/geo\+json|application/json)' "$map_headers"; then
      map_route_healthy=1
    fi
  fi
fi

metric_dir="$(dirname "$METRIC_FILE")"
[[ -d "$metric_dir" ]] || install -d -m 0755 "$metric_dir"
metric_tmp="${METRIC_FILE}.tmp.$$"
{
  printf '# HELP dsa_seats_public_route_healthy Public HTTPS returned HTTP 200.\n'
  printf '# TYPE dsa_seats_public_route_healthy gauge\n'
  printf 'dsa_seats_public_route_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$public_available"
  printf '# HELP dsa_seats_public_body_contract_healthy Public HTML is nonempty, factual, and release-matched.\n'
  printf '# TYPE dsa_seats_public_body_contract_healthy gauge\n'
  printf 'dsa_seats_public_body_contract_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$public_body"
  printf '# HELP dsa_seats_expected_release_healthy Public, Caddy, origin, and database agree on the expected release.\n'
  printf '# TYPE dsa_seats_expected_release_healthy gauge\n'
  printf 'dsa_seats_expected_release_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$release_identity_valid"
  printf '# HELP dsa_seats_synthetic_content_detected Synthetic content marker observed on any factual HTTP path.\n'
  printf '# TYPE dsa_seats_synthetic_content_detected gauge\n'
  printf 'dsa_seats_synthetic_content_detected{project="dsa-seats",environment="factual-r1"} %s\n' "$((public_synthetic || caddy_synthetic || origin_synthetic))"
  printf '# HELP dsa_seats_caddy_route_healthy Direct Almaz Caddy factual route satisfies the body contract.\n'
  printf '# TYPE dsa_seats_caddy_route_healthy gauge\n'
  printf 'dsa_seats_caddy_route_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$caddy_body"
  printf '# HELP dsa_seats_origin_route_healthy Direct NUC factual origin satisfies the body contract.\n'
  printf '# TYPE dsa_seats_origin_route_healthy gauge\n'
  printf 'dsa_seats_origin_route_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$origin_body"
  printf '# HELP dsa_seats_http_body_bytes Latest factual HTML response sizes by path.\n'
  printf '# TYPE dsa_seats_http_body_bytes gauge\n'
  printf 'dsa_seats_http_body_bytes{project="dsa-seats",environment="factual-r1",path="public"} %s\n' "$public_bytes"
  printf 'dsa_seats_http_body_bytes{project="dsa-seats",environment="factual-r1",path="caddy"} %s\n' "$caddy_bytes"
  printf 'dsa_seats_http_body_bytes{project="dsa-seats",environment="factual-r1",path="origin"} %s\n' "$origin_bytes"
  printf '# HELP dsa_seats_component_healthy Container application-contract health by bounded component.\n'
  printf '# TYPE dsa_seats_component_healthy gauge\n'
  printf 'dsa_seats_component_healthy{project="dsa-seats",environment="factual-r1",component="app"} %s\n' "$app_healthy"
  printf 'dsa_seats_component_healthy{project="dsa-seats",environment="factual-r1",component="postgres"} %s\n' "$postgres_healthy"
  printf 'dsa_seats_component_healthy{project="dsa-seats",environment="factual-r1",component="rawstore"} %s\n' "$rawstore_healthy"
  printf 'dsa_seats_component_healthy{project="dsa-seats",environment="factual-r1",component="fecstore"} %s\n' "$fecstore_healthy"
  printf '# HELP dsa_seats_database_probe_healthy Restricted-preflight production database probe succeeded.\n'
  printf '# TYPE dsa_seats_database_probe_healthy gauge\n'
  printf 'dsa_seats_database_probe_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$database_read_healthy"
  printf '# HELP dsa_seats_validation_gate_healthy Published release has one valid seven-domain gate.\n'
  printf '# TYPE dsa_seats_validation_gate_healthy gauge\n'
  printf 'dsa_seats_validation_gate_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$validation_gate_valid"
  printf '# HELP dsa_seats_ingestion_runs Current published-release ingestion runs by terminal concern.\n'
  printf '# TYPE dsa_seats_ingestion_runs gauge\n'
  printf 'dsa_seats_ingestion_runs{project="dsa-seats",environment="factual-r1",state="failed"} %s\n' "$failed_ingestion"
  printf 'dsa_seats_ingestion_runs{project="dsa-seats",environment="factual-r1",state="running"} %s\n' "$running_ingestion"
  printf '# HELP dsa_seats_map_artifacts Published map artifact count.\n'
  printf '# TYPE dsa_seats_map_artifacts gauge\n'
  printf 'dsa_seats_map_artifacts{project="dsa-seats",environment="factual-r1"} %s\n' "$map_artifacts"
  printf '# HELP dsa_seats_map_integrity_failures Published map artifacts without one valid versioned receipt.\n'
  printf '# TYPE dsa_seats_map_integrity_failures gauge\n'
  printf 'dsa_seats_map_integrity_failures{project="dsa-seats",environment="factual-r1"} %s\n' "$map_integrity_failures"
  printf '# HELP dsa_seats_map_route_healthy Published map checksum route or explicit missing-artifact contract passed.\n'
  printf '# TYPE dsa_seats_map_route_healthy gauge\n'
  printf 'dsa_seats_map_route_healthy{project="dsa-seats",environment="factual-r1"} %s\n' "$map_route_healthy"
  printf '# HELP dsa_seats_monitor_last_run_unixtime Unix time of the latest completed factual monitor probe.\n'
  printf '# TYPE dsa_seats_monitor_last_run_unixtime gauge\n'
  printf 'dsa_seats_monitor_last_run_unixtime{project="dsa-seats",environment="factual-r1"} %s\n' "$(date -u +%s)"
} > "$metric_tmp"
chmod 0644 "$metric_tmp"
mv -f -- "$metric_tmp" "$METRIC_FILE"
