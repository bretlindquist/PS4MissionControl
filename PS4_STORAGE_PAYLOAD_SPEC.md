# PS4 Storage Payload Spec

## Goal
Expose PS4 internal/external free space with minimal runtime footprint.

## Runtime model
- One-shot payload (no persistent HTTP service)
- Payload runs under GoldHEN, writes one JSON file, exits
- Mission Control reads this file via existing FTP snapshot flow

## Output path
- PS4 path: `/data/ps4-storage.json`
- Snapshot local path: `~/git/PS4/ftp-sync/<stamp>/storage/ps4-storage.json`

## Mounts to probe
- Internal: `/user`
- External: `/mnt/ext0` (if mounted)

## Required output JSON
```json
{
  "status": "ready",
  "generated_at": "2026-02-22T00:00:00Z",
  "storage": {
    "internal": {
      "mount": "/user",
      "total_bytes": 1000000000000,
      "free_bytes": 250000000000,
      "used_bytes": 750000000000
    },
    "external": {
      "mount": "/mnt/ext0",
      "total_bytes": 2000000000000,
      "free_bytes": 1200000000000,
      "used_bytes": 800000000000
    }
  }
}
```

## Rules
- `used_bytes = total_bytes - free_bytes`
- If external is not mounted, either:
  - omit `storage.external`, or
  - set it to `null`
- Keep field names exactly as above for Mission Control compatibility

## Mission Control integration status
Implemented:
- Snapshot script fetches `/data/ps4-storage.json` when available
- Server returns parsed storage data in `/api/state` as `ps4Storage`
- UI KPIs show `Internal Free` and `External Free` with `--` fallback

## Refresh flow
1. Run payload on PS4 (GoldHEN)
2. Click `Refresh Data` in Mission Control
3. Snapshot imports latest storage JSON
4. KPIs update

## Failure behavior
- Missing payload output file: UI shows `--`
- Invalid JSON: UI shows `--`
- No external drive mounted: only internal value shows
