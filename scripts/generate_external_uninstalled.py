#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import json
import re
import sqlite3
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path.home() / "git" / "PS4"
OUT = ROOT / "EXTERNAL_UNINSTALLED_GAMES.md"
APP_DB = ROOT / "app.db"
LATEST_SNAPSHOT_PTR = ROOT / "ftp-sync" / "latest" / "last_snapshot_path.txt"
TITLE_CACHE = ROOT / "ps4-title-cache.json"
VOLUMES = [Path("/Volumes/PS4"), Path("/Volumes/MagicLantern")]
IGNORE_DIRS = {".Trashes", ".TemporaryItems", ".Spotlight-V100", ".fseventsd", ".DocumentRevisions-V100"}

TMDB_HMAC_KEY = bytes.fromhex(
    "F5DE66D2680E255B2DF79E74F890EBF349262F618BCAE2A9ACCDEE5156CE8DF2CDF2D48C71173CDC2594465B87405D197CF1AED3B7E9671EEB56CA6753C2E6B0"
)

CUSA_RE = re.compile(r"CUSA\d{5}", re.I)
ACODE_RE = re.compile(r"-A(\d{4})-V\d{4}", re.I)


@dataclass
class PkgRow:
    drive: str
    title_id: str
    pkg_type: str
    file_name: str
    path: str


def latest_app_db() -> Path:
    try:
        if LATEST_SNAPSHOT_PTR.exists():
            snap = Path(LATEST_SNAPSHOT_PTR.read_text(encoding="utf-8").strip())
            cand = snap / "db" / "app.db"
            if cand.exists():
                return cand
    except Exception:
        pass
    return APP_DB


def read_title_cache() -> dict[str, str]:
    if not TITLE_CACHE.exists():
        return {}
    try:
        raw = json.loads(TITLE_CACHE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def write_title_cache(cache: dict[str, str]) -> None:
    TITLE_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def tmdb_url_for_title_id(title_id: str) -> str:
    key = f"{title_id}_00"
    digest = hmac.new(TMDB_HMAC_KEY, key.encode("utf-8"), hashlib.sha1).hexdigest().upper()
    return f"https://tmdb.np.dl.playstation.net/tmdb2/{key}_{digest}/{key}.json"


def fetch_tmdb_name(title_id: str) -> str:
    url = tmdb_url_for_title_id(title_id)
    req = urllib.request.Request(url, headers={"User-Agent": "PS4-MissionControl/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        names = data.get("names")
        if isinstance(names, list) and names and isinstance(names[0], dict):
            return str(names[0].get("name") or "").strip()
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return ""
    return ""


def clean_title_from_filename(name: str, title_id: str) -> str:
    s = name
    s = re.sub(r"\.pkg$", "", s, flags=re.I)
    if title_id:
        s = re.sub(re.escape(title_id), " ", s, flags=re.I)
    s = re.sub(r"\[[^\]]+\]", " ", s)
    s = re.sub(r"\([^)]+\)", " ", s)
    s = re.sub(r"\b(PS4|EUR|USA|ASIA|FW\d+|OPOISSO\d*|DUPLEX|CyB1K|UPDATE|BASE|FIXED|BACKPORT)\b", " ", s, flags=re.I)
    s = re.sub(r"[-_.]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or name


def is_dlc_name(name: str) -> bool:
    l = name.lower()
    return any(x in l for x in ["dlc", "addon", "add-on", "season pass", "story expansion"]) or " pack" in l


def is_theme_name(name: str) -> bool:
    l = name.lower()
    return "theme" in l or "dynamic_" in l or "dynamic " in l


def is_non_game_name(name: str) -> bool:
    l = name.lower()
    if is_dlc_name(name):
        return True
    for x in ["unlocker", "avatar", "demo", "optionalfix"]:
        if x in l:
            return True
    # obvious update/addon tags
    if "patch" in l or "add-on" in l:
        return True
    # A0100 base, A01xx update, A0000 add-on
    m = ACODE_RE.search(name)
    if m:
        a = int(m.group(1))
        if a == 0:
            return True
    return False


def classify_pkg(name: str) -> str:
    m = ACODE_RE.search(name)
    if m:
        a = int(m.group(1))
        if a == 100:
            return "base"
        if 100 < a < 1000:
            return "update"
        if a == 0:
            return "addon"
    l = name.lower()
    if "[base]" in l or " base " in l:
        return "base"
    if "[upd]" in l or " update " in l or " patch " in l or "fix" in l or "backport" in l:
        return "update"
    return "unknown"


def scan_pkg_rows() -> list[PkgRow]:
    rows: list[PkgRow] = []
    for vol in VOLUMES:
        if not vol.exists():
            continue
        for p in vol.rglob("*.pkg"):
            if not p.is_file():
                continue
            if p.name.startswith("._"):
                continue
            if any(part in IGNORE_DIRS for part in p.parts):
                continue
            name = p.name
            if is_theme_name(name) or is_non_game_name(name):
                continue
            m = CUSA_RE.search(name)
            title_id = m.group(0).upper() if m else ""
            rows.append(PkgRow(vol.name, title_id, classify_pkg(name), name, str(p)))
    return rows


def load_installed() -> tuple[set[str], dict[str, str]]:
    db = latest_app_db()
    conn = sqlite3.connect(db)
    try:
        installed = {
            r[0]
            for r in conn.execute(
                """
                SELECT DISTINCT titleId
                FROM tbl_appbrowse_0507646227
                WHERE titleId LIKE 'CUSA%'
                  AND category LIKE 'gd%'
                  AND IFNULL(titleName,'')<>''
                  AND IFNULL(contentSize,0) > 0
                """
            )
        }
        names = {
            r[0]: r[1]
            for r in conn.execute(
                """
                SELECT titleId, titleName
                FROM tbl_appbrowse_0507646227
                WHERE titleId LIKE 'CUSA%'
                  AND IFNULL(titleName,'')<>''
                """
            )
        }
        return installed, names
    finally:
        conn.close()


def main() -> int:
    installed, db_names = load_installed()
    rows = scan_pkg_rows()
    cache = read_title_cache()

    by_id: dict[str, list[PkgRow]] = {}
    no_id: list[PkgRow] = []
    for r in rows:
        if r.title_id:
            by_id.setdefault(r.title_id, []).append(r)
        else:
            no_id.append(r)

    # Resolve names for CUSA rows
    for tid in sorted(by_id):
        if tid in db_names:
            cache[tid] = db_names[tid]
            continue
        if cache.get(tid):
            continue
        tmdb_name = fetch_tmdb_name(tid)
        if tmdb_name:
            cache[tid] = tmdb_name
    write_title_cache(cache)

    lines: list[str] = []
    lines.append("# External Games Not Installed on PS4")
    lines.append("")
    lines.append(f"- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S %Z')}")
    lines.append(f"- Installed DB source: `{latest_app_db()}`")
    lines.append("- Drives scanned: `/Volumes/PS4`, `/Volumes/MagicLantern`")
    lines.append(f"- Distinct CUSA candidates: **{len(by_id)}**")
    lines.append(f"- No-CUSA manual-review files: **{len(no_id)}**")
    lines.append("")
    lines.append("## Uninstalled Game Titles")
    lines.append("")
    lines.append("| Title | Installed | Drive(s) | Package Types Found | Files Found | Title ID | Example Path |")
    lines.append("|---|---|---|---|---:|---|---|")

    # Keep broad coverage; include all CUSA candidates with explicit installed flag
    for tid in sorted(by_id):
        items = by_id[tid]
        drives = ", ".join(sorted({x.drive for x in items}))
        kinds = "+".join(k for k in ["base", "update", "unknown"] if any(i.pkg_type == k for i in items))
        status = "Installed" if tid in installed else "Not Installed"
        sample = sorted(items, key=lambda x: x.file_name.lower())[0]
        title = cache.get(tid) or db_names.get(tid) or clean_title_from_filename(sample.file_name, tid)
        lines.append(f"| {title} | {status} | {drives} | {kinds or 'unknown'} | {len(items)} | {tid} | `{sample.path}` |")

    lines.append("")
    lines.append("## Manual Review (No CUSA in Filename)")
    lines.append("")
    lines.append("| Drive | Type Guess | Guessed Title | File | Path |")
    lines.append("|---|---|---|---|---|")
    for r in sorted(no_id, key=lambda x: (x.drive.lower(), x.file_name.lower())):
        guess = clean_title_from_filename(r.file_name, "")
        lines.append(f"| {r.drive} | {r.pkg_type} | {guess} | {r.file_name} | `{r.path}` |")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(str(OUT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
