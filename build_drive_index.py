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

import os, json, pickle, sys, time, base64
from collections import defaultdict
from datetime import datetime
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
CHECKPOINT_FILE   = ".size_checkpoint.json"   # deleted after successful run
CHECKPOINT_EVERY  = 200                        # save checkpoint every N pages (~200K files)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

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

def retry_execute(request_fn, max_retries=8, base_delay=2):
    """Exponential backoff on 429/500/502/503/504 and network errors."""
    from googleapiclient.errors import HttpError
    for attempt in range(max_retries):
        try:
            return request_fn().execute()
        except HttpError as e:
            code = e.resp.status
            if code in (429, 500, 502, 503, 504):
                wait = base_delay * (2 ** attempt)
                print(f"\n  [retry] HTTP {code} — waiting {wait}s (attempt {attempt+1}/{max_retries})…")
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            wait = base_delay * (2 ** attempt)
            print(f"\n  [retry] {type(e).__name__}: {e} — waiting {wait}s…")
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

def count_total_files(service):
    """Quick pre-count: pages through with zero file data to get total file count."""
    print("  Pre-counting total files (fast pass)…", end="\r")
    total, page_token = 0, None
    while True:
        resp = retry_execute(lambda pt=page_token: service.files().list(
            q="mimeType!='application/vnd.google-apps.folder' and trashed=false",
            pageSize=1000,
            fields="nextPageToken, files(id)",   # id only — just count
            supportsAllDrives=True, includeItemsFromAllDrives=True,
            corpora="allDrives", pageToken=pt,
        ))
        total     += len(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        print(f"  Pre-counting… {total:,} files found so far", end="\r")
        if not page_token:
            break
    print(f"  Total files in Drive: {total:,}              ")
    return total


def fetch_file_sizes(service, folder_ids, total_files=0):
    """
    Fetch ONLY (size, parents) for every non-folder file.
    Displays a live dashboard every page:
      Files: 123,456 / 612,000 (20.2%) | Size: 1.23 TB | Rate: 4,200/s | ETA: 01:45
    Checkpoint saved every CHECKPOINT_EVERY pages — safe to Ctrl+C and resume.
    Returns: dict { parent_folder_id: total_direct_bytes }
    """
    direct_bytes = defaultdict(int)
    page_token   = None
    page_count   = 0
    file_count   = 0
    total_size   = 0
    start_time   = time.time()
    resumed      = False

    # ── Resume from checkpoint
    if os.path.exists(CHECKPOINT_FILE):
        print(f"  [resume] Checkpoint found — resuming…")
        with open(CHECKPOINT_FILE, "r") as f:
            ckpt = json.load(f)
        direct_bytes = defaultdict(int, {k: v for k, v in ckpt["direct_bytes"].items()})
        page_token   = ckpt.get("page_token")
        page_count   = ckpt.get("page_count", 0)
        file_count   = ckpt.get("file_count", 0)
        total_size   = ckpt.get("total_size",  0)
        resumed      = True
        print(f"  [resume] Continuing after {file_count:,} files ({fmt_size(total_size)})\n")

    q = "mimeType!='application/vnd.google-apps.folder' and trashed=false"

    def live(extra=""):
        elapsed = time.time() - start_time
        rate    = file_count / elapsed if elapsed > 0 else 0
        pct     = (file_count / total_files * 100) if total_files else 0
        done    = f"{file_count:,}"
        total_s = f" / {total_files:,} ({pct:.1f}%)" if total_files else ""
        eta_s   = ""
        if total_files and rate > 0:
            remaining_files = total_files - file_count
            eta_sec = remaining_files / rate
            h, rem  = divmod(int(eta_sec), 3600)
            m, s    = divmod(rem, 60)
            eta_s   = f" | ETA {h:02d}:{m:02d}:{s:02d}" if h else f" | ETA {m:02d}:{s:02d}"
        elapsed_s = f"{int(elapsed//60):02d}:{int(elapsed%60):02d}"
        line = (f"  Files: {done}{total_s} | "
                f"Size: {fmt_size(total_size)} | "
                f"Rate: {rate:,.0f}/s | "
                f"Elapsed: {elapsed_s}{eta_s}  {extra}")
        print(f"\r{line[:120]:<120}", end="", flush=True)

    while True:
        resp = retry_execute(lambda pt=page_token: service.files().list(
            q=q, pageSize=1000,
            fields="nextPageToken, files(size,parents)",
            supportsAllDrives=True, includeItemsFromAllDrives=True,
            corpora="allDrives", pageToken=pt,
        ))

        for f in resp.get("files", []):
            size = int(f.get("size") or 0)
            if size == 0:
                continue
            for pid in f.get("parents", []):
                if pid in folder_ids:
                    direct_bytes[pid] += size
            total_size += size

        batch      = len(resp.get("files", []))
        file_count += batch
        page_count += 1
        live()

        page_token = resp.get("nextPageToken")

        # Checkpoint
        if page_count % CHECKPOINT_EVERY == 0:
            with open(CHECKPOINT_FILE, "w") as f:
                json.dump({
                    "direct_bytes": dict(direct_bytes),
                    "page_token":   page_token,
                    "page_count":   page_count,
                    "file_count":   file_count,
                    "total_size":   total_size,
                    "saved_at":     datetime.utcnow().isoformat(),
                }, f)
            live(f"[ckpt saved]")

        if not page_token:
            break

    print()  # newline after live display

    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)

    print(f"  → {file_count:,} files | Drive total: {fmt_size(total_size)}")
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

def main():
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
    if os.path.exists(CHECKPOINT_FILE):
        print("  [resume] Checkpoint found — skipping pre-count")
        total_files = 0   # no pre-count needed on resume, ETA will show after first page
    else:
        print("  Step 3a — Pre-counting total files for ETA…")
        total_files = count_total_files(service)
        print()

    print("  Step 3b — Fetching sizes (size+parents only, 2 fields)…")
    print(f"  Checkpoint every {CHECKPOINT_EVERY*1000:,} files — safe to Ctrl+C and resume\n")
    direct_bytes = fetch_file_sizes(service, folder_ids, total_files)
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
    main()
