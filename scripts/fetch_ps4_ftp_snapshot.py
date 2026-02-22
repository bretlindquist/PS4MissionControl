#!/usr/bin/env python3
"""Fetch a read-only PS4 metadata snapshot over FTP.

Default target: 192.168.0.26:2121 (anonymous login)
"""

from __future__ import annotations

import argparse
import ftplib
import json
import os
import socket
import shutil
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

DEFAULT_IP = "192.168.0.26"
DEFAULT_PORT = 2121
DEFAULT_ROOT = Path.home() / "git" / "PS4" / "ftp-sync"


def prompt_with_default(label: str, default: str, non_interactive: bool) -> str:
    if non_interactive or not os.isatty(0):
        return default
    value = input(f"{label} [{default}]: ").strip()
    return value or default


def safe_nlst(ftp: ftplib.FTP, path: str) -> List[str]:
    try:
        items = ftp.nlst(path)
    except Exception:
        return []
    out = []
    for item in items:
        if not item:
            continue
        if item in (".", ".."):
            continue
        out.append(item)
    return out


def normalize_full_path(base: str, item: str) -> str:
    if item.startswith("/"):
        return item
    if base.endswith("/"):
        return base + item
    return base + "/" + item


def remote_file_exists(ftp: ftplib.FTP, remote_path: str) -> bool:
    try:
        ftp.size(remote_path)
        return True
    except Exception:
        return False


def download_file(ftp: ftplib.FTP, remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with local_path.open("wb") as fh:
        ftp.retrbinary(f"RETR {remote_path}", fh.write)


def iter_user_ids(ftp: ftplib.FTP) -> Iterable[str]:
    for item in safe_nlst(ftp, "/user/home"):
        full = normalize_full_path("/user/home", item)
        uid = full.rstrip("/").split("/")[-1]
        if uid:
            yield uid


def fetch_snapshot(host: str, port: int, out_root: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = out_root / f"{stamp}_{host.replace('.', '-')}_{port}"
    out_dir.mkdir(parents=True, exist_ok=True)

    db_dir = out_dir / "db"
    manifests_dir = out_dir / "manifests"
    appmeta_icons_dir = out_dir / "appmeta" / "icons"
    appmeta_external_icons_dir = out_dir / "appmeta" / "external_icons"
    system_appmeta_icons_dir = out_dir / "system_appmeta" / "icons"
    system_appmeta_external_icons_dir = out_dir / "system_appmeta" / "external_icons"
    appmeta_shareparam_dir = out_dir / "appmeta" / "shareparam"
    patch_json_dir = out_dir / "patch" / "json"
    storage_dir = out_dir / "storage"
    merged_icons_dir = out_dir / "icons"

    ftp = ftplib.FTP()
    ftp.connect(host, port, timeout=10)
    ftp.login("anonymous", "anonymous@")

    copied = {
        "db": 0,
        "appmeta_icons": 0,
        "appmeta_external_icons": 0,
        "system_appmeta_icons": 0,
        "system_appmeta_external_icons": 0,
        "merged_icons": 0,
        "appmeta_shareparam": 0,
        "patch_json": 0,
        "storage_json": 0,
    }

    # Core DBs
    for remote in ["/system_data/priv/mms/app.db", "/system_data/priv/mms/addcont.db"]:
        if remote_file_exists(ftp, remote):
            target = db_dir / Path(remote).name
            download_file(ftp, remote, target)
            copied["db"] += 1
            print(f"[db] {remote} -> {target}")

    # Save-data manifests only (read-only catalog)
    manifest_lines: List[str] = []
    for uid in iter_user_ids(ftp):
        path = f"/user/home/{uid}/savedata"
        entries = sorted(safe_nlst(ftp, path))
        manifest_lines.append(f"[{path}] {len(entries)} entries")
        manifest_lines.extend(f"  {e}" for e in entries)

    for uid in iter_user_ids(ftp):
        path = f"/system_data/savedata/{uid}"
        entries = sorted(safe_nlst(ftp, path))
        if entries:
            manifest_lines.append(f"[{path}] {len(entries)} entries")
            manifest_lines.extend(f"  {e}" for e in entries)

    manifests_dir.mkdir(parents=True, exist_ok=True)
    (manifests_dir / "savedata_manifest.txt").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
    print(f"[manifest] wrote {manifests_dir / 'savedata_manifest.txt'}")

    # appmeta icons/shareparam
    for raw in safe_nlst(ftp, "/user/appmeta"):
        cusa = normalize_full_path("/user/appmeta", raw).rstrip("/").split("/")[-1]
        if not cusa.startswith("CUSA"):
            continue
        icon_remote = f"/user/appmeta/{cusa}/icon0.png"
        if remote_file_exists(ftp, icon_remote):
            target = appmeta_icons_dir / f"{cusa}.png"
            download_file(ftp, icon_remote, target)
            copied["appmeta_icons"] += 1
        sp_remote = f"/user/appmeta/{cusa}/shareparam.json"
        if remote_file_exists(ftp, sp_remote):
            target = appmeta_shareparam_dir / f"{cusa}.json"
            download_file(ftp, sp_remote, target)
            copied["appmeta_shareparam"] += 1

    # appmeta external icons
    for raw in safe_nlst(ftp, "/user/appmeta/external"):
        cusa = normalize_full_path("/user/appmeta/external", raw).rstrip("/").split("/")[-1]
        if not cusa.startswith("CUSA"):
            continue
        icon_remote = f"/user/appmeta/external/{cusa}/icon0.png"
        if remote_file_exists(ftp, icon_remote):
            target = appmeta_external_icons_dir / f"{cusa}.png"
            download_file(ftp, icon_remote, target)
            copied["appmeta_external_icons"] += 1

    # system appmeta icons
    for raw in safe_nlst(ftp, "/system_data/priv/appmeta"):
        cusa = normalize_full_path("/system_data/priv/appmeta", raw).rstrip("/").split("/")[-1]
        if not cusa.startswith("CUSA"):
            continue
        icon_remote = f"/system_data/priv/appmeta/{cusa}/icon0.png"
        if remote_file_exists(ftp, icon_remote):
            target = system_appmeta_icons_dir / f"{cusa}.png"
            download_file(ftp, icon_remote, target)
            copied["system_appmeta_icons"] += 1

    # system appmeta external icons
    for raw in safe_nlst(ftp, "/system_data/priv/appmeta/external"):
        cusa = normalize_full_path("/system_data/priv/appmeta/external", raw).rstrip("/").split("/")[-1]
        if not cusa.startswith("CUSA"):
            continue
        icon_remote = f"/system_data/priv/appmeta/external/{cusa}/icon0.png"
        if remote_file_exists(ftp, icon_remote):
            target = system_appmeta_external_icons_dir / f"{cusa}.png"
            download_file(ftp, icon_remote, target)
            copied["system_appmeta_external_icons"] += 1

    # patch metadata
    for raw in safe_nlst(ftp, "/user/patch"):
        cusa = normalize_full_path("/user/patch", raw).rstrip("/").split("/")[-1]
        if not cusa.startswith("CUSA"):
            continue
        patch_remote = f"/user/patch/{cusa}/patch.json"
        if remote_file_exists(ftp, patch_remote):
            target = patch_json_dir / f"{cusa}.json"
            download_file(ftp, patch_remote, target)
            copied["patch_json"] += 1

    # optional storage metrics from one-shot payload
    # expected writer: payload stores JSON at /data/ps4-storage.json
    storage_remote = "/data/ps4-storage.json"
    if remote_file_exists(ftp, storage_remote):
        target = storage_dir / "ps4-storage.json"
        download_file(ftp, storage_remote, target)
        copied["storage_json"] += 1

    ftp.quit()

    # Build merged icon set with deterministic precedence:
    # 1) /user/appmeta
    # 2) /user/appmeta/external
    # 3) /system_data/priv/appmeta
    # 4) /system_data/priv/appmeta/external
    merged_icons_dir.mkdir(parents=True, exist_ok=True)
    icon_sources = [
        ("user_appmeta", appmeta_icons_dir),
        ("user_appmeta_external", appmeta_external_icons_dir),
        ("system_appmeta", system_appmeta_icons_dir),
        ("system_appmeta_external", system_appmeta_external_icons_dir),
    ]
    merged_source_map = {}
    for source_name, source_dir in icon_sources:
        if not source_dir.exists():
            continue
        for icon in sorted(source_dir.glob("CUSA*.png")):
            target = merged_icons_dir / icon.name
            if target.exists():
                continue
            shutil.copy2(icon, target)
            merged_source_map[icon.stem.upper()] = source_name
            copied["merged_icons"] += 1

    summary = {
        "host": host,
        "port": port,
        "captured_at": datetime.now().isoformat(),
        "output_dir": str(out_dir),
        "counts": copied,
        "icon_precedence": [x[0] for x in icon_sources],
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (out_dir / "icons" / "source_map.json").write_text(json.dumps(merged_source_map, indent=2), encoding="utf-8")

    # refresh a stable pointer for downstream tools
    latest = out_root / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    (latest / "last_snapshot_path.txt").write_text(str(out_dir) + "\n", encoding="utf-8")

    print("\nSnapshot complete")
    print(json.dumps(summary, indent=2))
    return out_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch PS4 metadata snapshot via read-only FTP")
    parser.add_argument("--ip", default=None, help=f"PS4 FTP IP (default: {DEFAULT_IP})")
    parser.add_argument("--port", type=int, default=None, help=f"PS4 FTP port (default: {DEFAULT_PORT})")
    parser.add_argument("--out-root", default=str(DEFAULT_ROOT), help=f"Base output folder (default: {DEFAULT_ROOT})")
    parser.add_argument("--non-interactive", action="store_true", help="Do not prompt; use defaults/flags")
    args = parser.parse_args()

    ip = args.ip or prompt_with_default("PS4 FTP IP", DEFAULT_IP, args.non_interactive)
    port_str = str(args.port) if args.port is not None else prompt_with_default("PS4 FTP Port", str(DEFAULT_PORT), args.non_interactive)
    try:
        port = int(port_str)
    except ValueError:
        print(f"Invalid port: {port_str}")
        return 2

    out_root = Path(args.out_root).expanduser()

    try:
        fetch_snapshot(ip, port, out_root)
        return 0
    except (socket.timeout, ConnectionRefusedError, OSError, EOFError, ftplib.Error) as exc:
        print(f"FTP error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
