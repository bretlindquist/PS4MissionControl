#!/usr/bin/env python3
import json
import os
import sqlite3
import subprocess
import urllib.error
import urllib.request
import hmac
import hashlib
import socket
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import uuid
import time

ROOT = Path.home() / "git" / "PS4"
APP_DB = ROOT / "app.db"
THUMB_CACHE = ROOT / "ps4-thumb-cache.json"
LATEST_SNAPSHOT_PTR = ROOT / "ftp-sync" / "latest" / "last_snapshot_path.txt"
TMDB_HMAC_KEY = bytes.fromhex(
    "F5DE66D2680E255B2DF79E74F890EBF349262F618BCAE2A9ACCDEE5156CE8DF2CDF2D48C71173CDC2594465B87405D197CF1AED3B7E9671EEB56CA6753C2E6B0"
)
DATA = {
    "watch": ROOT / "watch-list.json",
    "ignore": ROOT / "ignore-list.json",
    "hide": ROOT / "hide-list.json",
}
FTP_SNAPSHOT_SCRIPT = ROOT / "scripts" / "fetch_ps4_ftp_snapshot.py"
DEFAULT_PS4_IP = os.environ.get("PS4_IP", "192.168.0.26")
DEFAULT_FTP_PORT = int(os.environ.get("PS4_FTP_PORT", "2121"))
DEFAULT_BINLOADER_PORT = int(os.environ.get("PS4_BINLOADER_PORT", "9090"))
STORAGE_PAYLOAD_BIN = ROOT / "payloads" / "storage-snapshot" / "payload.bin"
DEFAULT_RPI_PORT = int(os.environ.get("PS4_RPI_PORT", "12800"))
PKG_TOKENS: dict[str, dict] = {}
PKG_TOKEN_TTL_SEC = 6 * 60 * 60
SEND_JOBS: dict[str, dict] = {}
SEND_JOBS_LOCK = threading.Lock()
SEND_JOB_TTL_SEC = 24 * 60 * 60
EXTRACT_ICON_SCRIPT = ROOT / "scripts" / "extract_pkg_icon0.py"
ICONS_DIR = ROOT / "ftp-sync" / "latest" / "icons"


def _read_json(path: Path):
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write_json(path: Path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _ver_to_int(v: str) -> int:
    if not isinstance(v, str):
        return 0
    parts = v.split(".")
    if len(parts) != 2:
        return 0
    if not (parts[0].isdigit() and parts[1].isdigit()):
        return 0
    return int(parts[0]) * 100 + int(parts[1])


def _current_ver(app_ver: str, pkg_ver: str) -> str:
    return app_ver if _ver_to_int(app_ver) >= _ver_to_int(pkg_ver) else pkg_ver


def _load_thumb_cache():
    if not THUMB_CACHE.exists():
        return {}
    try:
        data = json.loads(THUMB_CACHE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_thumb_cache(cache: dict):
    THUMB_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def _ensure_thumb_cache_for_ids(ids: list[str]) -> dict:
    norm = []
    for tid in ids:
        t = str(tid or "").strip().upper()
        if re.fullmatch(r"CUSA\d{5}", t):
            norm.append(t)
    if not norm:
        return _load_thumb_cache()

    cache = _load_thumb_cache()
    missing = [tid for tid in norm if tid not in cache]
    if missing:
        with ThreadPoolExecutor(max_workers=10) as pool:
            for item in pool.map(_fetch_tmdb_icon, missing):
                cache[item["titleId"]] = item
        _save_thumb_cache(cache)
    return cache


def _latest_snapshot_dir() -> Path | None:
    try:
        if not LATEST_SNAPSHOT_PTR.exists():
            return None
        p = Path(LATEST_SNAPSHOT_PTR.read_text(encoding="utf-8").strip())
        if p.exists():
            return p
    except Exception:
        return None
    return None


def _effective_app_db() -> Path:
    snap = _latest_snapshot_dir()
    if snap:
        snap_db = snap / "db" / "app.db"
        if snap_db.exists():
            return snap_db
    return APP_DB


def _local_icon_map() -> dict[str, str]:
    snap = _latest_snapshot_dir()
    if not snap:
        return {}
    icons_dir = snap / "icons"
    if not icons_dir.exists():
        return {}

    out: dict[str, str] = {}
    for p in icons_dir.glob("CUSA*.png"):
        try:
            rel = p.relative_to(ROOT).as_posix()
            out[p.stem.upper()] = f"/{rel}"
        except Exception:
            continue
    return out


def _tmdb_title_key(title_id: str) -> str:
    return f"{title_id}_00"


def _tmdb_json_url(title_id: str) -> str:
    title_key = _tmdb_title_key(title_id)
    digest = hmac.new(TMDB_HMAC_KEY, title_key.encode("utf-8"), hashlib.sha1).hexdigest().upper()
    return f"https://tmdb.np.dl.playstation.net/tmdb2/{title_key}_{digest}/{title_key}.json"


def _fetch_tmdb_icon(title_id: str):
    url = _tmdb_json_url(title_id)
    req = urllib.request.Request(url, headers={"User-Agent": "PS4-MissionControl/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return {"titleId": title_id, "ok": False, "icon": "", "tmdb": url}

    icon = ""
    icons = data.get("icons")
    if isinstance(icons, list):
        for item in icons:
            if isinstance(item, dict) and item.get("icon"):
                icon = str(item["icon"])
                break
    if icon.startswith("http://"):
        icon = "https://" + icon[len("http://") :]

    return {
        "titleId": title_id,
        "ok": True,
        "icon": icon,
        "name": (data.get("names") or [{}])[0].get("name", ""),
        "contentId": data.get("contentId", ""),
        "psVr": bool(data.get("psVr", False)),
        "tmdb": url,
    }


def _build_ps4_layout():
    conn = sqlite3.connect(str(_effective_app_db()))
    conn.row_factory = sqlite3.Row
    games = conn.execute(
        """
        SELECT b.titleId,
               b.titleName,
               IFNULL(b.contentId,'') AS contentId,
               IFNULL(b.uiCategory,'') AS uiCategory,
               IFNULL(b.lastAccessTime,'') AS lastAccessTime,
               IFNULL(b.contentSize,0) AS contentSize,
               IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='APP_VER' LIMIT 1),'00.00') AS appVer,
               IFNULL((SELECT val FROM tbl_appinfo ai WHERE ai.titleId=b.titleId AND ai.key='VERSION' LIMIT 1),'00.00') AS pkgVer,
               IFNULL(c.parentFolderId,'') AS parentFolderId,
               c.positionInFolder
        FROM tbl_appbrowse_0507646227 b
        LEFT JOIN tbl_appbrowse_0507646226 c ON c.titleId=b.titleId
        WHERE b.titleId LIKE 'CUSA%'
          AND b.category LIKE 'gd%'
          AND IFNULL(b.titleName,'')<>''
          AND IFNULL(b.contentSize,0) > 0
        """
    ).fetchall()

    folder_rows = conn.execute(
        """
        SELECT titleId, titleName, IFNULL(positionInFolder,0) AS positionInFolder
        FROM tbl_appbrowse_0507646226
        WHERE folderType=1 AND IFNULL(titleName,'')<>''
        ORDER BY lower(titleName)
        """
    ).fetchall()
    conn.close()

    local_icons = _local_icon_map()
    cache = _load_thumb_cache()
    missing = []
    for g in games:
        tid = g["titleId"]
        if tid in local_icons:
            continue
        if tid not in cache:
            missing.append(tid)

    if missing:
        with ThreadPoolExecutor(max_workers=12) as pool:
            for item in pool.map(_fetch_tmdb_icon, missing):
                cache[item["titleId"]] = item
        _save_thumb_cache(cache)

    folder_map = {
        f["titleId"]: {
            "id": f["titleId"],
            "name": f["titleName"],
            "position": int(f["positionInFolder"] or 0),
            "games": [],
        }
        for f in folder_rows
    }
    root_games = []

    for g in games:
        tid = g["titleId"]
        thumb = cache.get(tid, {})
        local_thumb = local_icons.get(tid)
        thumb_url = local_thumb or thumb.get("icon", "")
        thumb_source = "local" if local_thumb else ("tmdb" if thumb.get("icon") else "none")
        item = {
            "titleId": tid,
            "title": g["titleName"],
            "contentId": g["contentId"],
            "uiCategory": g["uiCategory"],
            "lastPlayed": g["lastAccessTime"],
            "sizeGb": round((int(g["contentSize"] or 0) / 1073741824), 2),
            "currentVer": _current_ver(g["appVer"], g["pkgVer"]),
            "folderId": g["parentFolderId"] or "",
            "position": int(g["positionInFolder"] or 0),
            "thumbUrl": thumb_url,
            "thumbSource": thumb_source,
            "tmdbUrl": thumb.get("tmdb", ""),
            "isVr": bool(thumb.get("psVr", False)),
        }
        if item["folderId"] and item["folderId"] in folder_map:
            folder_map[item["folderId"]]["games"].append(item)
        else:
            root_games.append(item)

    for folder in folder_map.values():
        folder["games"].sort(key=lambda r: (r["position"], r["title"].lower()))
    root_games.sort(key=lambda r: (r["position"], r["title"].lower()))

    folders = sorted(folder_map.values(), key=lambda f: (f["position"], f["name"].lower()))
    return {
        "generatedAt": datetime.now().isoformat(),
        "counts": {
            "folders": len(folders),
            "games": len(games),
            "rootGames": len(root_games),
        },
        "folders": folders,
        "rootGames": root_games,
    }


def _probe_ps4_status(ip: str, status_port: int = DEFAULT_BINLOADER_PORT) -> dict:
    status_url = f"http://{ip}:{int(status_port)}/status"
    out = {
        "ip": ip,
        "online": False,
        "source": "goldhen_status",
        "statusUrl": status_url,
        "status": "offline",
        "checkedAt": datetime.now().isoformat(),
    }
    try:
        req = urllib.request.Request(status_url, headers={"User-Agent": "PS4-MissionControl/1.0"})
        with urllib.request.urlopen(req, timeout=1.6) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        parsed = json.loads(raw)
        st = str(parsed.get("status", "")).strip().lower()
        out["status"] = st or "unknown"
        out["online"] = st == "ready"
    except Exception:
        pass
    return out


def _coerce_port(value, default: int) -> int:
    try:
        n = int(str(value).strip())
        if 1 <= n <= 65535:
            return n
    except Exception:
        pass
    return int(default)


def _resolve_runtime_config(payload: dict | None = None, query: dict | None = None) -> dict:
    payload = payload or {}
    query = query or {}

    def _pick(name: str):
        if name in payload:
            return payload.get(name)
        raw = query.get(name)
        if isinstance(raw, list):
            return raw[0] if raw else None
        return raw

    ip_raw = _pick("ps4_ip")
    if not ip_raw and "ip" in payload:
        ip_raw = payload.get("ip")
    ip = str(ip_raw or DEFAULT_PS4_IP).strip() or DEFAULT_PS4_IP

    return {
        "ps4_ip": ip,
        "ftp_port": _coerce_port(_pick("ftp_port"), DEFAULT_FTP_PORT),
        "rpi_port": _coerce_port(_pick("rpi_port"), DEFAULT_RPI_PORT),
        "binloader_port": _coerce_port(_pick("binloader_port"), DEFAULT_BINLOADER_PORT),
    }


def _probe_rpi_status(ip: str, port: int = DEFAULT_RPI_PORT) -> dict:
    out = {
        "ip": ip,
        "port": int(port),
        "online": False,
        "source": "rpi_socket_probe",
        "checkedAt": datetime.now().isoformat(),
        "error": "",
    }
    ok, err = _rpi_reachable(ip, int(port), 1.8)
    out["online"] = bool(ok)
    out["error"] = "" if ok else str(err or "")
    return out


def _read_storage_snapshot() -> dict:
    snap = _latest_snapshot_dir()
    out = {
        "available": False,
        "internal": None,
        "external": None,
        "source": "ftp_snapshot",
        "path": "",
        "error": "",
    }
    if not snap:
        out["error"] = "no snapshot"
        return out

    storage_path = snap / "storage" / "ps4-storage.json"
    out["path"] = str(storage_path)
    if not storage_path.exists():
        out["error"] = "storage json missing"
        return out

    try:
        payload = json.loads(storage_path.read_text(encoding="utf-8"))
        storage = payload.get("storage") if isinstance(payload, dict) else {}
        internal = storage.get("internal") if isinstance(storage, dict) else None
        external = storage.get("external") if isinstance(storage, dict) else None
        out["internal"] = internal if isinstance(internal, dict) else None
        out["external"] = external if isinstance(external, dict) else None
        out["available"] = bool(out["internal"] or out["external"])
    except Exception as exc:
        out["error"] = str(exc)
    return out


def _send_storage_payload(ip: str, port: int) -> dict:
    out = {
        "ok": False,
        "ip": ip,
        "port": port,
        "bytes": 0,
        "error": "",
    }
    if not STORAGE_PAYLOAD_BIN.exists():
        out["error"] = f"missing payload: {STORAGE_PAYLOAD_BIN}"
        return out
    try:
        data = STORAGE_PAYLOAD_BIN.read_bytes()
    except Exception as exc:
        out["error"] = f"read payload failed: {exc}"
        return out
    if not data:
        out["error"] = "payload file is empty"
        return out
    try:
        with socket.create_connection((ip, port), timeout=5) as s:
            s.sendall(data)
        out["ok"] = True
        out["bytes"] = len(data)
    except Exception as exc:
        out["error"] = str(exc)
    return out


def _run_ftp_snapshot(ip: str = DEFAULT_PS4_IP, port: int = DEFAULT_FTP_PORT) -> dict:
    out = {
        "cmd": "",
        "ok": False,
        "stdout": "",
        "stderr": "",
        "ran": False,
    }
    if not FTP_SNAPSHOT_SCRIPT.exists():
        out["stderr"] = f"missing script: {FTP_SNAPSHOT_SCRIPT}"
        return out
    snap_cmd = [
        "python3",
        str(FTP_SNAPSHOT_SCRIPT),
        "--non-interactive",
        "--ip",
        str(ip),
        "--port",
        str(int(port)),
    ]
    out["cmd"] = " ".join(snap_cmd)
    try:
        run = subprocess.run(
            snap_cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        out.update({
            "ok": run.returncode == 0,
            "stdout": run.stdout[-4000:],
            "stderr": run.stderr[-4000:],
            "ran": True,
        })
    except subprocess.TimeoutExpired as exc:
        out.update({
            "ok": False,
            "stdout": (exc.stdout or "")[-4000:] if exc.stdout else "",
            "stderr": f"Snapshot timed out after 180s\n{(exc.stderr or '')[-3000:]}" if exc.stderr else "Snapshot timed out after 180s",
            "ran": True,
        })
    return out


def _cleanup_pkg_tokens():
    now = time.time()
    stale = [k for k, v in PKG_TOKENS.items() if float(v.get("expires", 0)) <= now]
    for k in stale:
        PKG_TOKENS.pop(k, None)


def _cleanup_send_jobs():
    now = time.time()
    stale = []
    with SEND_JOBS_LOCK:
        for jid, item in SEND_JOBS.items():
            ts = float(item.get("updatedTs", item.get("createdTs", 0)) or 0)
            if ts and now - ts > SEND_JOB_TTL_SEC:
                stale.append(jid)
        for jid in stale:
            SEND_JOBS.pop(jid, None)


def _set_send_job(job_id: str, patch: dict):
    now_iso = datetime.now().isoformat()
    now_ts = time.time()
    with SEND_JOBS_LOCK:
        cur = SEND_JOBS.get(job_id, {})
        cur.update(patch or {})
        cur["jobId"] = job_id
        cur["updatedAt"] = now_iso
        cur["updatedTs"] = now_ts
        if "createdAt" not in cur:
            cur["createdAt"] = now_iso
            cur["createdTs"] = now_ts
        SEND_JOBS[job_id] = cur


def _list_send_jobs(limit: int = 60) -> list[dict]:
    _cleanup_send_jobs()
    with SEND_JOBS_LOCK:
        items = list(SEND_JOBS.values())
    items.sort(key=lambda x: float(x.get("createdTs", 0)), reverse=True)
    return items[:max(1, limit)]


def _local_ip_for_ps4(ps4_ip: str) -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((ps4_ip, 1))
        return s.getsockname()[0]
    finally:
        s.close()


def _create_pkg_token(pkg_path: Path) -> str:
    _cleanup_pkg_tokens()
    token = uuid.uuid4().hex
    PKG_TOKENS[token] = {
        "path": str(pkg_path),
        "created": time.time(),
        "expires": time.time() + PKG_TOKEN_TTL_SEC,
    }
    return token


def _rpi_install_via_url(ps4_ip: str, pkg_url: str, rpi_port: int = DEFAULT_RPI_PORT) -> dict:
    out = {
        "ok": False,
        "ip": ps4_ip,
        "endpoint": f"http://{ps4_ip}:{int(rpi_port)}/api/install",
        "streamUrl": pkg_url,
        "status": 0,
        "body": "",
        "error": "",
    }
    try:
        payload = json.dumps({"type": "direct", "packages": [pkg_url]}).encode("utf-8")
        req = urllib.request.Request(out["endpoint"], data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Content-Length", str(len(payload)))
        with urllib.request.urlopen(req, timeout=20) as resp:
            out["status"] = int(resp.status)
            body = resp.read().decode("utf-8", errors="ignore")
            out["body"] = body[:1200]
            body_l = body.lower()
            out["ok"] = 200 <= out["status"] < 300 and (
                ("success" in body_l)
                or ("task_id" in body_l)
                or ('"status":"success"' in body_l)
                or ('"status": "success"' in body_l)
            )
    except urllib.error.HTTPError as exc:
        out["status"] = int(exc.code)
        try:
            out["body"] = exc.read().decode("utf-8", errors="ignore")[:1200]
        except Exception:
            out["body"] = ""
        out["error"] = f"http {exc.code}"
    except Exception as exc:
        out["error"] = str(exc)
    return out


def _rpi_upload_via_url(ps4_ip: str, pkg_url: str, rpi_port: int = DEFAULT_RPI_PORT) -> dict:
    out = {
        "ok": False,
        "ip": ps4_ip,
        "endpoint": f"http://{ps4_ip}:{int(rpi_port)}/upload",
        "streamUrl": pkg_url,
        "status": 0,
        "body": "",
        "error": "",
    }
    boundary = f"----ps4mc_{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="url"\r\n\r\n'
        f"{pkg_url}\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    try:
        req = urllib.request.Request(out["endpoint"], data=body, method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        req.add_header("Content-Length", str(len(body)))
        with urllib.request.urlopen(req, timeout=20) as resp:
            out["status"] = int(resp.status)
            text = resp.read().decode("utf-8", errors="ignore")
            out["body"] = text[:1200]
            out["ok"] = 200 <= out["status"] < 300
    except urllib.error.HTTPError as exc:
        out["status"] = int(exc.code)
        try:
            out["body"] = exc.read().decode("utf-8", errors="ignore")[:1200]
        except Exception:
            out["body"] = ""
        out["error"] = f"http {exc.code}"
    except Exception as exc:
        out["error"] = str(exc)
    return out


def _http_post_json(url: str, payload: dict, timeout: int = 30) -> dict:
    out = {
        "ok": False,
        "url": url,
        "status": 0,
        "body": "",
        "json": None,
        "error": "",
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Content-Length", str(len(data)))
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            out["status"] = int(resp.status)
            text = resp.read().decode("utf-8", errors="ignore")
            out["body"] = text[:2000]
            try:
                out["json"] = json.loads(text)
            except Exception:
                out["json"] = None
            out["ok"] = 200 <= out["status"] < 300
        return out
    except urllib.error.HTTPError as exc:
        out["status"] = int(exc.code)
        try:
            text = exc.read().decode("utf-8", errors="ignore")
            out["body"] = text[:2000]
            try:
                out["json"] = json.loads(text)
            except Exception:
                out["json"] = None
        except Exception:
            out["body"] = ""
        out["error"] = f"http {exc.code}"
        return out
    except Exception as exc:
        out["error"] = str(exc)
        return out


def _extract_task_id(raw_body: str) -> int | None:
    if not raw_body:
        return None
    try:
        parsed = json.loads(raw_body)
        task = parsed.get("task_id")
        if isinstance(task, int):
            return task
        if isinstance(task, str) and task.isdigit():
            return int(task)
    except Exception:
        pass
    return None


def _rpi_get_task_progress(ps4_ip: str, task_id: int, rpi_port: int = DEFAULT_RPI_PORT) -> dict:
    endpoint = f"http://{ps4_ip}:{int(rpi_port)}/api/get_task_progress"
    out = _http_post_json(endpoint, {"task_id": int(task_id)}, timeout=20)
    result = {
        "ok": False,
        "taskId": int(task_id),
        "endpoint": endpoint,
        "status": out.get("status", 0),
        "error": out.get("error", ""),
        "body": out.get("body", ""),
        "data": None,
    }
    data = out.get("json")
    if isinstance(data, dict):
        result["data"] = data
        status_val = str(data.get("status", "")).lower()
        if out.get("ok") and status_val != "fail":
            result["ok"] = True
            return result
    if out.get("ok") and not data:
        result["ok"] = True
    return result


def _rpi_reachable(ps4_ip: str, port: int = DEFAULT_RPI_PORT, timeout_sec: float = 2.0) -> tuple[bool, str]:
    try:
        with socket.create_connection((ps4_ip, int(port)), timeout=timeout_sec):
            return (True, "")
    except Exception as exc:
        return (False, str(exc))


def _run_send_job(job_id: str, ip: str, stream_url: str, rpi_port: int = DEFAULT_RPI_PORT):
    ok_conn, conn_err = _rpi_reachable(ip, int(rpi_port), 2.2)
    if not ok_conn:
        _set_send_job(job_id, {
            "state": "failed",
            "ok": False,
            "phase": "preflight",
            "status": 0,
            "error": f"RPI endpoint unreachable on {ip}:{int(rpi_port)} ({conn_err})",
            "taskId": 0,
        })
        return
    _set_send_job(job_id, {"state": "sending", "phase": "api/install", "ok": None})
    result = _rpi_install_via_url(ip, stream_url, int(rpi_port))
    method = "api/install"
    if not result.get("ok"):
        _set_send_job(job_id, {"phase": "upload"})
        alt = _rpi_upload_via_url(ip, stream_url, int(rpi_port))
        if alt.get("ok"):
            result = alt
            method = "upload"
        else:
            result["fallback"] = alt
    task_id = _extract_task_id(str(result.get("body", "")))
    _set_send_job(job_id, {
        "state": "queued_on_ps4" if result.get("ok") else "failed",
        "ok": bool(result.get("ok")),
        "method": method,
        "status": int(result.get("status", 0) or 0),
        "body": str(result.get("body", ""))[:1200],
        "error": str(result.get("error", "")),
        "taskId": task_id or 0,
        "result": result,
    })


def _select_folder_dialog() -> tuple[int, dict]:
    if os.uname().sysname != "Darwin":
        return (400, {"ok": False, "error": "folder picker is macOS-only"})
    try:
        script = 'POSIX path of (choose folder with prompt "Select watch root folder for Mission Control")'
        run = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=120)
        if run.returncode != 0:
            err = (run.stderr or "").strip()
            if "User canceled" in err or "cancelled" in err.lower():
                return (200, {"ok": False, "cancelled": True})
            return (500, {"ok": False, "error": err or "folder picker failed"})
        picked = (run.stdout or "").strip()
        if not picked:
            return (200, {"ok": False, "cancelled": True})
        pth = Path(picked).expanduser().resolve(strict=False)
        if not pth.exists() or not pth.is_dir():
            return (400, {"ok": False, "error": "selected path is not a directory"})
        return (200, {"ok": True, "path": str(pth)})
    except subprocess.TimeoutExpired:
        return (500, {"ok": False, "error": "folder picker timeout"})
    except Exception as exc:
        return (500, {"ok": False, "error": str(exc)})


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_pkg(self, pkg_path: Path):
        if not pkg_path.exists() or not pkg_path.is_file():
            self.send_error(404, "pkg not found")
            return
        try:
            size = pkg_path.stat().st_size
            start = 0
            end = size - 1
            status = 200
            range_header = (self.headers.get("Range") or "").strip()
            if range_header:
                m = re.match(r"bytes=(\d*)-(\d*)", range_header)
                if m:
                    s, e = m.groups()
                    if s:
                        start = max(0, min(int(s), size - 1))
                    if e:
                        end = max(start, min(int(e), size - 1))
                    status = 206

            content_len = (end - start + 1) if end >= start else 0
            self.send_response(status)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(content_len))
            self.send_header("Content-Disposition", f'inline; filename="{pkg_path.name}"')
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Connection", "keep-alive")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()

            if self.command == "HEAD" or content_len <= 0:
                return
            with pkg_path.open("rb") as fh:
                fh.seek(start)
                remaining = content_len
                while remaining > 0:
                    chunk = fh.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except BrokenPipeError:
            return
        except Exception:
            self.send_error(500, "stream error")
            return

    def do_GET(self):
        parsed = urlparse(self.path)
        p = parsed.path
        # Allow operation behind /mission-control prefix proxies
        if p.startswith('/mission-control/api/'):
            p = p[len('/mission-control'):]
        query = parse_qs(parsed.query or "", keep_blank_values=False)
        if p == "/api/send-jobs":
            jobs = _list_send_jobs(limit=80)
            return self._json(200, {"ok": True, "jobs": jobs, "count": len(jobs)})
        if p.startswith("/api/pkg/"):
            tail = p.split("/api/pkg/", 1)[1].strip("/")
            token = tail.split("/", 1)[0] if tail else ""
            _cleanup_pkg_tokens()
            item = PKG_TOKENS.get(token)
            if not token or not item:
                self.send_error(404, "token not found")
                return
            pkg_path = Path(item.get("path", ""))
            return self._serve_pkg(pkg_path)
        if p == "/api/state":
            cfg = _resolve_runtime_config(query=query)
            ps4_status = _probe_ps4_status(cfg["ps4_ip"], cfg["binloader_port"])
            rpi_status = _probe_rpi_status(cfg["ps4_ip"], cfg["rpi_port"])
            storage = _read_storage_snapshot()
            return self._json(200, {
                "watch": _read_json(DATA["watch"]),
                "ignore": _read_json(DATA["ignore"]),
                "hide": _read_json(DATA["hide"]),
                "localIcons": _local_icon_map(),
                "ftpConfig": {
                    "host": cfg["ps4_ip"],
                    "port": cfg["ftp_port"],
                },
                "binloaderConfig": {"port": cfg["binloader_port"]},
                "rpiConfig": {"port": cfg["rpi_port"]},
                "ps4Status": ps4_status,
                "rpiStatus": rpi_status,
                "ps4Storage": storage,
                "lastRefresh": datetime.now().isoformat(),
            })
        if p == "/api/select-folder":
            code, payload = _select_folder_dialog()
            return self._json(code, payload)
        if p == "/api/ps4-layout":
            try:
                return self._json(200, {"ok": True, "layout": _build_ps4_layout()})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        p = parsed.path
        # Allow operation behind /mission-control prefix proxies
        if p.startswith('/mission-control/api/'):
            p = p[len('/mission-control'):]
        query = parse_qs(parsed.query or "", keep_blank_values=False)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            payload = {}
        cfg = _resolve_runtime_config(payload=payload, query=query)

        if p in ("/api/watch", "/api/ignore", "/api/hide"):
            key = p.split("/")[-1]
            cur = _read_json(DATA[key])
            cur.insert(0, payload)
            _write_json(DATA[key], cur)
            return self._json(200, {"ok": True, key: cur})

        if p == "/api/thumb-cache":
            ids = payload.get("ids") if isinstance(payload, dict) else None
            if not isinstance(ids, list):
                return self._json(400, {"ok": False, "error": "ids must be an array"})
            cache = _ensure_thumb_cache_for_ids(ids)
            out = {tid: cache.get(tid, {}) for tid in ids if isinstance(tid, str)}
            return self._json(200, {"ok": True, "items": out, "count": len(out)})

        if p == "/api/thumb-cache-clear":
            try:
                if THUMB_CACHE.exists():
                    THUMB_CACHE.unlink()
                return self._json(200, {"ok": True, "cleared": str(THUMB_CACHE)})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})

        if p == "/api/select-folder":
            code, resp = _select_folder_dialog()
            return self._json(code, resp)

        if p == "/api/extract-icon":
            raw_path = str(payload.get("path", "")).strip()
            raw_cusa = str(payload.get("cusa", "")).strip().upper()
            if not raw_path:
                return self._json(400, {"ok": False, "error": "missing path"})
            if not EXTRACT_ICON_SCRIPT.exists():
                return self._json(500, {"ok": False, "error": f"missing script: {EXTRACT_ICON_SCRIPT}"})
            try:
                pkg_path = Path(raw_path).expanduser().resolve(strict=False)
                allowed = [Path("/Volumes").resolve(), ROOT.resolve()]
                if not any(str(pkg_path).startswith(str(base)) for base in allowed):
                    return self._json(403, {"ok": False, "error": "path not allowed"})
                if not pkg_path.exists():
                    return self._json(404, {"ok": False, "error": "path not found"})
                if pkg_path.suffix.lower() != ".pkg":
                    return self._json(400, {"ok": False, "error": "only .pkg files are supported"})

                cusa = raw_cusa
                if not re.fullmatch(r"CUSA\d{5}", cusa):
                    m = re.search(r"(CUSA\d{5})", pkg_path.name.upper())
                    cusa = m.group(1) if m else ""

                cmd = [
                    "python3",
                    str(EXTRACT_ICON_SCRIPT),
                    "--pkg",
                    str(pkg_path),
                    "--max-scan-mb",
                    "768",
                    "--out-dir",
                    str(ICONS_DIR),
                ]
                run = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                stdout = (run.stdout or "")[-3000:]
                stderr = (run.stderr or "")[-3000:]
                icon_rel = ""
                icon_abs = ""
                if cusa:
                    p_icon = ICONS_DIR / f"{cusa}.png"
                    if p_icon.exists():
                        icon_abs = str(p_icon)
                        icon_rel = "/" + p_icon.relative_to(ROOT).as_posix()

                ok = run.returncode == 0 and bool(icon_rel)
                return self._json(200 if ok else 500, {
                    "ok": ok,
                    "path": str(pkg_path),
                    "cusa": cusa,
                    "iconPath": icon_rel,
                    "iconAbs": icon_abs,
                    "cmd": " ".join(cmd),
                    "stdout": stdout,
                    "stderr": stderr,
                })
            except subprocess.TimeoutExpired as exc:
                return self._json(500, {
                    "ok": False,
                    "error": "extract timeout after 180s",
                    "stdout": (exc.stdout or "")[-2000:] if exc.stdout else "",
                    "stderr": (exc.stderr or "")[-2000:] if exc.stderr else "",
                })
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})

        if p == "/api/open-path":
            raw_path = str(payload.get("path", "")).strip()
            if not raw_path:
                return self._json(400, {"ok": False, "error": "missing path"})
            try:
                target = Path(raw_path).expanduser().resolve(strict=False)
                allowed = [Path("/Volumes").resolve(), ROOT.resolve()]
                if not any(str(target).startswith(str(base)) for base in allowed):
                    return self._json(403, {"ok": False, "error": "path not allowed"})
                if not target.exists():
                    return self._json(404, {"ok": False, "error": "path not found"})
                run = subprocess.run(["open", "-R", str(target)], capture_output=True, text=True)
                if run.returncode != 0:
                    return self._json(500, {"ok": False, "error": (run.stderr or "failed to open finder").strip()})
                return self._json(200, {"ok": True, "path": str(target)})
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})

        if p == "/api/send-to-ps4":
            raw_path = str(payload.get("path", "")).strip()
            ip = str(payload.get("ip") or cfg["ps4_ip"]).strip()
            rpi_port = _coerce_port(payload.get("rpi_port"), cfg["rpi_port"])
            if not raw_path:
                return self._json(400, {"ok": False, "error": "missing path"})
            try:
                pkg_path = Path(raw_path).expanduser().resolve(strict=False)
                allowed = [Path("/Volumes").resolve(), ROOT.resolve()]
                if not any(str(pkg_path).startswith(str(base)) for base in allowed):
                    return self._json(403, {"ok": False, "error": "path not allowed"})
                if not pkg_path.exists():
                    return self._json(404, {"ok": False, "error": "path not found"})
                if pkg_path.suffix.lower() != ".pkg":
                    return self._json(400, {"ok": False, "error": "only .pkg files are supported"})
                local_ip = _local_ip_for_ps4(ip)
                port = int(os.environ.get("PS4_MC_PORT", "8787"))
                token = _create_pkg_token(pkg_path)
                stream_url = f"http://{local_ip}:{port}/api/pkg/{token}"
                job_id = uuid.uuid4().hex[:12]
                _set_send_job(job_id, {
                    "state": "queued",
                    "ok": None,
                    "ip": ip,
                    "rpiPort": int(rpi_port),
                    "path": str(pkg_path),
                    "bytes": int(pkg_path.stat().st_size),
                    "token": token,
                    "streamUrl": stream_url,
                    "taskId": 0,
                })
                t = threading.Thread(target=_run_send_job, args=(job_id, ip, stream_url, int(rpi_port)), daemon=True)
                t.start()
                return self._json(200, {
                    "ok": True,
                    "queued": True,
                    "jobId": job_id,
                    "ip": ip,
                    "rpiPort": int(rpi_port),
                    "path": str(pkg_path),
                    "bytes": int(pkg_path.stat().st_size),
                    "token": token,
                    "streamUrl": stream_url,
                    "startedAt": datetime.now().isoformat(),
                })
            except Exception as exc:
                return self._json(500, {"ok": False, "error": str(exc)})

        if p == "/api/rpi-task-progress":
            ip = str(payload.get("ip") or cfg["ps4_ip"]).strip()
            rpi_port = _coerce_port(payload.get("rpi_port"), cfg["rpi_port"])
            task_ids = payload.get("task_ids")
            if not isinstance(task_ids, list):
                single = payload.get("task_id")
                task_ids = [single] if single is not None else []
            ids = []
            for v in task_ids:
                try:
                    ids.append(int(v))
                except Exception:
                    continue
            if not ids:
                return self._json(400, {"ok": False, "error": "missing task_id(s)"})
            progresses = [_rpi_get_task_progress(ip, tid, int(rpi_port)) for tid in ids]
            ok = any(p.get("ok") for p in progresses)
            return self._json(200 if ok else 500, {
                "ok": ok,
                "ip": ip,
                "rpiPort": int(rpi_port),
                "tasks": progresses,
                "checkedAt": datetime.now().isoformat(),
            })

        if p == "/api/refresh":
            snapshot_run = _run_ftp_snapshot(cfg["ps4_ip"], cfg["ftp_port"])

            cmds = [
                [str(ROOT / "generate_installed_lists.sh")],
                [str(ROOT / "generate_external_lists.sh")],
                [str(ROOT / "generate_external_uninstalled.sh")],
                [str(ROOT / "generate_updates_pending.sh")],
            ]
            outputs = []
            ok = True
            for cmd in cmds:
                run = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
                outputs.append({
                    "cmd": " ".join(cmd),
                    "ok": run.returncode == 0,
                    "stdout": run.stdout[-2000:],
                    "stderr": run.stderr[-2000:],
                })
                if run.returncode != 0:
                    ok = False
            return self._json(200 if ok else 500, {
                "ok": ok,
                "snapshot": snapshot_run,
                "config": cfg,
                "warning": "" if snapshot_run.get("ok") else "PS4 FTP snapshot failed; lists were rebuilt from existing local data.",
                "runs": outputs,
                "ranAt": datetime.now().isoformat(),
            })

        if p == "/api/refresh-storage":
            send_run = _send_storage_payload(cfg["ps4_ip"], cfg["binloader_port"])
            snapshot_run = _run_ftp_snapshot(cfg["ps4_ip"], cfg["ftp_port"])
            storage = _read_storage_snapshot()
            ok = bool(send_run.get("ok") and snapshot_run.get("ok") and storage.get("available"))
            return self._json(200 if ok else 500, {
                "ok": ok,
                "config": cfg,
                "send": send_run,
                "snapshot": snapshot_run,
                "storage": storage,
                "ranAt": datetime.now().isoformat(),
            })

        return self._json(404, {"ok": False, "error": "unknown route"})

    def do_HEAD(self):
        p = urlparse(self.path).path
        if p.startswith("/api/pkg/"):
            tail = p.split("/api/pkg/", 1)[1].strip("/")
            token = tail.split("/", 1)[0] if tail else ""
            _cleanup_pkg_tokens()
            item = PKG_TOKENS.get(token)
            if not token or not item:
                self.send_error(404, "token not found")
                return
            pkg_path = Path(item.get("path", ""))
            return self._serve_pkg(pkg_path)
        return super().do_HEAD()

    def do_DELETE(self):
        p = urlparse(self.path).path
        if p.startswith("/api/watch/") or p.startswith("/api/ignore/") or p.startswith("/api/hide/"):
            _, _, key, idx = p.split("/", 3)
            if key not in DATA:
                return self._json(404, {"ok": False})
            cur = _read_json(DATA[key])
            try:
                i = int(idx)
                if 0 <= i < len(cur):
                    cur.pop(i)
                    _write_json(DATA[key], cur)
            except Exception:
                pass
            return self._json(200, {"ok": True, key: cur})
        return self._json(404, {"ok": False})


def main():
    port = int(os.environ.get("PS4_MC_PORT", "8787"))
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving mission control on http://localhost:{port}/mission-control/")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
