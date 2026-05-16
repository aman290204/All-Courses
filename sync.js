#!/usr/bin/env node
/**
 * sync.js — Incremental Google Drive metadata updater
 *
 * Instead of doing a full rclone scan every time (slow, burns API quota),
 * this script does a targeted refresh:
 *   1. Finds folders modified since last sync (using ModTime in drive_folders.json)
 *   2. Runs rclone lsjson ONLY on those changed top-level categories
 *   3. Merges the result back into drive_folders.json (UTF-8, no BOM)
 *
 * Usage:
 *   node sync.js                  # incremental (only changed since last run)
 *   node sync.js --full           # full rescan of all categories
 *   node sync.js --cat "03 AI Machine Learning"  # rescan one category
 *   node sync.js --since 24h      # rescan folders modified in last 24h
 *
 * After running, hit: GET http://localhost:3000/api/reload
 */

const { execFileSync, spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────
const RCLONE_EXE  = path.join(__dirname, "rclone-v1.73.1-windows-amd64", "rclone.exe");
const REMOTE      = "Google Drive";        // your rclone remote name (from rclone listremotes)
const DATA_FILE   = path.join(__dirname, "drive_folders.json");
const STATE_FILE  = path.join(__dirname, ".sync-state.json"); // tracks last sync time per category
const REMOTE_ROOT = "";                    // subfolder on drive e.g. "Courses/" — leave empty for root

// ─── Parse args ───────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const FULL      = args.includes("--full");
const CAT_ARG   = args[args.indexOf("--cat") + 1];
const SINCE_ARG = args[args.indexOf("--since") + 1]; // e.g. "24h", "7d"

// ─── Read existing data ───────────────────────────────────────────────────────
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file);
  if (raw[0] === 0xFF && raw[1] === 0xFE) return JSON.parse(raw.slice(2).toString("utf16le"));
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) return JSON.parse(raw.slice(3).toString("utf8"));
  return JSON.parse(raw.toString("utf8"));
}

function writeJson(file, data) {
  // Always write UTF-8 without BOM so Node server reads cleanly
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ─── rclone lsjson wrapper ────────────────────────────────────────────────────
function rcloneLsjson(remotePath) {
  const remote = `${REMOTE}:${REMOTE_ROOT}${remotePath}`;
  console.log(`  [rclone] Scanning: ${remote}`);

  const result = spawnSync(RCLONE_EXE, [
    "lsjson",
    remote,
    "--recursive",
    "--dirs-only",       // only directories — skips files, much faster
    "--fast-list",       // uses fewer API calls with Drive batching
    "--no-modtime",      // skip per-file modtime fetch (we only need structure)
    "--drive-acknowledge-abuse",
  ], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });

  if (result.error) throw new Error(`rclone spawn error: ${result.error.message}`);
  if (result.status !== 0) {
    console.warn(`  [rclone] Warning (exit ${result.status}): ${result.stderr?.slice(0, 200)}`);
    return [];
  }

  let items;
  try {
    items = JSON.parse(result.stdout || "[]");
  } catch (e) {
    console.warn(`  [rclone] Failed to parse JSON: ${e.message}`);
    return [];
  }

  // Prefix paths with the category root so they match drive_folders.json format
  return items.map(item => ({
    ...item,
    Path: remotePath ? `${remotePath}/${item.Path}` : item.Path,
  }));
}

// ─── Get top-level categories from drive ─────────────────────────────────────
function getRootCategories() {
  console.log("[sync] Fetching top-level categories from Drive…");
  const result = spawnSync(RCLONE_EXE, [
    "lsjson",
    `${REMOTE}:${REMOTE_ROOT}`,
    "--dirs-only",
    "--max-depth", "1",
    "--fast-list",
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

  if (result.status !== 0 || result.error) {
    throw new Error(`Failed to list root: ${result.stderr || result.error}`);
  }
  return JSON.parse(result.stdout || "[]");
}

// ─── Main sync logic ──────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();

  // Load existing data
  let existing = readJson(DATA_FILE) || [];
  const state  = readJson(STATE_FILE) || {};

  console.log(`[sync] Existing records: ${existing.length}`);

  // Build lookup: path → record
  const byPath = {};
  for (const r of existing) byPath[r.Path] = r;

  // ── Determine which top-level categories to rescan ─────────────────────────
  let rootCats;
  try {
    rootCats = getRootCategories();
  } catch (e) {
    console.error("[sync] Cannot reach Google Drive:", e.message);
    console.error("[sync] Make sure rclone is authenticated: run rclone config");
    process.exit(1);
  }

  let catsToScan;

  if (CAT_ARG) {
    // Single category override
    const found = rootCats.find(c => c.Name === CAT_ARG || c.Path === CAT_ARG);
    if (!found) { console.error(`[sync] Category not found: "${CAT_ARG}"`); process.exit(1); }
    catsToScan = [found];
    console.log(`[sync] Mode: single category — "${CAT_ARG}"`);
  } else if (FULL) {
    catsToScan = rootCats;
    console.log(`[sync] Mode: full rescan — ${catsToScan.length} categories`);
  } else {
    // Incremental: only rescan categories whose Drive ModTime is newer than last sync
    catsToScan = rootCats.filter(cat => {
      const lastSync = state[cat.Path];
      if (!lastSync) return true; // never synced
      const driveModTime = new Date(cat.ModTime).getTime();
      const lastSyncTime = new Date(lastSync).getTime();
      return driveModTime > lastSyncTime;
    });

    if (SINCE_ARG) {
      // Also force-include everything modified within --since window
      const ms = parseDuration(SINCE_ARG);
      const cutoff = Date.now() - ms;
      const extra = rootCats.filter(cat => {
        if (catsToScan.includes(cat)) return false;
        return new Date(cat.ModTime).getTime() > cutoff;
      });
      catsToScan = [...catsToScan, ...extra];
      console.log(`[sync] Mode: incremental + --since ${SINCE_ARG} — ${catsToScan.length} categories to update`);
    } else {
      console.log(`[sync] Mode: incremental — ${catsToScan.length} / ${rootCats.length} categories changed`);
    }
  }

  if (catsToScan.length === 0) {
    console.log("[sync] Nothing changed since last sync. Use --full to force rescan.");
    return;
  }

  // ── Scan each changed category ─────────────────────────────────────────────
  let updatedCount = 0;
  const syncTime = new Date().toISOString();

  for (const cat of catsToScan) {
    console.log(`\n[sync] → ${cat.Path}`);

    // Update the category root record
    byPath[cat.Path] = {
      Path:     cat.Path,
      Name:     cat.Name,
      Size:     cat.Size || 0,
      MimeType: "inode/directory",
      ModTime:  cat.ModTime,
      IsDir:    true,
      ID:       cat.ID || byPath[cat.Path]?.ID || "",
    };

    // Remove all existing records under this category
    const prefix = cat.Path + "/";
    for (const key of Object.keys(byPath)) {
      if (key.startsWith(prefix)) delete byPath[key];
    }

    // Rescan
    const items = rcloneLsjson(cat.Path);
    for (const item of items) {
      byPath[item.Path] = {
        Path:     item.Path,
        Name:     item.Name,
        Size:     item.Size || 0,
        MimeType: "inode/directory",
        ModTime:  item.ModTime || syncTime,
        IsDir:    true,
        ID:       item.ID || "",
      };
    }

    console.log(`  → ${items.length} folders found`);
    state[cat.Path] = syncTime;
    updatedCount++;
  }

  // ── Write results ──────────────────────────────────────────────────────────
  const newRecords = Object.values(byPath);
  writeJson(DATA_FILE, newRecords);
  writeJson(STATE_FILE, state);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[sync] Done in ${elapsed}s`);
  console.log(`[sync] Total records: ${newRecords.length} (was ${existing.length})`);
  console.log(`[sync] Categories refreshed: ${updatedCount}`);
  console.log(`[sync] → Now reload the server: GET http://localhost:3000/api/reload`);
}

function parseDuration(s) {
  const m = s.match(/^(\d+)(h|d|w)$/i);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = parseInt(m[1]);
  const u = m[2].toLowerCase();
  if (u === "h") return n * 3600 * 1000;
  if (u === "d") return n * 86400 * 1000;
  if (u === "w") return n * 7 * 86400 * 1000;
  return 86400 * 1000;
}

main().catch(e => { console.error("[sync] Fatal:", e.message); process.exit(1); });
