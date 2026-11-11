#!/usr/bin/env bash
set -euo pipefail

: "${CI_LFS_TOKEN:?CI_LFS_TOKEN must contain the repository job token}"
: "${GITHUB_SERVER_URL:?GITHUB_SERVER_URL must identify the forge}"
server="${GITHUB_SERVER_URL%/}"
export CI_LFS_PROTOCOL="${server%%:*}"
host="${server#*://}"
export CI_LFS_HOST="${host%%/*}"

helper_dir=$(mktemp -d)
header_keys=() header_values=()
cleanup() {
  local exit_status=$? cleanup_failed=0 index
  for index in "${!header_keys[@]}"; do
    git config --local --add "${header_keys[$index]}" "${header_values[$index]}" || cleanup_failed=1
  done
  rm -rf "$helper_dir"
  if (( exit_status == 0 && cleanup_failed != 0 )); then
    return 1
  fi
  return "$exit_status"
}
trap cleanup EXIT
helper="$helper_dir/credential-helper"
cat > "$helper" <<'HELPER'
#!/usr/bin/env bash
set -euo pipefail
host='' protocol=''
while IFS='=' read -r key value; do
  case "$key" in
    host) host="$value" ;;
    protocol) protocol="$value" ;;
  esac
done
if [[ "${1:-}" == get && "$host" == "$CI_LFS_HOST" && "$protocol" == "$CI_LFS_PROTOCOL" ]]; then
  printf 'username=x-access-token\npassword=%s\n' "$CI_LFS_TOKEN"
fi
HELPER
chmod 700 "$helper"

# Gitea's LFS download uses its own bearer token. Checkout's Basic extraheader
# would accompany it on the same host, causing conflicting authorization.
# Temporarily remove local headers and restore every value even on failure.
# Unlike Git's HTTP client, git-lfs does not reset headers with an empty -c
# override. The helper holds no token bytes and refuses other hosts.
while IFS= read -r key; do
  values=()
  while IFS= read -r -d '' value; do
    values+=("$value")
  done < <(git config --local --null --get-all "$key")
  git config --local --unset-all "$key"
  for value in "${values[@]}"; do
    header_keys+=("$key")
    header_values+=("$value")
  done
done < <(git config --local --name-only --get-regexp '^http\..*\.extraheader$' | sort -u || true)
git -c credential.helper= -c "credential.helper=!\"$helper\"" lfs pull
