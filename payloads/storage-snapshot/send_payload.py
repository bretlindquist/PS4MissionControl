#!/usr/bin/env python3
"""Send payload.bin to PS4 GoldHEN binloader.

Defaults:
- host: 192.168.0.26
- port: 9020
"""

from __future__ import annotations

import argparse
import socket
from pathlib import Path

DEFAULT_HOST = "192.168.0.26"
DEFAULT_PORT = 9020


def main() -> int:
    parser = argparse.ArgumentParser(description="Send payload.bin to PS4 binloader")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--file", default="payload.bin")
    args = parser.parse_args()

    payload = Path(args.file)
    if not payload.exists():
        print(f"Missing payload file: {payload}")
        return 2

    data = payload.read_bytes()
    if not data:
        print(f"Payload is empty: {payload}")
        return 2

    print(f"Sending {len(data)} bytes to {args.host}:{args.port} ...")
    with socket.create_connection((args.host, args.port), timeout=5) as sock:
        sock.sendall(data)

    print("Sent successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
