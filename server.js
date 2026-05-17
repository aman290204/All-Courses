/**
 * server.js — Course Library API + Static Server
 * Sync engine: Python build_drive_index.py (no rclone)
 * Schedule: 3:00 AM IST + 2:30 PM IST daily
 */

const express     = require("express");
const path        = require("path");
const fs          = require("fs");
const { spawn }   = require("child_process");
const compression = require("compression");
const cron        = require("node-cron");

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "200mb" }));

const DATA_FILE  = path.join(__dirname, "drive_folders.json");
const STATE_FILE = path.join(__dirname, ".sync-state.json");
const PYTHON_BIN = process.platform === "win32" ? "python" : "python3";
const SYNC_SECRET = process.env.SYNC_SECRET || "localdev-changeme";

// ─── Category metadata ────────────────────────────────────────────────────────
const CAT_META = {
  "01": { name:"Finance & Investing",          shortName:"Finance",        hue:"#b8943f" },
  "02": { name:"Accounting CA & Tax",          shortName:"Accounting",     hue:"#4f9e7a" },
  "03": { name:"AI & Machine Learning",        shortName:"AI / ML",        hue:"#6c60d9" },
  "04": { name:"Data Science & Analytics",     shortName:"Data Science",   hue:"#3b8fd4" },
  "05": { name:"Programming & Dev",            shortName:"Programming",    hue:"#8756d4" },
  "06": { name:"Cybersecurity & Hacking",      shortName:"Cybersecurity",  hue:"#c94f4f" },
  "07": { name:"Design & UI/UX",               shortName:"Design",         hue:"#c0517a" },
  "08": { name:"Digital Marketing & SEO",      shortName:"Marketing",      hue:"#c87230" },
  "09": { name:"Business Analysis",            shortName:"Business",       hue:"#3a9e9e" },
  "10": { name:"Competitive Exams",            shortName:"Competitive",    hue:"#b8a03f" },
  "11": { name:"Pharmacy & Health Sciences",   shortName:"Pharmacy",       hue:"#4aa864" },
  "12": { name:"Communication & Productivity", shortName:"Communication",  hue:"#8a68d4" },
  "13": { name:"Office Tools & PowerBI",       shortName:"Office Tools",   hue:"#3a6fd4" },
  "14": { name:"Trading & Quant Finance",      shortName:"Trading",        hue:"#c44f6a" },
  "15": { name:"Certifications",               shortName:"Certifications", hue:"#6aa83a" },
  "16": { name:"Government Exams",             shortName:"Govt Exams",     hue:"#c46e30" },
  "17": { name:"Miscellaneous Courses",        shortName:"Miscellaneous",  hue:"#7a8aaa" },
};

// ─── Hidden folders ───────────────────────────────────────────────────────────
const HIDDEN_PATHS = new Set(["ZJav"]);
function isHidden(node) {
  const name = node.name?.toLowerCase();
  const p    = node.path?.toLowerCase();
  for (const entry of HIDDEN_PATHS) {
    const e = entry.toLowerCase();
    if (name === e) return true;
    if (p    === e) return true;
    if (p?.endsWith("/" + e)) return true;
  }
  return false;
}

// ─── Sync state ───────────────────────────────────────────────────────────────
let syncState = {
  lastSyncTime:   null,
  lastSyncStatus: "never",
  isSyncing:      false,
};

// ─── Sync log (circular, 100 entries) ────────────────────────────────────────
const SYNC_LOG = [];
function logEntry(type, msg) {
  const e = { time: new Date().toISOString(), timeIST: new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}), type, msg };
  SYNC_LOG.push(e);
  if (SYNC_LOG.length > 100) SYNC_LOG.shift();
  console.log(`[${type}] ${msg}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file);
  if (raw[0]===0xFF && raw[1]===0xFE) return JSON.parse(raw.slice(2).toString("utf16le"));
  if (raw[0]===0xEF && raw[1]===0xBB && raw[2]===0xBF) return JSON.parse(raw.slice(3).toString("utf8"));
  return JSON.parse(raw.toString("utf8"));
}
function writeJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function bytesToGB(b) { return b / (1024**3); }
function fmtSize(gb) {
  if (!gb || gb === 0) return "—";
  if (gb >= 1024) return (gb/1024).toFixed(2) + " TB";
  if (gb >= 1)    return gb.toFixed(1) + " GB";
  return (gb*1024).toFixed(0) + " MB";
}
function cleanName(name) {
  return name
    .replace(/\s*\(~?[\d.]+\s*(gb|tb|mb|kb)\)/gi, "")
    .replace(/\s*~[\d.]+\s*(gb|tb|mb|kb)/gi, "")
    .trim();
}

// ─── Tree builder ─────────────────────────────────────────────────────────────
function buildTree(records) {
  const root   = {};
  const sorted = [...records].sort((a,b) => a.Path.split("/").length - b.Path.split("/").length);
  for (const rec of sorted) {
    const parts = rec.Path.split("/");
    if (parts.length === 1) {
      root[rec.Path] = {
        id: rec.ID, name: rec.Name, path: rec.Path,
        children: {}, folderCount: 0,
        sizeBytes: rec.Size || 0,   // real bytes from Python
      };
    } else {
      let node = root[parts[0]];
      if (!node) continue;
      for (let i = 1; i < parts.length - 1; i++) {
        const seg = parts.slice(0, i+1).join("/");
        if (!node.children[seg])
          node.children[seg] = { id:"", name:parts[i], path:seg, children:{}, folderCount:0, sizeBytes:0 };
        node = node.children[seg];
      }
      const key = rec.Path;
      if (!node.children[key]) {
        node.children[key] = { id:rec.ID, name:rec.Name, path:rec.Path, children:{}, folderCount:0, sizeBytes:rec.Size||0 };
      } else {
        node.children[key].id   = rec.ID;
        node.children[key].name = rec.Name;
        node.children[key].sizeBytes = rec.Size || 0;
      }
    }
  }
  return root;
}

function countFolders(node) {
  let n = 1;
  for (const child of Object.values(node.children)) n += countFolders(child);
  node.folderCount = n - 1;
  return n;
}

function serializeNode(node) {
  if (isHidden(node)) return null;
  const children = Object.values(node.children)
    .sort((a,b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map(serializeNode)
    .filter(Boolean);
  return { name: cleanName(node.name), id: node.id, path: node.path,
           children: children.length ? children : undefined };
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let CACHE = null;
function buildCache() {
  console.log("[cache] Reading drive_folders.json…");
  const t0 = Date.now();
  let records;
  try { records = readJsonFile(DATA_FILE); } catch(e) {
    console.error("[cache] Read error:", e.message); return null;
  }
  if (!records?.length) { console.error("[cache] Empty"); return null; }

  const tree = buildTree(records);
  const categories = [];
  let totalFolders = 0, totalSizeGB = 0;

  const sortedKeys = Object.keys(tree).sort((a,b) => {
    const na = parseInt(a.match(/^(\d+)/)?.[1] || "99");
    const nb = parseInt(b.match(/^(\d+)/)?.[1] || "99");
    return na - nb;
  });

  for (const key of sortedKeys) {
    const node   = tree[key];
    const prefix = key.match(/^(\d+)/)?.[1]?.padStart(2,"0") || "00";
    const meta   = CAT_META[prefix] || { name:key, shortName:key, hue:"#7a8aaa" };
    countFolders(node);
    totalFolders += node.folderCount;
    const sizeGB  = bytesToGB(node.sizeBytes || 0);
    totalSizeGB  += sizeGB;

    categories.push({
      id:        prefix,
      slug:      meta.shortName.toLowerCase().replace(/[^a-z0-9]+/g,"-"),
      name:      meta.name,
      shortName: meta.shortName,
      hue:       meta.hue,
      count:     node.folderCount,
      sizeGB,
      size:      fmtSize(sizeGB),
      driveId:   node.id,
      children:  Object.values(node.children)
                   .sort((a,b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                   .map(serializeNode)
                   .filter(Boolean),
    });
  }

  // Read file count from size cache if available
  let fileCount = null;
  try {
    const sc = readJsonFile(path.join(__dirname, ".size_cache.json"));
    if (sc?.count) fileCount = sc.count;
  } catch(_) {}

  const result = {
    categories,
    stats: {
      totalFolders, totalCategories: categories.length,
      totalSizeGB,  totalSize: fmtSize(totalSizeGB),
      lastUpdated:  new Date().toISOString(),
      recordCount:  records.length,
      fileCount,
    },
  };
  console.log(`[cache] Built in ${Date.now()-t0}ms — ${records.length} records, ${totalFolders} folders`);
  return result;
}

// ─── Python sync runner ───────────────────────────────────────────────────────
function runPythonSync() {
  return new Promise((resolve) => {
    if (syncState.isSyncing) {
      logEntry("sync", "Already running — skipped");
      return resolve({ ok: false, reason: "already_running" });
    }
    syncState.isSyncing = true;
    const started = new Date().toISOString();
    logEntry("sync", `Starting build_drive_index.py — ${started}`);

    const py = spawn(PYTHON_BIN, ["build_drive_index.py"], {
      cwd: __dirname,
      env: process.env,
    });

    const lines = [];
    py.stdout.on("data", d => {
      const txt = d.toString().trim();
      if (txt) { lines.push(txt); process.stdout.write("[py] " + txt + "\n"); }
    });
    py.stderr.on("data", d => {
      const txt = d.toString().trim();
      if (txt) { lines.push("[err] " + txt); process.stderr.write("[py-err] " + txt + "\n"); }
    });

    py.on("close", code => {
      const elapsed = Math.round((Date.now() - new Date(started).getTime()) / 1000);
      syncState.isSyncing = false;
      if (code === 0) {
        syncState.lastSyncTime   = new Date().toISOString();
        syncState.lastSyncStatus = `ok — ${elapsed}s`;
        logEntry("sync", `Python completed in ${elapsed}s — rebuilding cache`);
        CACHE = buildCache();
        resolve({ ok: true, elapsed, lines: lines.slice(-20) });
      } else {
        syncState.lastSyncStatus = `error (exit ${code})`;
        logEntry("sync", `Python exited with code ${code}`);
        resolve({ ok: false, code, lines: lines.slice(-20) });
      }
    });

    py.on("error", err => {
      syncState.isSyncing      = false;
      syncState.lastSyncStatus = `spawn error: ${err.message}`;
      logEntry("sync", `Spawn error: ${err.message}`);
      resolve({ ok: false, reason: err.message });
    });
  });
}

// ─── Schedule (IST = UTC+5:30) ────────────────────────────────────────────────
// 3:00 AM IST  = 21:30 UTC prev day
// 2:30 PM IST  = 09:00 UTC
cron.schedule("30 21 * * *", () => {
  logEntry("cron", "⏰ 3:00 AM IST — daily sync");
  runPythonSync();
}, { timezone: "UTC" });

cron.schedule("0 9 * * *", () => {
  logEntry("cron", "⏰ 2:30 PM IST — daily sync");
  runPythonSync();
}, { timezone: "UTC" });

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/tree", (req, res) => {
  if (!CACHE) return res.status(503).json({ error: "Data not loaded yet" });
  res.json(CACHE);
});

app.get("/api/sync", async (req, res) => {
  const key = req.query.key || (req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if (!key || key !== SYNC_SECRET)
    return res.status(401).json({ error: "Unauthorized" });
  const result = await runPythonSync();
  res.json(result);
});

app.get("/api/logs", (req, res) => {
  const key = req.query.key || (req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if (!key || key !== SYNC_SECRET)
    return res.status(401).json({ error: "Unauthorized" });
  const limit = Math.min(parseInt(req.query.limit)||50, 100);
  res.json({ total: SYNC_LOG.length, entries: SYNC_LOG.slice(-limit).reverse() });
});

app.get("/api/reload", (req, res) => {
  CACHE = buildCache();
  if (!CACHE) return res.status(500).json({ error: "Reload failed" });
  res.json({ ok: true, stats: CACHE.stats });
});

app.get("/api/status", (req, res) => {
  res.json({ ...syncState, cacheLoaded: !!CACHE, stats: CACHE?.stats || null });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()), cacheLoaded: !!CACHE });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Startup ──────────────────────────────────────────────────────────────────
CACHE = buildCache();
app.listen(PORT, () => {
  console.log(`\n[server] http://localhost:${PORT}`);
  console.log("[server] Sync engine: Python (build_drive_index.py)");
  console.log("[server] Schedule: 3:00 AM IST + 2:30 PM IST daily");
});
