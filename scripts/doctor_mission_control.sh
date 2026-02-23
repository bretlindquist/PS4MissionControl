#!/usr/bin/env bash
set -euo pipefail

JSON_MODE=0
WATCH_ROOTS_DEFAULT="/Volumes/PS4,/Volumes/MagicLantern"
WATCH_ROOTS="${PS4MC_WATCH_ROOTS:-$WATCH_ROOTS_DEFAULT}"

if [[ "${1:-}" == "--json" ]]; then
  JSON_MODE=1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
RESULTS_JSON=""

color() {
  local code="$1"; shift
  printf "\033[%sm%s\033[0m" "$code" "$*"
}

stamp() {
  date +"%Y-%m-%d %H:%M:%S"
}

add_json_result() {
  local status="$1" check="$2" detail="$3"
  local esc_check esc_detail
  esc_check="$(printf '%s' "$check" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  esc_detail="$(printf '%s' "$detail" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  if [[ -n "$RESULTS_JSON" ]]; then
    RESULTS_JSON+=","
  fi
  RESULTS_JSON+="{\"status\":\"$status\",\"check\":\"$esc_check\",\"detail\":\"$esc_detail\"}"
}

report() {
  local status="$1" check="$2" detail="$3"
  case "$status" in
    pass) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    warn) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    fail) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
  add_json_result "$status" "$check" "$detail"
  if [[ "$JSON_MODE" -eq 1 ]]; then
    return
  fi
  local tag
  case "$status" in
    pass) tag="$(color "32" "PASS")" ;;
    warn) tag="$(color "33" "WARN")" ;;
    fail) tag="$(color "31" "FAIL")" ;;
    *) tag="INFO" ;;
  esac
  printf "%-6s  %-34s  %s\n" "$tag" "$check" "$detail"
}

section() {
  local title="$1"
  if [[ "$JSON_MODE" -eq 0 ]]; then
    echo
    echo "== $title =="
  fi
}

check_bin() {
  local kind="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    report pass "binary:$bin" "$(command -v "$bin")"
  else
    if [[ "$kind" == "required" ]]; then
      report fail "binary:$bin" "missing (required)"
    else
      report warn "binary:$bin" "missing (optional)"
    fi
  fi
}

check_path_exists() {
  local type="$1" rel="$2"
  local abs="$ROOT_DIR/$rel"
  if [[ "$type" == "dir" ]]; then
    if [[ -d "$abs" ]]; then
      report pass "path:$rel" "directory present"
    else
      report fail "path:$rel" "missing directory"
    fi
  else
    if [[ -f "$abs" ]]; then
      report pass "path:$rel" "file present"
    else
      report fail "path:$rel" "missing file"
    fi
  fi
}

check_watch_root() {
  local root="$1"
  if [[ -z "$root" ]]; then
    return
  fi
  if [[ -d "$root" ]]; then
    report pass "watch_root:$root" "mounted/exists"
  else
    report warn "watch_root:$root" "not mounted"
  fi
}

main() {
  section "PS4 Mission Control Doctor ($(stamp))"
  report pass "root" "$ROOT_DIR"

  section "OS"
  if [[ "$OSTYPE" == darwin* ]]; then
    report pass "os" "$OSTYPE"
  else
    report warn "os" "non-macOS ($OSTYPE) - scripts are mac-first"
  fi

  section "Required Binaries"
  check_bin required python3
  check_bin required sqlite3
  check_bin required curl
  check_bin required open

  section "Optional Binaries"
  check_bin optional jq
  check_bin optional docker
  check_bin optional scp
  check_bin optional ssh

  section "Repository Structure"
  check_path_exists dir mission-control
  check_path_exists dir scripts
  check_path_exists dir ftp-sync
  check_path_exists file mission-control/server.py
  check_path_exists file mission-control/index.html
  check_path_exists file generate_installed_lists.sh
  check_path_exists file generate_external_lists.sh
  check_path_exists file generate_external_uninstalled.sh
  check_path_exists file generate_updates_pending.sh
  check_path_exists file scripts/fetch_ps4_ftp_snapshot.py
  check_path_exists file app.db
  check_path_exists file addcont.db

  section "Watch Roots"
  IFS=',' read -r -a roots <<< "$WATCH_ROOTS"
  for root in "${roots[@]}"; do
    root="$(echo "$root" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    check_watch_root "$root"
  done

  section "Summary"
  if [[ "$JSON_MODE" -eq 0 ]]; then
    echo "PASS: $PASS_COUNT  WARN: $WARN_COUNT  FAIL: $FAIL_COUNT"
  else
    printf '{"root":"%s","pass":%d,"warn":%d,"fail":%d,"results":[%s]}\n' \
      "$ROOT_DIR" "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT" "$RESULTS_JSON"
  fi

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    exit 2
  fi
  exit 0
}

main "$@"

