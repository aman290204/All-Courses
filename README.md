# Cortexa Vault

A personal knowledge archive — 17 categories, 22,500+ Google Drive folders, 10+ TB of content served as a fast, searchable, keyboard-accessible web app.

**Live:** [all-courses.onrender.com](https://all-courses.onrender.com)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript + Zustand |
| Server | Node.js / Express |
| Indexer | Python (Google Drive API) |
| Cache | Upstash Redis (zlib-compressed, ~13 MB) |
| Deployment | Render (web service) |

---

## Architecture

```
Google Drive API
      │
      ▼
build_drive_index.py          ← Python, runs on Render
  ├─ Fetch all 22K+ folders
  ├─ Fetch 530K+ file sizes (incremental via Changes API after first run)
  ├─ Roll up recursive folder sizes
  └─ Write drive_folders.json
      │
      ▼
server.js                     ← Node.js / Express, always running
  ├─ Reads drive_folders.json → compresses → saves to Redis
  ├─ On startup: loads from Redis → in-memory cache
  ├─ Serves /api/tree, /api/status, /api/health, /api/sync
  └─ Serves Vite-built frontend (client/dist/)
      │
      ▼
Redis (Upstash)
  ├─ drive:folders     → compressed folder tree (~1 MB)
  └─ drive:size_cache  → compressed file sizes + changes token (~12 MB)
      │
      ▼
Browser — Cortexa Vault UI
  ├─ Cinematic loader → vault reveal
  ├─ 17 category cards with folder counts and sizes
  ├─ Expandable folder tree with recursive size display
  ├─ Full-text search with instant filter
  ├─ Archive memory (last visited category + expanded state, persisted)
  └─ Keyboard navigation (arrow keys, Enter, Escape, Tab)
```

### Frontend structure (`client/src/`)

```
App.tsx               ← mount loader, mount Shell, route reveal
components/
  archive/            ← FolderRow, CategoryCard, tree rendering
  loader/             ← VaultReveal cinematic state machine
  shell/              ← Shell, Header, Footer, Drawer, FocusModeToggle
  shared/             ← AmbientLayer, SyncPill, EmptyResults, CatBlock
hooks/
  useArchiveData.ts   ← fetch /api/tree + /api/sync-info
  useFlatTree.ts      ← derive FlatNode[] from raw tree
stores/
  uiStore.ts          ← query, focusedId, forceOpen, drawerOpen (ephemeral)
  dataStore.ts        ← tree, syncInfo, loading, error (server snapshot)
  memoryStore.ts      ← activeCategoryId, expanded map (persisted, LRU-200)
```

---

## Sync Strategy

**First run (~28 min):** Full crawl of all Drive content. Saves a changes token alongside the size cache to Redis. Only happens once per Redis instance.

**Subsequent runs (~30 sec):** Loads the saved token → calls `changes.list(token)` → updates only changed files → saves new token. Runs at 3:00 AM and 2:30 PM IST daily.

---

## Local Development

```bash
# Server
npm install
node server.js          # http://localhost:3000

# Frontend (hot-reload dev server)
cd client
npm install
npm run dev             # http://localhost:5173

# TypeScript check
cd client
npm run typecheck
```

The server falls back to reading `drive_folders.json` from disk if `REDIS_URL` is not set. Run `python build_drive_index.py` once locally to generate it.

---

## Build

```bash
cd client
npm run build           # tsc --noEmit && vite build → client/dist/
```

The Express server serves `client/dist/` in production. Render builds this automatically via `render-build.sh`.

---

## Deployment (Render)

1. Fork & connect repo as a **Web Service**
2. **Build command:** `bash render-build.sh`
3. **Start command:** `node server.js`
4. Set environment variables:

| Variable | Description |
|---|---|
| `REDIS_URL` | Upstash Redis URL (`rediss://...`) |
| `SYNC_SECRET` | Protects `/api/sync` and `/api/logs` |
| `GOOGLE_CREDENTIALS_JSON` | Full contents of `credentials.json` |
| `GOOGLE_TOKEN_B64` | Base64-encoded `token.pickle` |

---

## API

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/tree` | — | Full folder tree from Redis-backed cache |
| `GET /api/status` | — | Sync state, last sync time, cache stats |
| `GET /api/health` | — | Uptime + cache loaded status |
| `GET /api/sync?key=SECRET` | SYNC_SECRET | Trigger manual sync |
| `GET /api/logs?key=SECRET` | SYNC_SECRET | Last 50 sync log entries |

---

## Scale

| Metric | Value |
|---|---|
| Folders indexed | ~22,500 |
| Files tracked | ~531,000 |
| Content size | ~10.3 TB |
| Full scan | ~28 min |
| Incremental sync | ~30 sec |
| Redis storage | ~13 MB compressed |

---

## Security

- `credentials.json`, `token.pickle`, `_token_b64.txt` — gitignored, never committed
- `drive_folders.json` — gitignored; GitHub has only a `[]` placeholder
- `/api/sync` and `/api/logs` — protected by `SYNC_SECRET`
- Redis — TLS (`rediss://`)
