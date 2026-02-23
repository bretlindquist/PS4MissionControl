# PS4 Mission Control Installer Checklist

Chunked implementation plan for a terminal-based installer/bootstrap flow.

## Scope

- Target root: `~/git/PS4`
- Goal: reproducible first-time setup for new users
- Non-goal (for now): packaged app bundle

## Chunk 0: Foundation

- [ ] Create installer entry script (suggested: `scripts/install_mission_control.sh`)
- [ ] Add strict shell flags and OS checks (`set -euo pipefail`, macOS guard)
- [ ] Add common logging helpers (`info`, `warn`, `error`, `ok`)
- [ ] Add dry-run mode
- [ ] Add idempotent rerun behavior

## Chunk 1: Dependency + Environment Doctor

- [ ] Add doctor script (suggested: `scripts/doctor_mission_control.sh`)
- [ ] Check for required binaries (`python3`, `sqlite3`, `curl`, `open`)
- [ ] Check optional binaries (`jq`, `docker`, `scp`, `ssh`)
- [ ] Validate repository structure exists
- [ ] Validate mounted watch volumes (if configured)
- [ ] Output clear pass/fail matrix

## Chunk 2: Interactive Config Wizard

- [ ] Prompt for PS4 IP (default `192.168.0.26`)
- [ ] Prompt for FTP port (default `2121`)
- [ ] Prompt for RPI port (default `12800`)
- [ ] Prompt for binloader port (default `9090`)
- [ ] Prompt for watch roots (comma-separated)
- [ ] Prompt for max scan depth
- [ ] Prompt for include archives toggle
- [ ] Persist config to local settings file/json

## Chunk 3: Credential Strategy

- [ ] Offer mode A: no password persistence (prompt each run)
- [ ] Offer mode B: macOS Keychain storage + retrieval
- [ ] Implement one-time prompt flow for mode A
- [ ] Implement keychain get/set/delete for mode B
- [ ] Add explicit warning text for mode A:
      manual refresh required from terminal when password prompt is needed

## Chunk 4: Data Bootstrap

- [ ] Run FTP snapshot fetch script once
- [ ] Generate all markdown lists
- [ ] Warm title/icon caches where possible
- [ ] Validate outputs exist and are non-empty where expected
- [ ] Print summary of generated artifacts

## Chunk 5: Storage Payload Integration

- [ ] Verify payload binary exists (`payloads/storage-snapshot/payload.bin`)
- [ ] If missing, print build instructions (NAS Docker path)
- [ ] Optional prompt to send payload to binloader now
- [ ] Validate storage JSON appears in latest snapshot
- [ ] Print internal/external free space summary

## Chunk 6: RPI (Beta) Integration

- [ ] Detect/report RPI endpoint health
- [ ] Mark all RPI install/send flows as **Beta**
- [ ] Add guarded test send workflow (small package, explicit confirmation)
- [ ] Record send diagnostics path for troubleshooting

## Chunk 7: Mission Control Launch + Verification

- [ ] Start server with resolved config
- [ ] Open browser URL automatically
- [ ] Verify `/api/state` returns 200
- [ ] Verify `Refresh Data` works end-to-end
- [ ] Verify `Refresh Storage` works when payload is available

## Chunk 8: UX + Safety Hardening

- [ ] Add uninstall/reset script for local config state
- [ ] Add backup/export of local settings
- [ ] Add clear failure hints for common edge cases
- [ ] Add colored, concise terminal output
- [ ] Add non-interactive flags for automation

## Chunk 9: Docs + Handoff

- [ ] Add installer section to `README.md`
- [ ] Document password modes and tradeoffs
- [ ] Document doctor output meanings
- [ ] Document troubleshooting decision tree
- [ ] Add release checklist for Reddit/public posting

## Exit Criteria

- [ ] Fresh machine can install + run Mission Control in under 5 minutes
- [ ] Doctor identifies missing deps with actionable fixes
- [ ] Config can be edited without touching code
- [ ] Beta features are clearly labeled and isolated from stable flows
