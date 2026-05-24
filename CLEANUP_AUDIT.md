# Cortexa Vault — Cleanup Audit
**Date:** 2026-05-24  
**Auditor:** Aman Agrahari  
**Status:** Phases 1–8 complete, architecture stable, migration complete.

---

## 1. Tracked Tooling Artifacts (Remove from Git)

These files are tracked in git but are ephemeral tooling state — session snapshots, screenshots, perf traces. They should be untracked and gitignored.

| File | Reason |
|---|---|
| `.omc/phase4/PHASE_4_PARITY_REPORT.md` | Tooling parity report — historical, not source |
| `.omc/phase4/desktop-1480-error.png` | Screenshot artifact |
| `.omc/phase4/desktop-1480-snapshot.txt` | Accessibility snapshot artifact |
| `.omc/phase4/desktop-1480.png` | Screenshot artifact |
| `.omc/phase4/mobile-375-snapshot.txt` | Accessibility snapshot artifact |
| `.omc/phase4/mobile-375.png` | Screenshot artifact |
| `.omc/phase4/perf-trace-load.json` | Performance trace artifact |
| `.omc/phase4/perf-trace-search.json` | Performance trace artifact |
| `.omc/project-memory.json` | Tooling session memory — gitignored since last commit but still tracked |
| `.omc/sessions/103d227f-...json` | Session JSON |
| `.omc/sessions/64ab752a-...json` | Session JSON |
| `.omc/sessions/9bd5f060-...json` | Session JSON |
| `.omc/state/checkpoints/checkpoint-2026-05-23T04-38-08-733Z.json` | State checkpoint |

**Action:** `git rm --cached` all 13 files. Update `.gitignore` to cover `.omc/` entirely.

---

## 2. .gitignore Gaps

Current `.gitignore` is partial on `.omc/`. Also missing standard entries.

| Missing Entry | Why |
|---|---|
| `.omc/` (entire directory) | Current rules only cover subpaths; simpler to ignore the whole dir |
| `client/.vite/` | Vite cache directory |
| `.DS_Store` | macOS OS junk |
| `Thumbs.db` | Windows OS junk |
| `desktop.ini` | Windows OS junk |
| `*.local` | `.env.local`, `vite.config.local.ts` etc. |
| `npm-debug.log*` | npm debug logs |
| `client/node_modules/` — already present ✅ | — |
| `client/dist/` — already present ✅ | — |

---

## 3. Stale Branches

| Branch | Status |
|---|---|
| `migration/vite-react` (local + remote) | Merged via PR #2 (`bde4346`). Safe to delete. |

---

## 4. Dead Client Code

| File | Finding |
|---|---|
| `client/src/utils/hash.ts` | Zero imports anywhere in `client/src/`. Rule 22 (synthetic node IDs) is implemented server-side. Dead. |
| `client/src/hooks/useReducedMotion.ts` | Defined but never imported. Reduced-motion is handled entirely by `tokens.css` `@media` rule. Dead. |
| `vite-imagetools` devDependency | Only reference is a `/// <reference types="vite-imagetools" />` in `vite-env.d.ts` — no component uses image imports with `?as=`. Safe to remove package + type ref. |

---

## 5. Documentation Clutter (Root)

Root has 5 governance/spec docs that belong in `docs/`. Only `render.md` and `README.md` are reasonable at root level.

| File | Action |
|---|---|
| `ARCHIVE_MEMORY_PLAN.md` | Move → `docs/archive/ARCHIVE_MEMORY_PLAN.md` (Phase 5 planning, work done) |
| `LOADER_BASELINE.md` | Move → `docs/LOADER_BASELINE.md` (spec doc, still reference-worthy) |
| `ARCHITECTURE_NOTES.md` | Move → `docs/ARCHITECTURE_NOTES.md` (Phase 3 contract, still reference-worthy) |
| `MIGRATION_RULES.md` | Move → `docs/MIGRATION_RULES.md` (governance, still active) |
| `docs/baseline/.gitkeep` | Remove — empty placeholder, referenced videos never committed |

---

## 6. README — Completely Outdated

`README.md` describes the pre-migration Babel CDN frontend with no mention of:
- Cortexa Vault branding
- Vite + React 18 + TypeScript + Zustand stack
- Archive memory, search, keyboard accessibility
- Local dev for client/
- Phase structure

**Action:** Full rewrite.

---

## 7. vercel.json — Possibly Stale

Routes frontend to `public/$1` (legacy Babel app). Live deployment is on Render, not Vercel. `vercel.json` may be unused. **No change** — deployment config requires explicit owner decision. Flagged only.

---

## 8. Dependencies — Clean

Root `package.json`: express, compression, node-cron, ioredis — all actively used by server.js. No unused deps.

`client/package.json`: react, react-dom, zustand — all used. Dev deps clean except `vite-imagetools` (see §4). No vulnerabilities noted from package versions.

---

## Execution Plan (ordered safest → riskier)

| Pass | Action | Risk |
|---|---|---|
| 1 | `.gitignore` — add missing entries + cover `.omc/` | None |
| 2 | `git rm --cached` all 13 tracked tooling artifacts | None (files stay on disk) |
| 3 | Delete stale `migration/vite-react` branch | Low (already merged) |
| 4 | Remove `hash.ts` + `useReducedMotion.ts` (dead code) | Low — verify build clean after |
| 5 | Remove `vite-imagetools` dep + type ref | Low — verify build clean after |
| 6 | Move docs to `docs/` + `docs/archive/` | Low — no code imports these |
| 7 | Remove `docs/baseline/.gitkeep` | None |
| 8 | Rewrite `README.md` | None |
| 9 | Build verification | — |
