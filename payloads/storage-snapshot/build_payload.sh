#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DPI_PAYLOAD_DIR="${DPI_PAYLOAD_DIR:-/tmp/DirectPackageInstaller/Payload}"

if [[ ! -d "$DPI_PAYLOAD_DIR" ]]; then
  echo "Missing $DPI_PAYLOAD_DIR"
  echo "Run: git clone --depth=1 https://github.com/marcussacana/DirectPackageInstaller /tmp/DirectPackageInstaller"
  exit 2
fi

if ! command -v yasm >/dev/null 2>&1; then
  echo "Missing dependency: yasm"
  echo "macOS: brew install yasm"
  exit 2
fi

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  cat <<MSG
This host is macOS arm64. PS4 payload build needs an x86_64 FreeBSD-style toolchain.
The stock Apple clang/ld cannot produce a valid payload here.

Use one of these:
1) Build on an x86_64 Linux/macOS host with the expected payload toolchain.
2) Build in a container/VM configured for PS4 payload cross-compilation.

Source is ready at: $ROOT_DIR/main.c
MSG
  exit 3
fi

make -C "$ROOT_DIR" DPI_PAYLOAD_DIR="$DPI_PAYLOAD_DIR"
echo "Built payload: $ROOT_DIR/payload.bin"
