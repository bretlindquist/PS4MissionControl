# PS4 Mission Control Workspace

Handoff-ready documentation for the PS4 inventory + dashboard stack in `~/git/PS4`.

## Release Status

- Core inventory/visualization/export features: **Stable**
- Remote send/install path (`Send to PS4` via RPI): **Beta**

Beta send/install notes:

- Depends on PS4 payload/RPI state, network pathing, and package compatibility.
- Failure/retry behavior is improving but not fully deterministic yet.
- Keep expectations clear in public release notes.

## Overview
This project does four things:

1. Pulls read-only PS4 metadata snapshots over FTP.
2. Generates markdown inventories for installed/external/update/DLC/theme/archive views.
3. Serves a local Mission Control web app and PS4-style category view.
4. Optionally refreshes PS4 storage KPIs using a one-shot payload (`/data/ps4-storage.json`).

## What This Is / Isn't

This is:

- A local-first PS4 library operations dashboard.
- A read-only metadata aggregator (FTP snapshot + local scans).
- A workflow tool for inventory, classification, category planning, and optional beta remote send.

This is not:

- A piracy/downloader platform.
- A jailbreak exploit delivery tool.
- A guarantee that remote send/install will always succeed in every environment.

## 60-Second Quick Start

1. Start server:

```bash
python3 ~/git/PS4/mission-control/server.py
```

2. Open app:

```bash
open http://localhost:8787/mission-control/
```

3. Open `Settings` (gear):
   - set `PS4 IP`
   - set `FTP Port` (default `2121`)
   - set `RPI Port` (default `12800`)
   - set watch roots if needed

4. Click `Refresh Data`.

5. Use:
   - `Uninstalled Games` for deduped install targets
   - `Uninstalled Packages` for raw package-level actions
   - `All Packages` for full inventory/audit

## Known Limitations

- Classification is filename/path heuristic-based and can be wrong on edge naming.
- `CUSA` extraction strongly improves matching; files without CUSA degrade confidence.
- Remote send/install remains **Beta** and may fail depending on RPI/server state.
- Visual metadata completeness depends on available icon/title cache + naming quality.
- UI relies on local browser storage for some settings/state.

## Screenshot Checklist (For Release Post)

- Mission Control overview (KPIs + Saved Views).
- Uninstalled Games table (deduped targets).
- Uninstalled Packages table (raw package entries).
- Drive Scan Uninstalled (Visual) + Selection Details.
- Settings drawer (connection + safety + defaults).
- Optional: RPI Tasks card with a successful queued/send example.

## Repository Layout

- Root: `~/git/PS4`
- Web app: `~/git/PS4/mission-control`
- Scripts: `~/git/PS4/scripts`
- Snapshot root: `~/git/PS4/ftp-sync`
- Snapshot pointer: `~/git/PS4/ftp-sync/latest/last_snapshot_path.txt`
- Payload project: `~/git/PS4/payloads/storage-snapshot`
- Installer roadmap: `~/git/PS4/INSTALLER_IMPLEMENTATION_CHECKLIST.md`
- Knowledge notes: `~/git/PS4/PS4_DATA_HARDENING_NOTES.md`
- UI design brief: `~/git/PS4/COOL-SITE-INSTRUCTIONS-2026.md`

## Runtime Requirements

- macOS with `python3`
- Local browser
- PS4 reachable on LAN for FTP snapshot refresh
- Mounted external drives expected by scanning scripts:
  - `/Volumes/PS4`
  - `/Volumes/MagicLantern`

Optional:
- Synology NAS + Docker for payload compilation

## Environment Variables

- `PS4_MC_PORT` (default `8787`)
- `PS4_IP` (default `192.168.0.26`)
- `PS4_BINLOADER_PORT` (default `9090` in this setup)

Examples:

```bash
PS4_IP=192.168.0.26 PS4_BINLOADER_PORT=9090 python3 ~/git/PS4/mission-control/server.py
```

## Start / Stop

Start:

```bash
python3 ~/git/PS4/mission-control/server.py
open http://localhost:8787/mission-control/
```

Stop + restart:

```bash
pkill -f "mission-control/server.py"
python3 ~/git/PS4/mission-control/server.py
```

## Installer (Chunk 0/1)

Use the new terminal setup scripts:

```bash
# health check (human-readable)
~/git/PS4/scripts/doctor_mission_control.sh

# health check (JSON)
~/git/PS4/scripts/doctor_mission_control.sh --json

# installer dry-run
~/git/PS4/scripts/install_mission_control.sh --dry-run

# installer non-interactive (use existing config/defaults)
~/git/PS4/scripts/install_mission_control.sh --non-interactive

# installer with bootstrap (initial snapshot + list generation)
~/git/PS4/scripts/install_mission_control.sh --bootstrap

# installer with payload deploy step
~/git/PS4/scripts/install_mission_control.sh --deploy-payload

# installer with RPI beta diagnostics
~/git/PS4/scripts/install_mission_control.sh --rpi-diagnostics

# installer actual run
~/git/PS4/scripts/install_mission_control.sh
```

Notes:

- Installer is idempotent and safe to rerun.
- Remote send/install remains **Beta**.

Credential mode behavior (installer config):

- `prompt`: password is not stored. Use terminal sync manually before web `Refresh Data`.
- `keychain`: password is stored in macOS Keychain; config stores only reference key.
- `config`: password stored in `.ps4mc/config.env` (plaintext, `chmod 600` enforced).

## Data Model and Source-of-Truth

Installed app data comes from `app.db` (latest snapshot copy preferred):

- Installed app rows: `tbl_appbrowse_0507646227`
- Folder/category mappings: `tbl_appbrowse_0507646226`
- Version keys: `tbl_appinfo` values `APP_VER`, `VERSION`

Installed game inclusion rule:

- `titleId LIKE 'CUSA%'`
- `category LIKE 'gd%'`
- `titleName` non-empty
- `contentSize > 0`

## Refresh Flows

### `Refresh Data` button (`POST /api/refresh`)

Runs:

1. `scripts/fetch_ps4_ftp_snapshot.py --non-interactive`
2. `generate_installed_lists.sh`
3. `generate_external_lists.sh`
4. `generate_external_uninstalled.sh`
5. `generate_updates_pending.sh`

Behavior:

- If FTP snapshot fails, list generation still runs from existing local data.
- API returns warning when snapshot step fails.

### `Refresh Storage` button (`POST /api/refresh-storage`)

Runs:

1. Sends `payloads/storage-snapshot/payload.bin` to binloader (`PS4_IP:PS4_BINLOADER_PORT`)
2. Runs `scripts/fetch_ps4_ftp_snapshot.py --non-interactive`
3. Reads latest `storage/ps4-storage.json`
4. Updates KPI state (`Internal Free`, `External Free`)

## Generated Markdown Outputs

- `GAMES_LIST.md`
- `INSTALLED_DLC_LIST.md`
- `UPDATES_PENDING_LIST.md`
- `EXTERNAL_GAMES_LIST.md`
- `EXTERNAL_UNINSTALLED_GAMES.md`
- `EXTERNAL_DLC_LIST.md`
- `EXTERNAL_THEMES_LIST.md`
- `EXTERNAL_NON_GAMES_LIST.md`
- `EXTERNAL_ARCHIVES_REVIEW.md`

## External Uninstalled Detection Logic

Generated by:

- `generate_external_uninstalled.sh`
- `scripts/generate_external_uninstalled.py`

Behavior:

- Scans `.pkg` files on `/Volumes/PS4` and `/Volumes/MagicLantern`
- Extracts `CUSAxxxxx` from filenames when available
- Resolves title by priority:
  1. Installed DB title
  2. `ps4-title-cache.json`
  3. TMDB lookup
  4. Filename normalization fallback
- Marks each candidate as installed/not installed
- Keeps no-CUSA candidates in manual-review section

## Mission Control UI Behavior

- Saved views and workflow chips drive table view state.
- Permanent cards include:
  - `Drive Scan Uninstalled`
  - `Uninstalled Games`
- Row behavior:
  - single click copies preferred ID (`CUSA`, `Title ID`, `Content ID`)
  - double click reveals file in Finder (`/api/open-path`)
- KPIs include:
  - installed count
  - external game PKG count
  - uninstalled candidates
  - watch list count
  - PS4 online status
  - internal/external free space (GB + %)

### Settings Drawer (Gear)

Settings are local-browser persisted and now include:

- Connection:
  - PS4 IP
  - FTP port
  - RPI port
  - Binloader port
- Paths & Scan:
  - watch roots (path-prefix filter for UI datasets)
  - max path-depth filter
  - include archives toggle
- Send Defaults:
  - preflight requirement (PS4/RPI online)
  - retry count
  - retry backoff (ms)
- Classification Rules:
  - ambiguous package policy (`unknown` / force `game` / force `non_game`)
- UI Defaults:
  - default saved view
  - default sort key + direction
  - density (`comfortable`/`compact`)
  - sticky visual details pane toggle
- Behavior & Safety:
  - auto refresh on load
  - confirm before send
  - auto extract missing icons
  - enable/disable Finder reveal on double-click
  - confirm bulk clear actions
- Data & Cache:
  - thumb-cache clear (via `/api/thumb-cache-clear`)
  - force reindex (runs Refresh Data)
- Integrations:
  - open `README.md`
  - open `PS4MISSIONCONTROL_INSTALLER_SPEC.md`
- Export:
  - CSV profile (`full` / `minimal`)

## PS4 View Behavior

- Uses effective snapshot `app.db` first, local root DB as fallback.
- Icon resolution order:
  1. snapshot-local icon0 assets
  2. TMDB icon fallback
- Refresh spinner and fixed-size controls are implemented.

## FTP Snapshot Script

Script: `scripts/fetch_ps4_ftp_snapshot.py`

Defaults:

- IP: `192.168.0.26`
- Port: `2121`
- Login: anonymous

Also fetches if present:

- `/data/ps4-storage.json` -> `ftp-sync/<snapshot>/storage/ps4-storage.json`

Manual runs:

```bash
python3 ~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py
python3 ~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py --non-interactive --ip 192.168.0.26 --port 2121
```

## Storage Payload (One-shot)

Project path:

- `payloads/storage-snapshot`

Purpose:

- Reads `statfs` on `/user` and `/mnt/ext0`
- Writes `/data/ps4-storage.json`
- Exits (no long-running daemon)

Payload docs:

- `payloads/storage-snapshot/README.md`
- `PS4_STORAGE_PAYLOAD_SPEC.md`

### Current binloader port note

In this environment, payload sending succeeded on `9090`.
`PS4_BINLOADER_PORT` is configurable if this changes.

## Synology Build Workflow (Recommended)

Build payload with Docker on NAS x86_64 environment.

Prereq notes (from `~/git/tmp/README.md`):

- NAS SSH target: `homeport.synology.me:2222`
- User: `skipper`
- Docker binary: `/usr/local/bin/docker`

Typical flow:

1. Sync source to NAS build folder (`~/ps4-storage-build`)
2. Build payload in Docker
3. Copy `payload.bin` back to Mac
4. Send payload to PS4

## Operational Runbook (End-to-End)

### Daily use

1. Start server
2. Open Mission Control
3. Click `Refresh Data`

### Refresh free-space only

1. Ensure PS4 payload/binloader server is active
2. Click `Refresh Storage`

### Manual CLI free-space refresh

```bash
python3 ~/git/PS4/payloads/storage-snapshot/send_payload.py --host 192.168.0.26 --port 9090 --file ~/git/PS4/payloads/storage-snapshot/payload.bin
python3 ~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py --non-interactive --ip 192.168.0.26 --port 2121
```

## Troubleshooting

### UI doesn’t reflect code changes

- Hard refresh browser
- Restart server
- Ensure versioned assets were synced:
  - `mission-control/app.js` -> `mission-control/app.20260221.js`
  - `mission-control/styles.css` -> `mission-control/styles.20260221.css`

### `Refresh Storage` returns failure

Check in order:

1. payload file exists:
   - `~/git/PS4/payloads/storage-snapshot/payload.bin`
2. binloader port is open on PS4
3. send payload succeeds
4. snapshot count shows `storage_json: 1`
5. file exists in latest snapshot:
   - `$(cat ~/git/PS4/ftp-sync/latest/last_snapshot_path.txt)/storage/ps4-storage.json`

### Storage KPIs still show `--`

- Payload did not write `/data/ps4-storage.json`, or snapshot imported older run.
- Run send + snapshot manually, then click `Refresh Data` or `Refresh Storage`.

### FTP snapshot issues

- Verify PS4 FTP service is reachable
- If snapshot fails, list generation may still succeed using local prior data

### Permission issues when building on NAS

- Docker may write root-owned artifacts in bind mount
- Use `chown` step in container build command or rebuild with proper ownership handling

## Quick Commands

```bash
# Server restart
pkill -f "mission-control/server.py"
python3 ~/git/PS4/mission-control/server.py

# Rebuild lists only
~/git/PS4/generate_installed_lists.sh
~/git/PS4/generate_external_lists.sh
~/git/PS4/generate_external_uninstalled.sh
~/git/PS4/generate_updates_pending.sh

# Verify latest storage JSON
cat "$(cat ~/git/PS4/ftp-sync/latest/last_snapshot_path.txt)/storage/ps4-storage.json"
```

## Known Constraints

- Free-space values depend on successful payload execution and snapshot import.
- PS4 endpoints vary by jailbreak/payload setup; port defaults may require adjustment.
- External drive classification relies on filename metadata and may include edge-case false positives.

## Handoff Checklist

For a new maintainer:

1. Verify PS4 connectivity (`FTP`, status endpoint, binloader port)
2. Run `Refresh Data` and confirm markdown files update
3. Run `Refresh Storage` and confirm KPI values populate
4. Verify one row copy + double-click Finder behavior
5. Verify `PS4 View` loads folders/icons correctly
6. Confirm external scans include both configured volume roots
