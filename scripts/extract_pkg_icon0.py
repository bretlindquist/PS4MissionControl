#!/usr/bin/env python3
"""
Extract a likely icon0.png from PS4 PKG files without unpacking full contents.

Approach:
- Stream-scan PKG bytes for embedded PNG signatures.
- Parse PNG IHDR to score likely "icon" candidates.
- Write best candidate as <CUSA>.png into icons output directory.

This is heuristic by design, but works well for many fPKG dumps where icon PNG is
stored in plain bytes.
"""

from __future__ import annotations

import argparse
import re
import struct
from dataclasses import dataclass
from pathlib import Path

PNG_SIG = b"\x89PNG\r\n\x1a\n"
IEND = b"\x00\x00\x00\x00IEND\xaeB`\x82"
CHUNK_SIZE = 8 * 1024 * 1024
DEFAULT_MAX_SCAN_MB = 512

DEFAULT_ROOTS = [Path("/Volumes/PS4"), Path("/Volumes/MagicLantern")]
DEFAULT_OUT = Path.home() / "git" / "PS4" / "ftp-sync" / "latest" / "icons"


@dataclass
class PngCandidate:
    start: int
    end: int
    width: int
    height: int
    size: int
    score: float


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract icon PNG from PKG without full unpack")
    p.add_argument("--pkg", action="append", default=[], help="PKG path (repeatable)")
    p.add_argument("--cusa", action="append", default=[], help="CUSA id (repeatable), e.g. CUSA27372")
    p.add_argument("--search-root", action="append", default=[], help="Search roots for --cusa mode")
    p.add_argument("--out-dir", default=str(DEFAULT_OUT), help="Output icon dir")
    p.add_argument(
        "--max-scan-mb",
        type=int,
        default=DEFAULT_MAX_SCAN_MB,
        help=f"Max MB to scan per PKG (default: {DEFAULT_MAX_SCAN_MB})",
    )
    p.add_argument("--dry-run", action="store_true", help="Only print what would be done")
    return p.parse_args()


def normalize_cusa(s: str) -> str:
    s = (s or "").strip().upper()
    if re.fullmatch(r"CUSA\d{5}", s):
        return s
    return ""


def cusa_from_text(s: str) -> str:
    m = re.search(r"(CUSA\d{5})", (s or "").upper())
    return m.group(1) if m else ""


def ihdr_dims(blob: bytes) -> tuple[int, int]:
    if len(blob) < 33 or not blob.startswith(PNG_SIG):
        return (0, 0)
    # PNG: sig(8) + len(4) + type(4='IHDR') + data(13)
    length = struct.unpack(">I", blob[8:12])[0]
    ctype = blob[12:16]
    if ctype != b"IHDR" or length != 13:
        return (0, 0)
    w = struct.unpack(">I", blob[16:20])[0]
    h = struct.unpack(">I", blob[20:24])[0]
    return (w, h)


def score_candidate(width: int, height: int, size: int) -> float:
    if width <= 0 or height <= 0 or size <= 0:
        return -1.0
    ratio = width / height if height else 0.0
    sq_penalty = abs(1.0 - ratio)
    # Prefer square-ish and medium PNG sizes typical for icons.
    score = 100.0
    score -= sq_penalty * 55.0
    if width < 128 or height < 128:
        score -= 25
    if width > 2048 or height > 2048:
        score -= 25
    if size < 8_000:
        score -= 30
    if size > 2_000_000:
        score -= 15
    # Gentle preference for 512-ish assets.
    score -= abs(width - 512) / 40.0
    score -= abs(height - 512) / 40.0
    return score


def find_png_candidates(pkg_path: Path, max_scan_bytes: int) -> list[PngCandidate]:
    cands: list[PngCandidate] = []
    pos = 0
    buf = b""
    with pkg_path.open("rb") as fh:
        scanned = 0
        while True:
            chunk = fh.read(CHUNK_SIZE)
            if not chunk:
                break
            scanned += len(chunk)
            buf += chunk
            search_from = 0
            while True:
                s = buf.find(PNG_SIG, search_from)
                if s < 0:
                    break
                e = buf.find(IEND, s + len(PNG_SIG))
                if e < 0:
                    # keep tail so potential png completion can happen on next chunk
                    break
                e += len(IEND)
                blob = buf[s:e]
                w, h = ihdr_dims(blob)
                size = e - s
                score = score_candidate(w, h, size)
                if score > 0:
                    cands.append(PngCandidate(start=pos + s, end=pos + e, width=w, height=h, size=size, score=score))
                search_from = e
            # keep up to last 8MB+PNG marker room for boundary crossing
            keep = max(len(PNG_SIG), len(IEND), 2 * 1024 * 1024)
            if len(buf) > keep:
                drop = len(buf) - keep
                buf = buf[drop:]
                pos += drop
            if max_scan_bytes > 0 and scanned >= max_scan_bytes:
                break
    cands.sort(key=lambda c: c.score, reverse=True)
    return cands


def extract_blob(pkg_path: Path, start: int, end: int) -> bytes:
    with pkg_path.open("rb") as fh:
        fh.seek(start)
        return fh.read(end - start)


def find_pkg_for_cusa(cusa: str, roots: list[Path]) -> Path | None:
    candidates: list[tuple[int, Path]] = []
    cusa_u = cusa.upper()
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*.pkg"):
            name = p.name.upper()
            if cusa_u not in name:
                continue
            # Prefer non-dlc/update base packages.
            penalty = 0
            if re.search(r"(DLC|ADDON|THEME|PATCH|UPDATE|BACKPORT)", name):
                penalty += 200
            if re.search(r"-A01(0[1-9]|[1-9]\d)-", name):
                penalty += 80
            size = p.stat().st_size if p.exists() else 0
            # Bigger files are often base games; use negative for sort asc.
            score = penalty - int(size / (1024 * 1024))
            candidates.append((score, p))
    if not candidates:
        return None
    candidates.sort(key=lambda t: t[0])
    return candidates[0][1]


def process_one(pkg_path: Path, out_dir: Path, max_scan_bytes: int, cusa_hint: str = "", dry_run: bool = False) -> bool:
    if not pkg_path.exists():
        print(f"[MISS] pkg not found: {pkg_path}")
        return False
    cusa = normalize_cusa(cusa_hint) or cusa_from_text(pkg_path.name)
    if not cusa:
        print(f"[SKIP] no CUSA in name and no hint: {pkg_path}")
        return False
    print(f"[SCAN] {pkg_path.name} (max {max_scan_bytes // (1024*1024)} MB)", flush=True)
    cands = find_png_candidates(pkg_path, max_scan_bytes=max_scan_bytes)
    if not cands:
        print(f"[MISS] no PNG candidates in {pkg_path.name}")
        return False
    best = cands[0]
    out_path = out_dir / f"{cusa}.png"
    print(
        f"[HIT] {cusa} <- {pkg_path.name} | "
        f"{best.width}x{best.height} {best.size/1024:.1f}KB score={best.score:.1f}"
    , flush=True)
    if dry_run:
        return True
    out_dir.mkdir(parents=True, exist_ok=True)
    blob = extract_blob(pkg_path, best.start, best.end)
    out_path.write_bytes(blob)
    return True


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir).expanduser()

    roots = [Path(p).expanduser() for p in (args.search_root or [])] or DEFAULT_ROOTS

    jobs: list[tuple[Path, str]] = []
    for raw in args.pkg:
        p = Path(raw).expanduser()
        jobs.append((p, ""))
    for raw in args.cusa:
        cusa = normalize_cusa(raw)
        if not cusa:
            print(f"[SKIP] invalid CUSA: {raw}")
            continue
        pkg = find_pkg_for_cusa(cusa, roots)
        if not pkg:
            print(f"[MISS] no pkg found for {cusa}")
            continue
        jobs.append((pkg, cusa))

    if not jobs:
        print("No jobs. Use --pkg and/or --cusa.")
        return 1

    ok = 0
    for pkg, cusa_hint in jobs:
        if process_one(
            pkg,
            out_dir,
            max_scan_bytes=max(0, int(args.max_scan_mb)) * 1024 * 1024,
            cusa_hint=cusa_hint,
            dry_run=args.dry_run,
        ):
            ok += 1
    print(f"Done: {ok}/{len(jobs)} icon(s) extracted")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
