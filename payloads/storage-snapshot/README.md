# PS4 Storage Snapshot Payload

Handoff-ready guide for the one-shot payload used by Mission Control to read PS4 internal/external free space.

## Purpose
This payload runs once on PS4, writes storage metrics to:

- `/data/ps4-storage.json`

Then exits immediately.

Mission Control imports this file during snapshot refresh and displays:

- `Internal Free`
- `External Free`
- values formatted as `GB` and `% free`

## What It Measures

Mounts probed:

- Internal: `/user`
- External: `/mnt/ext0` (if mounted)

Fields written:

- `total_bytes`
- `free_bytes`
- `used_bytes`

## Output Contract

Expected JSON shape:

```json
{
  "status": "ready",
  "generated_at": "runtime",
  "storage": {
    "internal": {
      "mount": "/user",
      "total_bytes": 123,
      "free_bytes": 45,
      "used_bytes": 78
    },
    "external": null
  }
}
```

Notes:

- If external is mounted, `storage.external` is an object.
- If external is not mounted, `storage.external` is `null`.

## Files in This Folder

- `main.c` - payload source
- `Makefile` - payload build recipe (reuses DPI payload toolchain bits)
- `send_payload.py` - send binary to PS4 binloader port
- `build_payload.sh` - local helper/guard script

## Build Environments

### Preferred: Synology NAS (x86_64) + Docker

This is the recommended build path for this project.

Why:

- Local Mac is Apple Silicon and not a compatible direct payload toolchain host.
- NAS is x86_64 and already has Docker.

### Local Mac (Apple Silicon)

Source editing is fine. Direct payload compile is not recommended with stock clang/ld.

## NAS Build Workflow (Reusable)

### 1) Create reusable builder image (run once on NAS)

```bash
sudo /usr/local/bin/docker build -t ps4-payload-builder:latest -<<'EOF'
FROM ubuntu:22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential yasm python3 git && \
  rm -rf /var/lib/apt/lists/*
EOF
```

### 2) Prepare NAS build folder (from Mac)

```bash
ssh -i ~/.ssh/homeport -p 2222 skipper@homeport.synology.me 'mkdir -p ~/ps4-storage-build'
scp -O -i ~/.ssh/homeport -P 2222 -r ~/git/PS4/payloads/storage-snapshot/* skipper@homeport.synology.me:~/ps4-storage-build/
```

### 3) Build payload (run on NAS)

```bash
sudo -n /usr/local/bin/docker run --rm -v /var/services/homes/skipper/ps4-storage-build:/work ps4-payload-builder:latest bash -lc "set -e; if [ ! -d /tmp/DirectPackageInstaller ]; then git clone --depth=1 https://github.com/marcussacana/DirectPackageInstaller /tmp/DirectPackageInstaller >/dev/null; fi; make -C /work clean || true; make -C /work DPI_PAYLOAD_DIR=/tmp/DirectPackageInstaller/Payload; chown $(id -u):$(id -g) /work/payload.bin /work/payload.elf; ls -lh /work/payload.bin /work/payload.elf"
```

### 4) Pull artifact back to Mac

```bash
scp -O -i ~/.ssh/homeport -P 2222 skipper@homeport.synology.me:~/ps4-storage-build/payload.bin ~/git/PS4/payloads/storage-snapshot/payload.bin
```

## Deploy Payload to PS4

In this environment, payload send is using port `9090`.

```bash
python3 ~/git/PS4/payloads/storage-snapshot/send_payload.py --host 192.168.0.26 --port 9090 --file ~/git/PS4/payloads/storage-snapshot/payload.bin
```

If your setup changes, adjust host/port.

## Verify End-to-End

1. Send payload
2. Pull new FTP snapshot
3. Confirm JSON exists
4. Refresh Mission Control

Commands:

```bash
python3 ~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py --non-interactive --ip 192.168.0.26 --port 2121
cat "$(cat ~/git/PS4/ftp-sync/latest/last_snapshot_path.txt)/storage/ps4-storage.json"
```

Then click `Refresh Storage` or `Refresh Data` in Mission Control.

## Mission Control Integration

- Storage file import: `scripts/fetch_ps4_ftp_snapshot.py`
- Backend parse and API: `mission-control/server.py`
  - `/api/state` includes `ps4Storage`
  - `/api/refresh-storage` sends payload + snapshots + parses storage
- Frontend render: `mission-control/app.js`

## Troubleshooting

### Send fails with `Connection refused`

- Binloader port is not open on PS4.
- Confirm which port your setup accepts payload on.

### Snapshot shows `"storage_json": 0`

- Payload did not run or did not write `/data/ps4-storage.json`.
- Re-send payload, then re-run snapshot.

### `scp` says permission denied on NAS artifact

- Build artifact may be root-owned.
- Use `chown` in container command (already included above).

### Mission Control still shows `--`

- Server may be running old code; restart it.
- Ensure latest snapshot pointer moved and storage file exists.

## Security / Safety

- This payload is read-only for storage stats except writing one JSON file to `/data`.
- No package install or DB modification is performed.

## Maintenance Notes

- Keep output keys stable (`storage.internal`, `storage.external`, byte fields).
- If adding new mounts, keep existing keys for backward compatibility.
- If payload port changes, update `PS4_BINLOADER_PORT` in server env.
