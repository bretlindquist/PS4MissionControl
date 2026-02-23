#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
SKIP_DOCTOR=0
RUN_DOCTOR_JSON=0

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$ROOT_DIR/.ps4mc"
CONFIG_FILE="$CONFIG_DIR/config.env"
DOCTOR_SCRIPT="$ROOT_DIR/scripts/doctor_mission_control.sh"

PS4_IP_DEFAULT="${PS4_IP_DEFAULT:-192.168.0.26}"
FTP_PORT_DEFAULT="${FTP_PORT_DEFAULT:-2121}"
RPI_PORT_DEFAULT="${RPI_PORT_DEFAULT:-12800}"
BINLOADER_PORT_DEFAULT="${BINLOADER_PORT_DEFAULT:-9090}"
WATCH_ROOTS_DEFAULT="${WATCH_ROOTS_DEFAULT:-/Volumes/PS4,/Volumes/MagicLantern}"

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

ensure_config() {
  run_cmd "mkdir -p \"$CONFIG_DIR\""
  if [[ ! -f "$CONFIG_FILE" ]]; then
    info "Creating config file: $CONFIG_FILE"
    run_cmd "cat > \"$CONFIG_FILE\" <<'EOF'
PS4_IP=\"$PS4_IP_DEFAULT\"
FTP_PORT=\"$FTP_PORT_DEFAULT\"
RPI_PORT=\"$RPI_PORT_DEFAULT\"
BINLOADER_PORT=\"$BINLOADER_PORT_DEFAULT\"
WATCH_ROOTS=\"$WATCH_ROOTS_DEFAULT\"
EOF"
    run_cmd "chmod 600 \"$CONFIG_FILE\""
    ok "Created default config"
  else
    ok "Config already exists (idempotent): $CONFIG_FILE"
    run_cmd "chmod 600 \"$CONFIG_FILE\""
  fi
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
}

main() {
  parse_args "$@"
  info "PS4 Mission Control installer (Chunk 0/1)"
  info "Root: $ROOT_DIR"
  check_os
  ensure_repo
  ensure_config
  ensure_scripts_executable
  run_doctor
  print_next_steps
}

main "$@"

