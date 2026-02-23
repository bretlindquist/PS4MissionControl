#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
SKIP_DOCTOR=0
RUN_DOCTOR_JSON=0
NON_INTERACTIVE=0
BOOTSTRAP_MODE="ask"
DEPLOY_PAYLOAD_MODE="ask"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$ROOT_DIR/.ps4mc"
CONFIG_FILE="$CONFIG_DIR/config.env"
DOCTOR_SCRIPT="$ROOT_DIR/scripts/doctor_mission_control.sh"
PAYLOAD_BIN="$ROOT_DIR/payloads/storage-snapshot/payload.bin"
PAYLOAD_SEND_SCRIPT="$ROOT_DIR/payloads/storage-snapshot/send_payload.py"
LATEST_SNAPSHOT_PTR="$ROOT_DIR/ftp-sync/latest/last_snapshot_path.txt"

PS4_IP_DEFAULT="${PS4_IP_DEFAULT:-192.168.0.26}"
FTP_PORT_DEFAULT="${FTP_PORT_DEFAULT:-2121}"
RPI_PORT_DEFAULT="${RPI_PORT_DEFAULT:-12800}"
BINLOADER_PORT_DEFAULT="${BINLOADER_PORT_DEFAULT:-9090}"
WATCH_ROOTS_DEFAULT="${WATCH_ROOTS_DEFAULT:-/Volumes/PS4,/Volumes/MagicLantern}"
MAX_DEPTH_DEFAULT="${MAX_DEPTH_DEFAULT:-12}"
INCLUDE_ARCHIVES_DEFAULT="${INCLUDE_ARCHIVES_DEFAULT:-0}"
FTP_USERNAME_DEFAULT="${FTP_USERNAME_DEFAULT:-anonymous}"
CREDENTIAL_MODE_DEFAULT="${CREDENTIAL_MODE_DEFAULT:-keychain}"
if [[ "$OSTYPE" != darwin* ]]; then
  CREDENTIAL_MODE_DEFAULT="prompt"
fi

PS4_IP="$PS4_IP_DEFAULT"
FTP_PORT="$FTP_PORT_DEFAULT"
RPI_PORT="$RPI_PORT_DEFAULT"
BINLOADER_PORT="$BINLOADER_PORT_DEFAULT"
WATCH_ROOTS="$WATCH_ROOTS_DEFAULT"
MAX_DEPTH="$MAX_DEPTH_DEFAULT"
INCLUDE_ARCHIVES="$INCLUDE_ARCHIVES_DEFAULT"
FTP_USERNAME="$FTP_USERNAME_DEFAULT"
FTP_CREDENTIAL_MODE="$CREDENTIAL_MODE_DEFAULT"
FTP_PASSWORD=""
FTP_PASSWORD_REF=""

color() {
  local code="$1"; shift
  printf "\033[%sm%s\033[0m" "$code" "$*"
}

info() { echo "$(color 36 INFO)  $*"; }
ok() { echo "$(color 32 OK)    $*"; }
warn() { echo "$(color 33 WARN)  $*"; }
error() { echo "$(color 31 ERROR) $*" >&2; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --dry-run        Print actions only; do not mutate files
  --non-interactive  Use defaults/current config and do not prompt
  --bootstrap      Run initial FTP snapshot + list generation
  --no-bootstrap   Skip bootstrap
  --deploy-payload      Deploy storage payload during install
  --no-deploy-payload   Skip payload deployment
  --skip-doctor    Skip doctor execution
  --doctor-json    Run doctor in JSON mode (still enforces exit code)
  -h, --help       Show help
EOF
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=1 ;;
      --non-interactive) NON_INTERACTIVE=1 ;;
      --bootstrap) BOOTSTRAP_MODE="yes" ;;
      --no-bootstrap) BOOTSTRAP_MODE="no" ;;
      --deploy-payload) DEPLOY_PAYLOAD_MODE="yes" ;;
      --no-deploy-payload) DEPLOY_PAYLOAD_MODE="no" ;;
      --skip-doctor) SKIP_DOCTOR=1 ;;
      --doctor-json) RUN_DOCTOR_JSON=1 ;;
      -h|--help) usage; exit 0 ;;
      *) error "Unknown argument: $1"; usage; exit 1 ;;
    esac
    shift
  done
}

check_os() {
  if [[ "$OSTYPE" != darwin* ]]; then
    warn "Non-macOS detected ($OSTYPE). Installer is mac-first."
  else
    ok "macOS detected"
  fi
}

ensure_repo() {
  if [[ ! -d "$ROOT_DIR/mission-control" || ! -f "$ROOT_DIR/mission-control/server.py" ]]; then
    error "Expected PS4 Mission Control repo root at: $ROOT_DIR"
    exit 1
  fi
  ok "Repo root verified: $ROOT_DIR"
}

load_existing_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    PS4_IP="${PS4_IP:-$PS4_IP_DEFAULT}"
    FTP_PORT="${FTP_PORT:-$FTP_PORT_DEFAULT}"
    FTP_USERNAME="${FTP_USERNAME:-$FTP_USERNAME_DEFAULT}"
    FTP_CREDENTIAL_MODE="${FTP_CREDENTIAL_MODE:-$CREDENTIAL_MODE_DEFAULT}"
    FTP_PASSWORD_REF="${FTP_PASSWORD_REF:-}"
    FTP_PASSWORD="${FTP_PASSWORD:-}"
    RPI_PORT="${RPI_PORT:-$RPI_PORT_DEFAULT}"
    BINLOADER_PORT="${BINLOADER_PORT:-$BINLOADER_PORT_DEFAULT}"
    WATCH_ROOTS="${WATCH_ROOTS:-$WATCH_ROOTS_DEFAULT}"
    MAX_DEPTH="${MAX_DEPTH:-$MAX_DEPTH_DEFAULT}"
    INCLUDE_ARCHIVES="${INCLUDE_ARCHIVES:-$INCLUDE_ARCHIVES_DEFAULT}"
  fi
}

validate_port() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  (( value >= 1 && value <= 65535 )) || return 1
  return 0
}

prompt_value() {
  local label="$1" current="$2" outvar="$3"
  local input=""
  read -r -p "$label [$current]: " input || true
  input="${input:-$current}"
  printf -v "$outvar" '%s' "$input"
}

prompt_yes_no() {
  local label="$1" current="$2" outvar="$3"
  local current_label="n"
  [[ "$current" == "1" ]] && current_label="y"
  local input=""
  read -r -p "$label (y/n) [$current_label]: " input || true
  input="${input:-$current_label}"
  input="$(echo "$input" | tr '[:upper:]' '[:lower:]')"
  if [[ "$input" == "y" || "$input" == "yes" || "$input" == "1" ]]; then
    printf -v "$outvar" '%s' "1"
  else
    printf -v "$outvar" '%s' "0"
  fi
}

prompt_secret() {
  local label="$1" outvar="$2"
  local input=""
  read -r -s -p "$label: " input || true
  echo
  printf -v "$outvar" '%s' "$input"
}

validate_credential_mode() {
  local mode="$1"
  [[ "$mode" == "prompt" || "$mode" == "keychain" || "$mode" == "config" ]]
}

keychain_ref() {
  echo "ps4mc:ftp:${PS4_IP}:${FTP_PORT}:${FTP_USERNAME}"
}

store_keychain_password() {
  local ref="$1" password="$2"
  if ! command -v security >/dev/null 2>&1; then
    error "macOS security CLI not found; cannot store keychain password"
    return 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] security add-generic-password -a \"$FTP_USERNAME\" -s \"$ref\" -U -w '***'"
    return 0
  fi
  security add-generic-password -a "$FTP_USERNAME" -s "$ref" -U -w "$password" >/dev/null
}

configure_credentials() {
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    if ! validate_credential_mode "$FTP_CREDENTIAL_MODE"; then
      FTP_CREDENTIAL_MODE="$CREDENTIAL_MODE_DEFAULT"
    fi
    if [[ "$FTP_CREDENTIAL_MODE" == "keychain" ]]; then
      FTP_PASSWORD_REF="$(keychain_ref)"
      FTP_PASSWORD=""
    fi
    if [[ "$FTP_CREDENTIAL_MODE" == "prompt" ]]; then
      FTP_PASSWORD=""
      FTP_PASSWORD_REF=""
    fi
    return
  fi

  prompt_value "FTP Username" "$FTP_USERNAME" FTP_USERNAME

  while true; do
    prompt_value "Credential mode (prompt/keychain/config)" "$FTP_CREDENTIAL_MODE" FTP_CREDENTIAL_MODE
    FTP_CREDENTIAL_MODE="$(echo "$FTP_CREDENTIAL_MODE" | tr '[:upper:]' '[:lower:]')"
    validate_credential_mode "$FTP_CREDENTIAL_MODE" && break
    warn "Invalid mode: $FTP_CREDENTIAL_MODE (choose prompt, keychain, or config)"
  done

  FTP_PASSWORD=""
  FTP_PASSWORD_REF=""

  case "$FTP_CREDENTIAL_MODE" in
    prompt)
      info "Prompt mode selected."
      warn "Website refresh cannot run passworded FTP sync in this mode."
      warn "Run terminal sync manually, then click Refresh Data in web UI."
      ;;
    keychain)
      if [[ "$OSTYPE" != darwin* ]]; then
        warn "Keychain mode requested on non-macOS; switching to prompt mode."
        FTP_CREDENTIAL_MODE="prompt"
      else
        local ref
        ref="$(keychain_ref)"
        prompt_secret "Enter FTP password for keychain storage (leave empty to skip)" FTP_PASSWORD
        if [[ -n "$FTP_PASSWORD" ]]; then
          store_keychain_password "$ref" "$FTP_PASSWORD"
          ok "Stored FTP password in macOS Keychain"
        else
          warn "No password entered; keychain item not updated"
        fi
        FTP_PASSWORD_REF="$ref"
        FTP_PASSWORD=""
      fi
      ;;
    config)
      prompt_secret "Enter FTP password to store in config.env (plaintext)" FTP_PASSWORD
      if [[ -z "$FTP_PASSWORD" ]]; then
        warn "No password entered. Config mode selected but password is empty."
      fi
      ;;
  esac
}

run_config_wizard() {
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    info "Non-interactive mode enabled; using defaults/current config"
    return
  fi
  info "Configuration wizard (press Enter to keep current value)"

  prompt_value "PS4 IP" "$PS4_IP" PS4_IP

  while true; do
    prompt_value "FTP Port" "$FTP_PORT" FTP_PORT
    validate_port "$FTP_PORT" && break
    warn "Invalid FTP port: $FTP_PORT (must be 1-65535)"
  done

  while true; do
    prompt_value "RPI Port" "$RPI_PORT" RPI_PORT
    validate_port "$RPI_PORT" && break
    warn "Invalid RPI port: $RPI_PORT (must be 1-65535)"
  done

  while true; do
    prompt_value "Binloader Port" "$BINLOADER_PORT" BINLOADER_PORT
    validate_port "$BINLOADER_PORT" && break
    warn "Invalid binloader port: $BINLOADER_PORT (must be 1-65535)"
  done

  prompt_value "Watch roots (comma-separated)" "$WATCH_ROOTS" WATCH_ROOTS

  while true; do
    prompt_value "Max path depth hint" "$MAX_DEPTH" MAX_DEPTH
    [[ "$MAX_DEPTH" =~ ^[0-9]+$ ]] && (( MAX_DEPTH >= 1 && MAX_DEPTH <= 64 )) && break
    warn "Invalid max depth: $MAX_DEPTH (must be integer 1-64)"
  done

  prompt_yes_no "Include archive rows in views" "$INCLUDE_ARCHIVES" INCLUDE_ARCHIVES
  configure_credentials
}

write_config() {
  run_cmd "mkdir -p \"$CONFIG_DIR\""
  local tmp_file="$CONFIG_FILE.tmp"
  local contents
  contents="$(cat <<EOF
PS4_IP="$PS4_IP"
FTP_PORT="$FTP_PORT"
FTP_USERNAME="$FTP_USERNAME"
FTP_CREDENTIAL_MODE="$FTP_CREDENTIAL_MODE"
FTP_PASSWORD_REF="$FTP_PASSWORD_REF"
FTP_PASSWORD="$FTP_PASSWORD"
RPI_PORT="$RPI_PORT"
BINLOADER_PORT="$BINLOADER_PORT"
WATCH_ROOTS="$WATCH_ROOTS"
MAX_DEPTH="$MAX_DEPTH"
INCLUDE_ARCHIVES="$INCLUDE_ARCHIVES"
EOF
)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    info "Would write config: $CONFIG_FILE"
    printf '%s\n' "$contents"
    return
  fi
  printf '%s\n' "$contents" > "$tmp_file"
  mv "$tmp_file" "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  ok "Config written: $CONFIG_FILE"
}

ensure_scripts_executable() {
  local scripts=(
    "$ROOT_DIR/generate_installed_lists.sh"
    "$ROOT_DIR/generate_external_lists.sh"
    "$ROOT_DIR/generate_external_uninstalled.sh"
    "$ROOT_DIR/generate_updates_pending.sh"
    "$ROOT_DIR/scripts/fetch_ps4_ftp_snapshot.py"
    "$ROOT_DIR/scripts/extract_pkg_icon0.py"
    "$DOCTOR_SCRIPT"
  )
  local s
  for s in "${scripts[@]}"; do
    if [[ -e "$s" ]]; then
      run_cmd "chmod +x \"$s\""
    fi
  done
  ok "Executable bit ensured on runtime scripts"
}

run_doctor() {
  if [[ "$SKIP_DOCTOR" -eq 1 ]]; then
    warn "Skipping doctor by request"
    return
  fi
  if [[ ! -x "$DOCTOR_SCRIPT" ]]; then
    error "Doctor script missing or not executable: $DOCTOR_SCRIPT"
    exit 1
  fi
  info "Running doctor..."
  export PS4MC_WATCH_ROOTS="$WATCH_ROOTS"
  if [[ "$RUN_DOCTOR_JSON" -eq 1 ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] \"$DOCTOR_SCRIPT\" --json"
    else
      "$DOCTOR_SCRIPT" --json | tee "$CONFIG_DIR/doctor-latest.json" >/dev/null
      "$DOCTOR_SCRIPT" >/dev/null
      ok "Doctor JSON saved to $CONFIG_DIR/doctor-latest.json"
    fi
  else
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] \"$DOCTOR_SCRIPT\""
    else
      "$DOCTOR_SCRIPT"
    fi
  fi
}

bootstrap_enabled() {
  if [[ "$BOOTSTRAP_MODE" == "yes" ]]; then
    return 0
  fi
  if [[ "$BOOTSTRAP_MODE" == "no" ]]; then
    return 1
  fi
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    return 1
  fi
  local ans=""
  read -r -p "Run initial data bootstrap now (FTP snapshot + list generation)? (y/n) [y]: " ans || true
  ans="${ans:-y}"
  ans="$(echo "$ans" | tr '[:upper:]' '[:lower:]')"
  [[ "$ans" == "y" || "$ans" == "yes" || "$ans" == "1" ]]
}

deploy_payload_enabled() {
  if [[ "$DEPLOY_PAYLOAD_MODE" == "yes" ]]; then
    return 0
  fi
  if [[ "$DEPLOY_PAYLOAD_MODE" == "no" ]]; then
    return 1
  fi
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    return 1
  fi
  local ans=""
  read -r -p "Deploy storage payload now? (y/n) [n]: " ans || true
  ans="${ans:-n}"
  ans="$(echo "$ans" | tr '[:upper:]' '[:lower:]')"
  [[ "$ans" == "y" || "$ans" == "yes" || "$ans" == "1" ]]
}

read_storage_snapshot_path() {
  if [[ ! -f "$LATEST_SNAPSHOT_PTR" ]]; then
    return 1
  fi
  local snap
  snap="$(tr -d '\r\n' < "$LATEST_SNAPSHOT_PTR")"
  [[ -n "$snap" && -d "$snap" ]] || return 1
  local storage="$snap/storage/ps4-storage.json"
  [[ -f "$storage" ]] || return 1
  printf '%s\n' "$storage"
}

summarize_storage_json() {
  local storage_json="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] summarize $storage_json"
    return
  fi
  python3 - "$storage_json" <<'PY'
import json, sys, os, time
p = sys.argv[1]
try:
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
except Exception as exc:
    print(f"[warn] Could not parse storage JSON: {exc}")
    raise SystemExit(0)
st = data.get("storage") if isinstance(data, dict) else {}
def fmt(obj):
    if not isinstance(obj, dict):
        return "n/a"
    free = obj.get("free_bytes")
    total = obj.get("total_bytes")
    pct = obj.get("free_percent")
    if isinstance(free, int) and isinstance(total, int) and total > 0:
        gb = free / (1024**3)
        return f"{gb:.1f} GB free ({pct if isinstance(pct, (int,float)) else (free/total*100):.1f}%)"
    return "n/a"
print(f"[ok] Storage JSON: {p}")
print(f"     Internal: {fmt(st.get('internal'))}")
print(f"     External: {fmt(st.get('external'))}")
age_sec = max(0, int(time.time() - os.path.getmtime(p)))
print(f"     Freshness: {age_sec}s old")
PY
}

run_payload_step() {
  info "Storage payload step..."
  if [[ ! -f "$PAYLOAD_BIN" ]]; then
    warn "Missing payload binary: $PAYLOAD_BIN"
    warn "Build it first (see payloads/storage-snapshot/README.md)."
    return
  fi
  ok "Payload binary found: $PAYLOAD_BIN"

  if deploy_payload_enabled; then
    info "Deploying payload to ${PS4_IP}:${BINLOADER_PORT}..."
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] python3 \"$PAYLOAD_SEND_SCRIPT\" --host \"$PS4_IP\" --port \"$BINLOADER_PORT\" --file \"$PAYLOAD_BIN\""
    else
      if [[ ! -f "$PAYLOAD_SEND_SCRIPT" ]]; then
        warn "Missing sender script: $PAYLOAD_SEND_SCRIPT"
      else
        python3 "$PAYLOAD_SEND_SCRIPT" --host "$PS4_IP" --port "$BINLOADER_PORT" --file "$PAYLOAD_BIN" || warn "Payload send failed"
      fi
      info "Refreshing FTP snapshot to collect /data/ps4-storage.json..."
      python3 "$ROOT_DIR/scripts/fetch_ps4_ftp_snapshot.py" --non-interactive --ip "$PS4_IP" --port "$FTP_PORT" || warn "Snapshot refresh failed after payload send"
    fi
  else
    info "Skipping payload deployment"
  fi

  local storage_json
  if storage_json="$(read_storage_snapshot_path)"; then
    summarize_storage_json "$storage_json"
  else
    warn "Storage JSON not found yet. Re-send payload and run snapshot refresh."
  fi
}

validate_bootstrap_outputs() {
  local files=(
    "GAMES_LIST.md"
    "INSTALLED_DLC_LIST.md"
    "UPDATES_PENDING_LIST.md"
    "EXTERNAL_GAMES_LIST.md"
    "EXTERNAL_UNINSTALLED_GAMES.md"
    "EXTERNAL_DLC_LIST.md"
    "EXTERNAL_THEMES_LIST.md"
    "EXTERNAL_NON_GAMES_LIST.md"
    "EXTERNAL_ARCHIVES_REVIEW.md"
  )
  local f abs ok_count=0 warn_count=0
  info "Validating generated artifacts..."
  for f in "${files[@]}"; do
    abs="$ROOT_DIR/$f"
    if [[ -s "$abs" ]]; then
      ok_count=$((ok_count + 1))
      printf "  [ok]   %-34s %8s bytes\n" "$f" "$(wc -c < "$abs" | tr -d ' ')"
    else
      warn_count=$((warn_count + 1))
      printf "  [warn] %-34s missing/empty\n" "$f"
    fi
  done
  if [[ "$warn_count" -eq 0 ]]; then
    ok "Bootstrap artifacts look good ($ok_count/${#files[@]})"
  else
    warn "Bootstrap finished with artifact gaps ($ok_count/${#files[@]} present)"
  fi
}

run_data_bootstrap() {
  if ! bootstrap_enabled; then
    info "Skipping bootstrap"
    return
  fi

  info "Running data bootstrap..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] python3 \"$ROOT_DIR/scripts/fetch_ps4_ftp_snapshot.py\" --non-interactive --ip \"$PS4_IP\" --port \"$FTP_PORT\""
    echo "[dry-run] \"$ROOT_DIR/generate_installed_lists.sh\""
    echo "[dry-run] \"$ROOT_DIR/generate_external_lists.sh\""
    echo "[dry-run] \"$ROOT_DIR/generate_external_uninstalled.sh\""
    echo "[dry-run] \"$ROOT_DIR/generate_updates_pending.sh\""
    return
  fi

  local snapshot_rc=0
  python3 "$ROOT_DIR/scripts/fetch_ps4_ftp_snapshot.py" --non-interactive --ip "$PS4_IP" --port "$FTP_PORT" || snapshot_rc=$?
  if [[ "$snapshot_rc" -ne 0 ]]; then
    warn "FTP snapshot step failed (rc=$snapshot_rc); continuing with local data."
  else
    ok "FTP snapshot completed"
  fi

  "$ROOT_DIR/generate_installed_lists.sh"
  "$ROOT_DIR/generate_external_lists.sh"
  "$ROOT_DIR/generate_external_uninstalled.sh"
  "$ROOT_DIR/generate_updates_pending.sh"
  ok "List generation scripts completed"

  validate_bootstrap_outputs
}

print_next_steps() {
  echo
  ok "Installer foundation completed."
  echo "Next steps:"
  echo "  1) Start server: python3 \"$ROOT_DIR/mission-control/server.py\""
  echo "  2) Open app:      http://localhost:8787/mission-control/"
  echo "  3) Open Settings and confirm PS4 IP/ports/watch roots."
  if [[ "$FTP_CREDENTIAL_MODE" == "prompt" ]]; then
    echo
    warn "Prompt credential mode is active."
    warn "Manual terminal FTP sync is required before using web Refresh Data."
  fi
  echo
  echo "Config file:"
  echo "  $CONFIG_FILE"
}

main() {
  parse_args "$@"
  info "PS4 Mission Control installer (Chunk 0/1/2/3)"
  info "Root: $ROOT_DIR"
  check_os
  ensure_repo
  load_existing_config
  run_config_wizard
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
    configure_credentials
  fi
  write_config
  ensure_scripts_executable
  run_data_bootstrap
  run_payload_step
  run_doctor
  print_next_steps
}

main "$@"
