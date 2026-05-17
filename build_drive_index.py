"""
build_drive_index.py
────────────────────────────────────────────────────────────────────────────────
Builds 3 output files for the Course Library using the Google Drive API.

Phase 1 — Folders only  (~2 min, 23K folders)
Phase 2 — File sizes    (~20-60 min, 600K+ files, only 2 fields: size+parents)
           Checkpoint saved every CHECKPOINT_EVERY pages → safe to Ctrl+C and resume.
Phase 3 — Roll up sizes through the folder tree
Phase 4 — Write 3 output files

Outputs:
  1. drive_folders.json    — server-ready JSON with REAL recursive sizes
  2. structure_full.txt    — full indented folder tree with sub-folder counts
  3. main_folder_sizes.txt — one row per category, size, Drive link

Setup:
  pip install google-api-python-client google-auth-oauthlib tqdm
  python build_drive_index.py
"""

import os, json, pickle, sys, time, base64, zlib
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from threading import Lock
from tqdm import tqdm

from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# ─────────────────────────────── CONFIG ──────────────────────────────────────

ROOT_FOLDER_ID    = "1KPnxxKMuVE2dlJtXCl9-hBesEGNBJeGV"
CREDENTIALS_FILE  = "credentials.json"
TOKEN_FILE        = "token.pickle"
OUTPUT_FOLDERS    = "drive_folders.json"
OUTPUT_STRUCTURE  = "structure_full.txt"
OUTPUT_MAINSIZES  = "main_folder_sizes.txt"
CHECKPOINT_FILE   = ".size_checkpoint.json"   # temp resume file, deleted on success
SIZE_CACHE_FILE   = ".size_cache.json"         # persistent: {fileId:[size,parentId]}
CHECKPOINT_EVERY  = 200                        # save checkpoint every N pages (~200K files)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# ─────────────────────────────── REDIS ────────────────────────────────────────

_redis_conn = None
_redis_ready = False

def _get_redis():
    """Return a cached Redis client, or None if REDIS_URL is not set."""
    global _redis_conn, _redis_ready
    if _redis_ready:
        return _redis_conn
    _redis_ready = True
    url = os.environ.get("REDIS_URL")
    if not url:
        return None
    try:
        import redis as _rlib
        _redis_conn = _rlib.from_url(
            url,
            socket_timeout=30,
            socket_connect_timeout=10,
            ssl_cert_reqs=None,
            decode_responses=False,   # we store raw bytes (compressed)
        )
        _redis_conn.ping()
        print("  [redis] Connected to Upstash")
        return _redis_conn
    except Exception as e:
        print(f"  [redis] Not available: {e}")
        return None

def _compress(data_dict):
    """JSON-encode then zlib-compress a dict → bytes."""
    return zlib.compress(json.dumps(data_dict).encode("utf-8"), level=6)

def _decompress(raw_bytes):
    """Inverse of _compress."""
    return json.loads(zlib.decompress(raw_bytes).decode("utf-8"))

# ─────────────────────────────── AUTH ────────────────────────────────────────

def _write_credentials_from_env():
    """
    On Render: write credentials + token from env vars so no local files needed.
    Set these env vars on Render:
      GOOGLE_CREDENTIALS_JSON  — contents of credentials.json (paste the whole JSON)
      GOOGLE_TOKEN_B64         — base64-encoded token.pickle
                                 Get it with: python -c "import base64,open; print(base64.b64encode(open('token.pickle','rb').read()).decode())"
    """
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if creds_json and not os.path.exists(CREDENTIALS_FILE):
        with open(CREDENTIALS_FILE, "w") as f:
            f.write(creds_json)
        print("[auth] credentials.json written from env var")

    token_b64 = os.environ.get("GOOGLE_TOKEN_B64")
    if token_b64 and not os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "wb") as f:
            f.write(base64.b64decode(token_b64))
        print("[auth] token.pickle written from env var")


def get_service():
    _write_credentials_from_env()   # no-op on local if files already exist

    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("[auth] Refreshing token…")
            creds.refresh(Request())
            # Persist refreshed token so next run reuses it within this deployment
            with open(TOKEN_FILE, "wb") as f:
                pickle.dump(creds, f)
            print("[auth] Token refreshed and saved.")
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                print(f"[error] {CREDENTIALS_FILE} not found.")
                print("  Set GOOGLE_CREDENTIALS_JSON env var on Render")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            with open(TOKEN_FILE, "wb") as f:
                pickle.dump(creds, f)
            print("[auth] Token saved.")
    return build("drive", "v3", credentials=creds)

# ─────────────────────────────── RETRY ───────────────────────────────────────

def retry_execute(request_fn, max_retries=6, base_delay=2):
    """Exponential backoff on 429/500/502/503/504 and network errors."""
    from googleapiclient.errors import HttpError
    for attempt in range(max_retries):
        try:
            return request_fn().execute()
        except HttpError as e:
            code = e.resp.status
            if code in (429, 500, 502, 503, 504):
                wait = min(base_delay * (2 ** attempt), 60)  # cap at 60s
                print(f"\n  [retry] HTTP {code} — waiting {wait}s (attempt {attempt+1}/{max_retries})…", flush=True)
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            wait = min(base_delay * (2 ** attempt), 60)  # cap at 60s
            print(f"\n  [retry] {type(e).__name__}: {e} — waiting {wait}s…", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"API call failed after {max_retries} retries")

# ─────────────────────────────── PHASE 1: FOLDERS ────────────────────────────

def fetch_folders(service):
    """Fetch all Drive folders. build_path_map filters to courses subtree."""
    items, page_token = [], None
    q = "mimeType='application/vnd.google-apps.folder' and trashed=false"
    while True:
        resp = retry_execute(lambda pt=page_token: service.files().list(
            q=q, pageSize=1000,
            fields="nextPageToken, files(id,name,parents,modifiedTime)",
            supportsAllDrives=True, includeItemsFromAllDrives=True,
            corpora="allDrives", pageToken=pt,
        ))
        items.extend(resp.get("files", []))
        print(f"  fetched {len(items):,} folders…", end="\r")
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    print()
    return items

def fetch_root_meta(service, root_id):
    try:
        return retry_execute(lambda: service.files().get(
            fileId=root_id, fields="id,name,parents,modifiedTime",
            supportsAllDrives=True,
        ))
    except Exception as e:
        print(f"  [warn] Could not fetch root: {e}")
        return {"id": root_id, "name": "Courses", "parents": []}

# ─────────────────────────────── PHASE 2: FILE SIZES ─────────────────────────
#
# STRATEGY:
#  • First run (no cache):  full scan → saves {fileId:[size,parentId]} + Drive
#                           changes token. Takes ~28 min.
#  • Next runs (cache exists): fetch changes since last token (~seconds),
#                           update only changed files in cache, rebuild
#                           direct_bytes from full cache (pure Python, instant).
#  • If cache lost (redeploy etc.): falls back to full scan automatically.
# ─────────────────────────────────────────────────────────────────────────────


REDIS_CHUNK_ENTRIES = 50_000  # ~500 KB compressed per chunk (under Upstash 1MB limit)


def _save_size_cache(sizes, token):
    """Persist cache to Redis in chunks — disk only if Redis unavailable."""
    saved_at = datetime.utcnow().isoformat()
    r = _get_redis()
    if r:
        try:
            items  = list(sizes.items())
            chunks = [dict(items[i:i+REDIS_CHUNK_ENTRIES])
                      for i in range(0, len(items), REDIS_CHUNK_ENTRIES)]
            for idx, chunk in enumerate(chunks):
                compressed = _compress(chunk)
                r.set(f"drive:size_cache:{idx}", compressed)
                kb = len(compressed) / 1024
                print(f"  [redis] chunk {idx+1}/{len(chunks)}: {len(chunk):,} entries ({kb:.0f} KB)", flush=True)
            # Store token + chunk count in meta key
            meta = {"chunks": len(chunks), "token": token, "saved_at": saved_at, "count": len(sizes)}
            r.set("drive:size_cache:meta", _compress(meta))
            # Clean up stale extra chunks from a previous larger save
            for stale in range(len(chunks), len(chunks) + 20):
                if r.exists(f"drive:size_cache:{stale}"):
                    r.delete(f"drive:size_cache:{stale}")
                else:
                    break
            print(f"  [redis] Saved {len(sizes):,} sizes in {len(chunks)} chunks → drive:size_cache:*", flush=True)
            return  # done — no disk write needed
        except Exception as e:
            print(f"  [redis] Chunked save error: {e} — falling back to disk", flush=True)

    # Disk fallback (local dev or Redis failure)
    try:
        payload = {"sizes": sizes, "token": token, "saved_at": saved_at, "count": len(sizes)}
        with open(SIZE_CACHE_FILE, "w") as f:
            json.dump(payload, f)
        print(f"  [cache] Saved {len(sizes):,} sizes → {SIZE_CACHE_FILE}")
    except Exception as e:
        print(f"  [cache] Disk save error: {e}")


def _load_size_cache():
    """Load size cache from Redis chunks → disk fallback."""
    r = _get_redis()
    if r:
        # 1a. Try chunked format (new)
        try:
            raw_meta = r.get("drive:size_cache:meta")
            if raw_meta:
                meta = _decompress(raw_meta)
                n_chunks = meta["chunks"]
                sizes = {}
                for idx in range(n_chunks):
                    raw = r.get(f"drive:size_cache:{idx}")
                    if raw is None:
                        raise ValueError(f"Missing chunk {idx}")
                    sizes.update(_decompress(raw))
                print(f"  [redis] Loaded {len(sizes):,} cached sizes in {n_chunks} chunks (saved {meta.get('saved_at','?')[:10]})", flush=True)
                return sizes, meta["token"]
        except Exception as e:
            print(f"  [redis] Chunked load error: {e} — trying legacy key", flush=True)

        # 1b. Legacy single-key format (backward compat)
        try:
            raw = r.get("drive:size_cache")
            if raw:
                data = _decompress(raw)
                n = len(data.get("sizes", {}))
                print(f"  [redis] Loaded {n:,} cached sizes (legacy, saved {data.get('saved_at','?')[:10]})")
                return data["sizes"], data["token"]
        except Exception as e:
            print(f"  [redis] Legacy load error: {e} — trying disk")

    # 2. Fallback: disk
    if not os.path.exists(SIZE_CACHE_FILE):
        return None, None
    try:
        with open(SIZE_CACHE_FILE, "r") as f:
            data = json.load(f)
        print(f"  [cache] Loaded {len(data['sizes']):,} cached sizes from disk (saved {data.get('saved_at','?')[:10]})")
        return data["sizes"], data["token"]
    except Exception as e:
        print(f"  [cache] Could not load: {e} — will do full scan")
        return None, None


def _get_start_token(service):
    """Get the current Drive changes page token (bookmark for future incremental runs)."""
    resp = retry_execute(lambda: service.changes().getStartPageToken(
        supportsAllDrives=True,
    ))
    return resp["startPageToken"]

def _fetch_changes_since(service, token):
    """
    Fetch all file changes since the given token.
    Returns (list_of_changes, new_token).
    Each change: {fileId, removed, file:{size, parents, mimeType, trashed}}
    """
    changes, page_token, new_token = [], token, token
    page_num = 0
    while page_token:
        resp = retry_execute(lambda pt=page_token: service.changes().list(
            pageToken=pt, pageSize=1000,
            fields="nextPageToken,newStartPageToken,changes(fileId,removed,file(size,parents,mimeType,trashed))",
            supportsAllDrives=True, includeItemsFromAllDrives=True,
            includeRemoved=True,
        ))
        changes.extend(resp.get("changes", []))
        new_token  = resp.get("newStartPageToken", new_token)
        page_token = resp.get("nextPageToken")
        page_num  += 1
        if page_num % 10 == 0:  # print every 10 pages so Render logs show progress
            print(f"  [changes] page {page_num} — {len(changes):,} changes so far…", flush=True)
    print(f"  → {len(changes):,} changes since last run ({page_num} pages)", flush=True)
    return changes, new_token

def _build_direct_bytes(sizes_cache, folder_ids):
    """
    Rebuild direct_bytes {parentId: total_bytes} and total_size from
    the in-memory sizes cache. Pure Python — no API calls.
    """
    direct_bytes = defaultdict(int)
    total_size   = 0
    for fid, entry in sizes_cache.items():
        size, parent = entry[0], entry[1]
        if size and parent and parent in folder_ids:
            direct_bytes[parent] += size
        total_size += (size or 0)
    return direct_bytes, total_size


def count_total_files(service):
    """Quick pre-count for ETA display (full scan only)."""
    print("  Pre-counting total files…", end="\r")
    total, page_token = 0, None
    while True:
        resp = retry_execute(lambda pt=page_token: service.files().list(
            q="mimeType!='application/vnd.google-apps.folder' and trashed=false",
            pageSize=1000, fields="nextPageToken, files(id)",
            supportsAllDrives=True, includeItemsFromAllDrives=True,
            corpora="allDrives", pageToken=pt,
        ))
        total     += len(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        print(f"  Pre-counting… {total:,} files", end="\r")
        if not page_token:
            break
    print(f"  Total files in Drive: {total:,}              ")
    return total


def fetch_file_sizes(service, folder_ids, max_workers=None):
    """
    Main entry: tries incremental first, falls back to parallel full scan.
    Returns: dict { parent_folder_id: total_direct_bytes }
    max_workers: override thread count (default: SCAN_WORKERS env var or 8)
    """
    if max_workers is None:
        max_workers = int(os.environ.get("SCAN_WORKERS", 3))  # 3 = safe default (avoids rate limits)
    sizes_cache, changes_token = _load_size_cache()

    # ── INCREMENTAL PATH ─────────────────────────────────────────────────────
    if sizes_cache is not None and changes_token:
        print(f"  [incremental] Fetching only changed files since last run…", flush=True)
        t0 = time.time()
        changes, new_token = _fetch_changes_since(service, changes_token)

        if not changes:
            print("  [incremental] No changes — reusing cached sizes instantly", flush=True)
        else:
            added = removed = updated = 0
            for change in changes:
                fid     = change["fileId"]
                removed_ = change.get("removed", False)
                f        = change.get("file") or {}
                trashed  = f.get("trashed", False)
                mime     = f.get("mimeType", "")

                if mime == "application/vnd.google-apps.folder":
                    continue  # skip folder changes — handled in phase 1

                if removed_ or trashed:
                    if fid in sizes_cache:
                        del sizes_cache[fid]
                        removed += 1
                else:
                    size    = int(f.get("size") or 0)
                    parents = f.get("parents", [])
                    parent  = parents[0] if parents else None
                    if fid in sizes_cache:
                        updated += 1
                    else:
                        added += 1
                    sizes_cache[fid] = [size, parent]

            print(f"  [incremental] +{added:,} new | ~{updated:,} updated | -{removed:,} removed")

        # Rebuild direct_bytes from full (now-updated) cache
        direct_bytes, total_size = _build_direct_bytes(sizes_cache, folder_ids)
        elapsed = time.time() - t0
        print(f"  [incremental] Done in {elapsed:.1f}s | Drive total: {fmt_size(total_size)}")

        # Save updated cache + new token
        _save_size_cache(sizes_cache, new_token)
        return direct_bytes

    # ── FULL SCAN PATH ──────────────────────────────────────────────────────────────────
    print("  [full scan] No cache found — parallel scan starting (~4–6 min)", flush=True)
    print("  Getting Drive changes token bookmark…")
    snapshot_token = _get_start_token(service)  # bookmark BEFORE scan

    print("  Launching parallel folder-batch workers…", flush=True)

    # ── Parallel folder-batch scan ─────────────────────────────────────────────────
    BATCH_SIZE  = 10    # folder IDs per query (safe URL length)
    MAX_WORKERS = max_workers

    folder_id_list = list(folder_ids)
    batches = [folder_id_list[i:i+BATCH_SIZE]
               for i in range(0, len(folder_id_list), BATCH_SIZE)]
    n_batches = len(batches)
    print(f"  {n_batches:,} batches × {BATCH_SIZE} folders | {MAX_WORKERS} workers", flush=True)

    sizes_cache  = {}
    direct_bytes = defaultdict(int)
    total_size   = 0
    done_batches = 0
    start_time   = time.time()
    _lock        = Lock()

    # Load credentials once — they are thread-safe for reads
    with open(TOKEN_FILE, "rb") as _tf:
        _creds = pickle.load(_tf)

    def _fetch_batch(batch):
        """
        Worker: fetch files for up to BATCH_SIZE folders using requests.AuthorizedSession.
        Uses timeout=(10, 30) — 10s connect, 30s read — which reliably kills SSL hangs.
        """
        from google.auth.transport.requests import AuthorizedSession
        import requests as _req

        session = AuthorizedSession(_creds)
        q_parts = " or ".join(f"'{fid}' in parents" for fid in batch)
        q = (f"({q_parts}) and mimeType!='application/vnd.google-apps.folder'"
             f" and trashed=false")
        local = {}
        pt     = None
        attempt = 0
        max_att = 5

        while True:
            try:
                params = {
                    "q": q, "pageSize": 1000,
                    "fields": "nextPageToken,files(id,size,parents)",
                    "supportsAllDrives": True,
                    "includeItemsFromAllDrives": True,
                    "corpora": "allDrives",
                }
                if pt:
                    params["pageToken"] = pt
                r = session.get(
                    "https://www.googleapis.com/drive/v3/files",
                    params=params,
                    timeout=(10, 30),   # hard timeout — kills any SSL hang
                )
                if r.status_code in (429, 500, 502, 503, 504):
                    wait = min(2 * (2 ** attempt), 60)
                    attempt += 1
                    print(f"\n  [worker] HTTP {r.status_code} — retry in {wait}s", flush=True)
                    if attempt > max_att:
                        raise RuntimeError(f"HTTP {r.status_code} after {max_att} retries")
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                attempt = 0          # reset on success
                data = r.json()
                for f in data.get("files", []):
                    fid    = f.get("id")
                    size   = int(f.get("size") or 0)
                    parent = (f.get("parents") or [None])[0]
                    local[fid] = [size, parent]
                pt = data.get("nextPageToken")
                if not pt:
                    break
            except (_req.exceptions.Timeout, _req.exceptions.ConnectionError) as e:
                wait = min(2 * (2 ** attempt), 60)
                attempt += 1
                print(f"\n  [worker] {type(e).__name__} — retry in {wait}s", flush=True)
                if attempt > max_att:
                    raise
                time.sleep(wait)
        return local

    failed_batches = []   # collect timed-out / errored batches for sequential retry

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_batch, b): b for b in batches}
        for future in as_completed(futures):
            batch = futures[future]
            try:
                result = future.result(timeout=90)  # 90s max — move on if hung
                with _lock:
                    sizes_cache.update(result)
                    for fid, (sz, par) in result.items():
                        total_size += sz
                        if sz and par and par in folder_ids:
                            direct_bytes[par] += sz
                    done_batches += 1
                    if done_batches % 50 == 0 or done_batches == n_batches:
                        elapsed = time.time() - start_time
                        rate = len(sizes_cache) / elapsed if elapsed > 0 else 0
                        m, s = divmod(int(elapsed), 60)
                        retry_note = f" | {len(failed_batches)} queued for retry" if failed_batches else ""
                        print(f"  [parallel] {done_batches}/{n_batches} batches | "
                              f"{len(sizes_cache):,} files | {fmt_size(total_size)} | "
                              f"{rate:,.0f} f/s | {m:02d}:{s:02d}{retry_note}", flush=True)
            except TimeoutError:
                failed_batches.append(batch)
                print(f"\n  [retry-queue] Batch timed out — will retry sequentially "
                      f"({len(failed_batches)} queued)", flush=True)
            except Exception as e:
                failed_batches.append(batch)
                print(f"\n  [retry-queue] Batch error: {e} — will retry sequentially "
                      f"({len(failed_batches)} queued)", flush=True)

    # ── Sequential retry for any failed batches ───────────────────────────────
    if failed_batches:
        print(f"\n  [retry] Retrying {len(failed_batches)} failed batches sequentially…", flush=True)
        for i, batch in enumerate(failed_batches, 1):
            q_parts = " or ".join(f"'{fid}' in parents" for fid in batch)
            q = (f"({q_parts}) and mimeType!='application/vnd.google-apps.folder'"
                 f" and trashed=false")
            pt = None
            try:
                while True:
                    resp = retry_execute(lambda p=pt: service.files().list(
                        q=q, pageSize=1000,
                        fields="nextPageToken, files(id,size,parents)",
                        supportsAllDrives=True, includeItemsFromAllDrives=True,
                        corpora="allDrives", pageToken=p,
                    ))
                    for f in resp.get("files", []):
                        fid    = f.get("id")
                        sz     = int(f.get("size") or 0)
                        parent = (f.get("parents") or [None])[0]
                        sizes_cache[fid] = [sz, parent]
                        total_size += sz
                        if sz and parent and parent in folder_ids:
                            direct_bytes[parent] += sz
                    pt = resp.get("nextPageToken")
                    if not pt:
                        break
                print(f"  [retry] {i}/{len(failed_batches)} done", flush=True)
            except Exception as e:
                print(f"  [retry] {i}/{len(failed_batches)} FAILED again: {e}", flush=True)

    print(f"\n  -> {len(sizes_cache):,} files | Drive total: {fmt_size(total_size)}", flush=True)
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)

    # Save cache for future incremental runs
    _save_size_cache(sizes_cache, snapshot_token)
    return direct_bytes

# ─────────────────────────────── PHASE 3: ROLLUP ─────────────────────────────

def build_path_map(folders, root_id):
    """Returns { folder_id: 'relative/path' } for folders under root_id."""
    by_id = {f["id"]: f for f in folders}
    cache = {}

    def resolve(fid):
        if fid in cache:
            return cache[fid]
        if fid == root_id:
            cache[fid] = ""
            return ""
        folder = by_id.get(fid)
        if not folder:
            cache[fid] = None
            return None
        parents = folder.get("parents", [])
        if not parents:
            cache[fid] = None
            return None
        pp = resolve(parents[0])
        if pp is None:
            cache[fid] = None
            return None
        path = folder["name"] if pp == "" else f"{pp}/{folder['name']}"
        cache[fid] = path
        return path

    path_map = {}
    for f in tqdm(folders, desc="  building paths", ncols=72):
        p = resolve(f["id"])
        if p is not None and p != "":
            path_map[f["id"]] = p
    return path_map

def rollup_sizes(path_map, direct_bytes, all_folders):
    """Propagate direct file bytes up through the folder tree (recursive totals)."""
    children = defaultdict(list)
    by_id    = {f["id"]: f for f in all_folders}

    for fid in path_map:
        folder  = by_id.get(fid, {})
        parents = folder.get("parents", [])
        if parents and parents[0] in path_map:
            children[parents[0]].append(fid)

    recursive = {}

    def rollup(fid):
        if fid in recursive:
            return recursive[fid]
        total = direct_bytes.get(fid, 0)
        for child in children.get(fid, []):
            total += rollup(child)
        recursive[fid] = total
        return total

    for fid in tqdm(list(path_map.keys()), desc="  rolling up", ncols=72):
        rollup(fid)

    return recursive

# ─────────────────────────────── PHASE 4: OUTPUT ─────────────────────────────

def fmt_size(b):
    if not b: return "—"
    gb = b / (1024**3)
    if gb >= 1024: return f"{gb/1024:.3f} TB"
    if gb >= 1:    return f"{gb:.2f} GB"
    return f"{b/(1024**2):.0f} MB"

def write_drive_folders_json(path_map, folder_by_id, sizes, output_file):
    records = []
    for fid, rel_path in path_map.items():
        folder = folder_by_id.get(fid, {})
        records.append({
            "Path":     rel_path,
            "Name":     folder.get("name", ""),
            "Size":     sizes.get(fid, 0),
            "MimeType": "inode/directory",
            "ModTime":  folder.get("modifiedTime", datetime.utcnow().isoformat() + "Z"),
            "IsDir":    True,
            "ID":       fid,
        })
    records.sort(key=lambda r: r["Path"].lower())
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"[✓] {output_file}  →  {len(records):,} records")

def write_structure_txt(path_map, folder_by_id, sizes, output_file):
    children_of = defaultdict(list)
    for fid, path in path_map.items():
        parts  = path.split("/")
        parent = "/".join(parts[:-1])
        children_of[parent].append((parts[-1], fid, path))
    for p in children_of:
        children_of[p].sort(key=lambda x: x[0].lower())

    lines = []
    now   = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    lines += [f"Course Library — Full Folder Structure",
              f"Generated : {now}", f"Folders   : {len(path_map):,}",
              "=" * 72, ""]

    def write_node(path, depth):
        for name, fid, full_path in children_of.get(path, []):
            indent    = "  " * depth
            sub_count = sum(1 for p in path_map.values() if p.startswith(full_path + "/"))
            sz        = fmt_size(sizes.get(fid, 0))
            if depth == 0:
                lines.append(f"{indent}{name}  [{sub_count:,} sub-folders | {sz}]")
            elif depth == 1:
                lines.append(f"{indent}{name}  [{sub_count:,} | {sz}]")
            else:
                lines.append(f"{indent}{name}")
            write_node(full_path, depth + 1)

    write_node("", 0)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[✓] {output_file}  →  {len(lines):,} lines")

def write_main_sizes_txt(path_map, folder_by_id, sizes, output_file):
    top = []
    for fid, path in path_map.items():
        if "/" in path:
            continue
        folder    = folder_by_id.get(fid, {})
        sub_count = sum(1 for p in path_map.values() if p.startswith(path + "/"))
        top.append({
            "name":    path,
            "bytes":   sizes.get(fid, 0),
            "folders": sub_count,
            "mod":     folder.get("modifiedTime", "")[:10],
            "url":     f"https://drive.google.com/drive/folders/{fid}",
        })
    top.sort(key=lambda x: x["name"].lower())
    total_bytes   = sum(t["bytes"]   for t in top)
    total_folders = sum(t["folders"] for t in top)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    lines = ["Course Library — Main Folder Sizes",
             f"Generated  : {now}", f"Categories : {len(top)}",
             f"Total size : {fmt_size(total_bytes)}",
             f"Sub-folders: {total_folders:,}",
             "=" * 90,
             f"  {'#':<3}  {'Category':<40}  {'Sub-folders':>11}  {'Size':>12}  Modified",
             "-" * 90]

    for i, t in enumerate(top, 1):
        lines.append(f"  {i:<3}  {t['name']:<40}  {t['folders']:>11,}  {fmt_size(t['bytes']):>12}  {t['mod']}")
        lines.append(f"       {t['url']}")
        lines.append("")

    lines += ["=" * 90,
              f"  TOTAL{'':38}  {total_folders:>11,}  {fmt_size(total_bytes):>12}"]

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[✓] {output_file}  →  {len(top)} categories")

# ─────────────────────────────── MAIN ────────────────────────────────────────

def main(workers=8):
    print("\n╔══════════════════════════════════════════╗")
    print("║   Drive Index Builder  —  Course Library ║")
    print("╚══════════════════════════════════════════╝\n")

    service = get_service()
    print("[auth] Connected to Google Drive API\n")

    # ── Phase 1: Fetch folders
    print("[1/4] Fetching folders…")
    folders    = fetch_folders(service)
    root_meta  = fetch_root_meta(service, ROOT_FOLDER_ID)
    folders.append(root_meta)
    print(f"  → {len(folders):,} folders total\n")

    # ── Phase 2: Build path map (filter to courses subtree)
    print("[2/4] Reconstructing folder paths…")
    folder_by_id = {f["id"]: f for f in folders}
    path_map     = build_path_map(folders, ROOT_FOLDER_ID)
    folder_ids   = set(path_map.keys())
    print(f"  → {len(path_map):,} folders in courses subtree\n")

    # ── Phase 3: Fetch file sizes
    print("[3/4] Fetching file sizes…")
    direct_bytes = fetch_file_sizes(service, folder_ids, max_workers=workers)
    print(f"  → Rolling up recursive folder totals…")
    sizes = rollup_sizes(path_map, direct_bytes, folders)
    total_bytes = sum(sizes.get(fid,0) for fid,p in path_map.items() if "/" not in p)
    print(f"  → Measured total: {fmt_size(total_bytes)}\n")

    # ── Phase 4: Write outputs
    print("[4/4] Writing output files…")
    write_drive_folders_json(path_map, folder_by_id, sizes, OUTPUT_FOLDERS)
    write_structure_txt(path_map, folder_by_id, sizes, OUTPUT_STRUCTURE)
    write_main_sizes_txt(path_map, folder_by_id, sizes, OUTPUT_MAINSIZES)

    print(f"""
┌──────────────────────────────────────┐
│  Folders     : {len(path_map):>10,}         │
│  Total size  : {fmt_size(total_bytes):>12}         │
│  drive_folders.json      ✓           │
│  structure_full.txt      ✓           │
│  main_folder_sizes.txt   ✓           │
└──────────────────────────────────────┘

Done! Call /api/reload or restart server.
""")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build Course Library drive index")
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=int(os.environ.get("SCAN_WORKERS", 8)),
        help="Parallel API workers for full scan (default: 8, or SCAN_WORKERS env var)"
    )
    args = parser.parse_args()
    main(workers=args.workers)
