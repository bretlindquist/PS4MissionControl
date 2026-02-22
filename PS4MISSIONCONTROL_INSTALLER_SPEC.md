# PS4 Mission Control Installer Spec

## Goal
Create a terminal-based installer and operations CLI that lets a user install and operate PS4 Mission Control on a new machine with minimal manual setup.

The installer must support:
- Configurable watch folders
- PS4 FTP settings (IP, port, user, optional password)
- GoldHEN/binloader settings
- RPI settings
- Payload deployment
- Initial data sync + list generation
- Doctor diagnostics

---

## Deliverables
1. `scripts/install_mission_control.py`
- Interactive setup wizard
- Non-interactive mode via flags/env
- Writes config and initializes directories

2. `scripts/ps4mc` (CLI wrapper)
- Day-2 operations commands (`sync-ftp`, `refresh-data`, `doctor`, etc.)

3. Updated docs
- `README.md` install quickstart
- `SETUP.md` first-run and credential mode explanation
- `TROUBLESHOOTING.md` operational fixes

---

## Installer UX Flow
1. Preflight checks
- Detect OS
- Verify required tools (`python3`, `curl`, `sqlite3`)
- Detect optional tools (`7z`, `unar`, `ffmpeg`)
- Print missing dependency instructions

2. Configuration prompts
- PS4 IP (default `192.168.0.26`)
- FTP port (default `2121`)
- FTP username
- FTP credential mode (see below)
- GoldHEN status port (default `9090`)
- RPI port (default `12800`)
- Watch folders (multiple paths)
- Data/output root paths

3. Directory bootstrap
- Create required data folders
- Initialize JSON list files if absent
- Ensure permissions are restrictive on config files

4. Connectivity checks (post-config)
- FTP reachability test
- GoldHEN `/status` probe
- RPI endpoint probe
- Summarize pass/fail and next actions

5. Optional actions during install
- Deploy storage payload to binloader
- Pull initial FTP snapshot
- Generate markdown lists and caches
- Launch mission-control server

---

## Credential Modes
Support three modes:

### A) `config` mode
- Save FTP password in local config file
- Restrict with file permissions (`0600`)
- Website refresh can run full auto sync

### B) `prompt` mode
- Do not store password
- Prompt in terminal every `sync-ftp` operation
- Website refresh cannot perform protected FTP operations
- UI must show clear notice: manual terminal sync required

### C) `keychain` mode (recommended on macOS)
- Store/retrieve password via macOS Keychain (`security` CLI)
- No plaintext password in config
- Website refresh can run full sync using keychain retrieval

Installer behavior:
- Recommend `keychain` first on macOS
- Offer `prompt` privacy-first option
- Validate selected mode during install

---

## Website + Credential Mode Behavior
If credential mode is `prompt`:
- Web refresh button should not attempt passworded FTP sync
- UI should show explicit message:
  - "FTP password is set to prompt-only. Run `ps4mc sync-ftp` in terminal, then click Refresh Data."

If credential mode is `keychain` or `config`:
- Web refresh may execute full refresh pipeline

---

## Commands to Implement (`ps4mc`)
1. `ps4mc install`
- Run installer wizard

2. `ps4mc doctor`
- Run full diagnostics (see Doctor section)

3. `ps4mc sync-ftp`
- Pull latest PS4 files via FTP (prompt/keychain/config aware)

4. `ps4mc refresh-data`
- Regenerate installed/external/uninstalled and related lists

5. `ps4mc refresh-storage`
- Deploy payload (optional) and refresh storage KPI source

6. `ps4mc start`
- Start local mission control server and print URL

7. `ps4mc extract-missing-icons`
- Attempt icon extraction from unresolved PKGs

8. `ps4mc status`
- Print compact state: PS4 online, RPI online, latest sync timestamp

---

## Doctor Spec (`ps4mc doctor`)
Doctor must print a sectioned report with pass/fail/warn results and fixes.

Checks:
1. Environment
- Python version
- Required binary presence
- Optional binary presence

2. Configuration
- Config file readable
- Required fields present
- Watch folder paths exist

3. Credentials
- `config` mode: password exists and file permission safe
- `keychain` mode: keychain item lookup works
- `prompt` mode: confirm prompt-only mode + note UI limitations

4. Network + PS4 Services
- FTP TCP connect
- FTP auth check
- GoldHEN status endpoint check (`9090`)
- RPI endpoint reachability (`12800`)

5. Data Pipeline
- Latest snapshot presence
- Required DB files present (`app.db`, `addcont.db`)
- List generation scripts executable
- Cache files readable

6. Web App Health
- Mission-control server starts
- `/api/state` responds
- Critical markdown data sources present

7. Payload Health
- Storage payload binary exists
- Payload deploy test (optional active test)
- Storage JSON freshness check

Doctor output requirements:
- Human readable summary table
- Machine-readable JSON output option (`--json`)
- Non-zero exit code on critical failures

---

## Config Schema (example)
```json
{
  "ps4_ip": "192.168.0.26",
  "ftp": {
    "host": "192.168.0.26",
    "port": 2121,
    "username": "anonymous",
    "credential_mode": "keychain",
    "password_ref": "ps4mc:ftp:192.168.0.26:2121"
  },
  "goldhen_port": 9090,
  "rpi_port": 12800,
  "watch_folders": [
    "/Volumes/PS4",
    "/Volumes/MagicLantern"
  ],
  "paths": {
    "ftp_sync_root": "./ftp-sync",
    "mission_control_root": "./mission-control"
  }
}
```

---

## Security Requirements
- Never print raw password in logs
- Redact credentials in debug output
- Enforce strict permissions on local secret-bearing files
- Do not store plaintext password in config when mode is `keychain` or `prompt`

---

## Error Handling Requirements
- Every failure must include:
  - what failed
  - likely cause
  - exact next command to fix
- Retry hints for transient network errors
- Graceful degradation when PS4 is offline

---

## Implementation Notes
- Keep installer idempotent (safe reruns)
- Support both interactive and non-interactive operation
- Prefer explicit subcommands over hidden side effects
- Keep output concise by default, verbose via `--verbose`

---

## Acceptance Criteria
1. Fresh machine can run installer and start dashboard with one guided flow
2. User can choose secure credential mode (`keychain`, `prompt`, or `config`)
3. Prompt-only mode clearly communicates manual refresh behavior
4. Doctor catches common misconfigurations and gives direct fixes
5. All core operational tasks can be run via `ps4mc` commands

---

## Recommended Defaults
- Credential mode: `keychain` on macOS
- PS4 IP: `192.168.0.26`
- FTP port: `2121`
- GoldHEN port: `9090`
- RPI port: `12800`
- Watch folders: `/Volumes/PS4`, `/Volumes/MagicLantern`

