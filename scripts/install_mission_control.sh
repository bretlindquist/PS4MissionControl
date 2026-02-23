#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
SKIP_DOCTOR=0
RUN_DOCTOR_JSON=0
NON_INTERACTIVE=0

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$ROOT_DIR/.ps4mc"
CONFIG_FILE="$CONFIG_DIR/config.env"
DOCTOR_SCRIPT="$ROOT_DIR/scripts/doctor_mission_control.sh"

PS4_IP_DEFAULT="${PS4_IP_DEFAULT:-192.168.0.26}"
FTP_PORT_DEFAULT="${FTP_PORT_DEFAULT:-2121}"
RPI_PORT_DEFAULT="${RPI_PORT_DEFAULT:-12800}"
BINLOADER_PORT_DEFAULT="${BINLOADER_PORT_DEFAULT:-9090}"
WATCH_ROOTS_DEFAULT="${WATCH_ROOTS_DEFAULT:-/Volumes/PS4,/Volumes/MagicLantern}"
MAX_DEPTH_DEFAULT="${MAX_DEPTH_DEFAULT:-12}"
INCLUDE_ARCHIVES_DEFAULT="${INCLUDE_ARCHIVES_DEFAULT:-0}"

PS4_IP="$PS4_IP_DEFAULT"
FTP_PORT="$FTP_PORT_DEFAULT"
RPI_PORT="$RPI_PORT_DEFAULT"
BINLOADER_PORT="$BINLOADER_PORT_DEFAULT"
WATCH_ROOTS="$WATCH_ROOTS_DEFAULT"
MAX_DEPTH="$MAX_DEPTH_DEFAULT"
INCLUDE_ARCHIVES="$INCLUDE_ARCHIVES_DEFAULT"

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
}

write_config() {
  run_cmd "mkdir -p \"$CONFIG_DIR\""
  local tmp_file="$CONFIG_FILE.tmp"
  local contents
  contents="$(cat <<EOF
PS4_IP="$PS4_IP"
FTP_PORT="$FTP_PORT"
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

print_next_steps() {
  echo
  ok "Installer foundation completed."
  echo "Next steps:"
  echo "  1) Start server: python3 \"$ROOT_DIR/mission-control/server.py\""
  echo "  2) Open app:      http://localhost:8787/mission-control/"
  echo "  3) Open Settings and confirm PS4 IP/ports/watch roots."
  echo
  echo "Config file:"
  echo "  $CONFIG_FILE"
}

main() {
  parse_args "$@"
  info "PS4 Mission Control installer (Chunk 0/1/2)"
  info "Root: $ROOT_DIR"
  check_os
  ensure_repo
  load_existing_config
  run_config_wizard
  write_config
  ensure_scripts_executable
  run_doctor
  print_next_steps
}

main "$@"
