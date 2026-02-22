# PS4 Data Hardening Notes

## Purpose
Canonical reference for how this workspace should parse PS4 data and avoid regressions.

## Verified Data Sources
- Primary DBs:
  - `/system_data/priv/mms/app.db`
  - `/system_data/priv/mms/addcont.db`
- FTP snapshot script (read-only):
  - `~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py`
- Snapshot output root:
  - `~/git/PS4/ftp-sync/`

## app.db Table Usage
- Installed app records (current):
  - `tbl_appbrowse_0507646227`
- Folder/category mapping (custom folders):
  - `tbl_appbrowse_0507646226`
- Key/value metadata:
  - `tbl_appinfo`

## Folder Mapping (Important)
- User-created folders are `folderType = 1` rows in `tbl_appbrowse_0507646226`.
- Game rows in `tbl_appbrowse_0507646226` use `parentFolderId` and `positionInFolder`.
- To render category membership correctly, join:
  - game/app data from `6227`
  - folder membership from `6226` on `titleId`
- Verified examples:
  - `Ass` folder exists and maps Assassin’s Creed entries.
  - `WAR` folder exists and maps war titles.
  - `VR` folder id: `00000000d`.

## Installed-Game Inclusion Rule (Hardened)
Use this to avoid ghost/system stubs while keeping real installed apps:
- `titleId LIKE 'CUSA%'`
- `category LIKE 'gd%'`
- `titleName != ''`
- `contentSize > 0`

Reason:
- `category='gd'` alone excluded valid entry `EVEREST VR` (`gdc`).
- `category LIKE 'gd%'` alone included system stubs (`gdi`) like 3x Destiny.
- `contentSize > 0` cleanly removes those stubs.

## Ghost/Stubs Pattern
Examples found (should be excluded from installed views):
- `CUSA00219`, `CUSA00568`, `CUSA01000` (Destiny variants)
- `CUSA02012` Media Player
- `CUSA01697` PlayStation Now
- `CUSA00572` SHAREfactory
- `CUSA01780` Spotify

Common traits:
- category `gdi`
- `contentSize = 0`
- often `metaDataPath` under `/system_ex/app/...`

## Version Semantics
- `APP_VER`: app/game update version track.
- `VERSION`: package/disc revision track.
- Effective version used in workspace:
  - `Current Ver = max(APP_VER, VERSION)`

Why:
- Some titles have higher `VERSION` than `APP_VER` (e.g., Battlezone cases).
- Others follow normal `APP_VER` progression (e.g., Farpoint).

## Size Field
- Best installed size source: `contentSize` from `tbl_appbrowse_0507646227`.
- Verified: `tbl_appinfo['#_size']` matched `contentSize` in this dataset.
- UI fields derived:
  - `Installed Size (GB)`
  - `Size Tier` (`Tiny/Small/Medium/Large/Huge`)

## VR Classification Notes
- Truth source for user intent can be folder membership (`VR` folder).
- Heuristic VR detection exists (title/CUSA hints), but folder membership may differ intentionally.
- Known edge case:
  - `PlayStation VR WORLDS (CUSA05202)` seen installed with no folder assignment in one snapshot.

## Mission Control / PS4 View Behavior
- Mission Control and PS4 simulation should use the hardened inclusion rule above.
- PS4 simulation should always join `6227` + `6226` for folder/category fidelity.

## FTP Snapshot Script
Script:
- `~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py`

Defaults:
- IP: `192.168.0.26`
- Port: `2121`
- Login: anonymous (read-only)

Run:
```bash
~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py
```

Non-interactive:
```bash
~/git/PS4/scripts/fetch_ps4_ftp_snapshot.py --non-interactive --ip 192.168.0.26 --port 2121
```

Output structure per run:
- `db/app.db`
- `db/addcont.db`
- `manifests/savedata_manifest.txt`
- `appmeta/icons/*.png`
- `appmeta/shareparam/*.json`
- `patch/json/*.json`
- `summary.json`

Latest pointer:
- `~/git/PS4/ftp-sync/latest/last_snapshot_path.txt`

## Rebuild Commands
After snapshot refresh:
```bash
~/git/PS4/generate_installed_lists.sh
~/git/PS4/generate_external_lists.sh
~/git/PS4/generate_updates_pending.sh
```

Then reload UI:
```bash
open "http://localhost:8787/mission-control/?v=$(date +%s)"
open "http://localhost:8787/mission-control/ps4-view/?v=$(date +%s)"
```
