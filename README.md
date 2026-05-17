# 📚 All-Courses — Course Library Portal

A self-hosted, auto-syncing course library portal that indexes **10+ TB of learning content** across 22,000+ Google Drive folders and serves it as a fast, searchable web UI.

**Live:** [all-courses.onrender.com](https://all-courses.onrender.com)

---

## ✨ What It Does

- Crawls your entire Google Drive folder tree and computes **real recursive sizes** for every folder
- Stores the index in **Upstash Redis** (persists across server restarts and redeployments)
- Serves a dark-themed, searchable, mobile-friendly web UI with instant folder navigation
- Auto-syncs **twice daily** via a built-in cron job — first run is a full scan (~28 min), every subsequent run is **incremental via the Drive Changes API** (~30 seconds)

---

## 🏗️ Architecture

```
Google Drive API
      │
      ▼
build_drive_index.py  (Python — runs on Render)
  ├─ Phase 1: Fetch all 22K folders  (~2 min)
  ├─ Phase 2: Fetch 530K+ file sizes (~28 min first run, ~30s incremental)
  ├─ Phase 3: Roll up sizes through folder tree
  └─ Phase 4: Write drive_folders.json to disk
      │
      ▼
server.js  (Node.js / Express — always running)
  ├─ After Python finishes: reads drive_folders.json → compresses → saves to Redis
  ├─ On startup: loads drive:folders from Redis → builds in-memory cache
  └─ Serves REST API + React frontend
      │
      ▼
Redis (Upstash)
  ├─ drive:folders     → compressed drive_folders.json (folder tree, ~1 MB)
  └─ drive:size_cache  → compressed size cache (530K file sizes + changes token, ~12 MB)
      │
      ▼
Browser (React + Babel CDN)
  └─ Searchable tree UI, category cards, stats header
```

---

## ⚡ Sync Strategy

### First Run (Full Scan)
The Python indexer performs a complete crawl of all Drive content:

1. Lists all **22,000+ folders** under the root folder
2. Fetches all **530,000+ files** (only `size` + `parents` fields — minimal quota usage)
3. Computes recursive folder sizes (pure Python, no extra API calls)
4. Saves a **changes token** alongside the size cache to Redis

Total time: ~28 minutes. This only happens **once** per Redis instance.

### Subsequent Runs (Incremental — ~30 seconds)
Using the [Drive Changes API](https://developers.google.com/drive/api/guides/manage-changes):

1. Loads the saved **changes token** from Redis
2. Calls `changes.list(token)` — only returns files modified since last run
3. Updates the in-memory size cache for changed files only
4. Saves updated cache + new token back to Redis

This means the 3:00 AM and 2:30 PM IST daily syncs complete in seconds, not minutes.

---

## 🗄️ Redis Persistence

Redis (Upstash) is the **single source of truth** for all indexed data:

| Redis Key | Contents | Size |
|---|---|---|
| `drive:folders` | zlib-compressed JSON of all folder records | ~1 MB |
| `drive:size_cache` | zlib-compressed JSON of 530K file sizes + changes token | ~12 MB |

**Why this matters:** Render's disk is ephemeral — it resets on every deploy. Without Redis, every redeploy would require another 28-minute full scan. With Redis, redeployments load data in milliseconds.

**Command usage:** ~8 Redis commands per day (2 GET + 2 SET per sync × 2 syncs). Well within Upstash's free tier limits.

---

## 🚀 Deployment (Render)

### 1. Fork & Clone
```bash
git clone https://github.com/yourusername/All-Courses.git
cd All-Courses
```

### 2. Set Up Google Drive API
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Google Drive API**
3. Create **OAuth 2.0 credentials** → Download `credentials.json`
4. Run locally once to generate `token.pickle`:
   ```bash
   python build_drive_index.py
   ```
5. Encode the token:
   ```bash
   python -c "import base64; print(base64.b64encode(open('token.pickle','rb').read()).decode())"
   ```
   Save this output — it's your `GOOGLE_TOKEN_B64`.

### 3. Set Up Upstash Redis
1. Go to [upstash.com](https://upstash.com) → Create a Redis database
2. Copy the **Redis URL** (starts with `rediss://`)

### 4. Deploy to Render
1. Create a **Web Service** on Render pointing to your GitHub repo
2. Set **Build Command:** `bash render-build.sh`
3. Set **Start Command:** `node server.js`
4. Add these **Environment Variables:**

| Variable | Description |
|---|---|
| `REDIS_URL` | Your Upstash Redis URL (`rediss://default:...@...upstash.io:6379`) |
| `SYNC_SECRET` | A secret string to protect `/api/sync` and `/api/logs` endpoints |
| `GOOGLE_CREDENTIALS_JSON` | Full contents of your `credentials.json` file (paste as-is) |
| `GOOGLE_TOKEN_B64` | Base64-encoded `token.pickle` (from step 2 above) |

### 5. First Run
After deployment, the server starts with an empty cache. The first auto-sync (at 3:00 AM or 2:30 PM IST) will:
- Run the full 28-minute scan
- Populate Redis
- Every subsequent deploy loads from Redis instantly

To trigger a manual sync immediately:
```
GET https://your-app.onrender.com/api/sync?key=YOUR_SYNC_SECRET
```

---

## 📡 API Reference

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/tree` | None | Full folder tree (served from Redis-backed cache) |
| `GET /api/status` | None | Sync state, last sync time, cache stats |
| `GET /api/health` | None | Uptime + cache loaded status |
| `GET /api/sync?key=SECRET` | SYNC_SECRET | Trigger a manual sync |
| `GET /api/logs?key=SECRET` | SYNC_SECRET | Last 50 sync log entries |
| `GET /api/reload` | None | Reload cache from disk (dev use) |

---

## 🗂️ Project Structure

```
├── server.js              # Express server, Redis client, sync runner, REST API
├── build_drive_index.py   # Google Drive indexer (Python)
├── public/
│   └── index.html         # React frontend (single-page, Babel CDN)
├── package.json
├── render-build.sh        # Render build script (npm install + pip install)
├── drive_folders.json     # Placeholder — real data lives in Redis
└── .gitignore
```

---

## 🛠️ Local Development

```bash
# Install Node dependencies
npm install

# Install Python dependencies
pip install google-api-python-client google-auth-oauthlib tqdm redis

# Run locally (requires credentials.json + token.pickle)
node server.js

# Open http://localhost:3000
```

For local dev, the server falls back to reading `drive_folders.json` from disk if `REDIS_URL` is not set. Run `python build_drive_index.py` once to generate it locally.

---

## 📊 Scale

| Metric | Value |
|---|---|
| Total folders indexed | ~22,500 |
| Total files tracked | ~531,000 |
| Total content size | ~10.3 TB |
| Full scan time | ~28 minutes |
| Incremental sync time | ~30 seconds |
| Redis storage used | ~13 MB (compressed) |
| Daily Redis commands | ~8 |

---

## 🔒 Security Notes

- `credentials.json`, `token.pickle`, and `_token_b64.txt` are in `.gitignore` — never committed
- `drive_folders.json` (real data) is in `.gitignore` — GitHub only has a `[]` placeholder
- The `/api/sync` and `/api/logs` endpoints are protected by `SYNC_SECRET`
- Redis uses TLS (`rediss://`) with the Upstash endpoint

---

## 📅 Sync Schedule

| Time (IST) | UTC | Cron |
|---|---|---|
| 3:00 AM IST | 21:30 UTC (prev day) | `30 21 * * *` |
| 2:30 PM IST | 9:00 UTC | `0 9 * * *` |
