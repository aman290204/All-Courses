# LOADER_BASELINE.md — Vault Reveal Specification

**Source of truth:** `public/index.html` lines 437–599 (CSS) + lines 722–790 (JSX + coordination JS).
**Status:** FROZEN. Per MIGRATION_RULES.md Rule 7 and the Phase 2 prerequisite, the legacy loader is not edited again until the parity branch ships. If a tweak is required, it lands in a later `loader: pacing` PR — never on `public/index.html`.

This document is the deterministic half of the loader spec. The perceptual half lives in `docs/baseline/loader-60fps.mp4`, `loader-slowed.mp4`, and `loader-reduced-motion.mp4`. Phase 2 is "complete" only when the port matches both.

---

## 1. Frame Timeline

Times are measured from `t=0` (the moment `<div class="vault-reveal">` mounts).

| t (ms) | Event | Source |
|---|---|---|
| 0 | Loader mounts; obsidian backdrop + dual radial gradients painted at `opacity:1` | `.vault-reveal` |
| 400 | Sigil emergence begins (1100ms duration) | `vr-sigil-emerge` delay |
| 900 | Ring sweep r1 begins (4.6s loop, infinite) | `.vr-ring` |
| 1100 | "Cortexa" wordmark begins (1200ms duration, letter-spacing 0.55em → -0.018em, blur 8px → 0, opacity 0 → 1) | `.vr-brand .vr-word` |
| 1240 | "Vault" wordmark begins (1200ms, same curve, 140ms after sibling) | `.vr-brand .vr-word.w2` |
| 1400 | Sigil halo loop begins (3.6s sine, infinite) | `.vr-sigil::before` |
| 1500 | Sigil emergence complete (full opacity, blur 0, scale 1) | — |
| 1750 | Tagline fade-up begins (700ms) | `.vr-tagline` |
| 2050 | Hairline divider fade-in begins (600ms) | `.vr-divider` |
| 2150 | Status line 1 "Indexing archive…" appears (560ms) | `.vr-status.s1` |
| 2300 | "Cortexa" wordmark settles to final letter-spacing | — |
| 2440 | "Vault" wordmark settles | — |
| 2450 | Tagline fully revealed | — |
| 2600 | Status line 2 "Restoring knowledge map…" (560ms) | `.vr-status.s2` |
| 2650 | Divider fully revealed | — |
| 2710 | Status line 1 settles | — |
| 2900 | Ring sweep r2 begins (offset second pulse, 4.6s loop) | `.vr-ring.r2` |
| 3100 | Status line 3 "Establishing secure connection…" (560ms) | `.vr-status.s3` |
| 3160 | Status line 2 settles | — |
| 3650 | Status line 4 "Vault ready" (560ms; gold treatment + text-shadow) | `.vr-status.s4` |
| 3660 | Status line 3 settles | — |
| 4210 | Status line 4 settles (gold pulse held) | — |
| 4450 | Creator credit "Crafted by Aman Agrahari" begins (900ms) | `.vr-credit` |
| 4900 | **Minimum cinematic duration reached.** `setMinTimeReached(true)` fires. Dissolve permitted IFF data fetch settled. | `setTimeout(..., 4900)` |
| 4900+ | Once data ready, `exiting=true` → `.is-exiting` class → opacity transition 820ms, `cubic-bezier(0.45,0,0.55,1)` | `.vault-reveal.is-exiting` |
| 5350 | Creator credit settles (if dissolve has not started) | — |
| **5720** | **Earliest possible reveal.** Loader unmounts (4900 + 820 = 5720). Shell visible. | `setTimeout(..., 820)` |

**Reveal rule:** dissolve starts at `max(4900, dataReadyMs)`. If data arrives at 6000ms, dissolve starts at 6000ms and reveal happens at 6820ms.

---

## 2. DOM Structure (exact)

```html
<div class="vault-reveal" role="status" aria-label="Loading Cortexa Vault">
  <span class="vr-ring"></span>
  <span class="vr-ring r2"></span>
  <div class="vr-sigil">
    <img src="/Logo.png" alt="" aria-hidden width="120" height="120" draggable="false"/>
  </div>
  <div class="vr-brand" aria-hidden>
    <span class="vr-word">Cortexa</span>
    <span class="vr-gap"></span>
    <span class="vr-word w2">Vault</span>
  </div>
  <div class="vr-tagline">Curated for Curious Minds</div>
  <div class="vr-divider"></div>
  <div class="vr-status-list" aria-hidden>
    <div class="vr-status s1">Indexing archive…</div>
    <div class="vr-status s2">Restoring knowledge map…</div>
    <div class="vr-status s3">Establishing secure connection…</div>
    <div class="vr-status s4">Vault ready</div>
  </div>
  <div class="vr-credit">Crafted by Aman Agrahari</div>
</div>
```

**Strings (verbatim, do not paraphrase):**
- aria-label: `Loading Cortexa Vault`
- wordmark words: `Cortexa`, `Vault` (with a 0.36em gap span between)
- tagline: `Curated for Curious Minds`
- statuses: `Indexing archive…`, `Restoring knowledge map…`, `Establishing secure connection…`, `Vault ready` (note: real ellipsis character `…`, not three dots)
- credit: `Crafted by Aman Agrahari`

---

## 3. Z-Index Map

| Layer | z-index | Notes |
|---|---|---|
| Body atmosphere (grain `body::before`) | `0` | `mix-blend-mode:overlay`, opacity 0.022 |
| Body atmosphere (lower radials) | `0` | `pointer-events:none`, opacity 0.6 |
| App ambient/atmosphere layers | `0` | All fixed-positioned, non-interactive |
| Shell content (default flow) | `auto` | No explicit z-index |
| Some elevated app element | `2` | (search/active state — context outside loader) |
| **`.vault-reveal`** | **`1000`** | Sits above the entire shell |
| `.vr-ring`, `.vr-sigil`, etc. | `auto` (within loader stacking context) | Loader children stack in DOM order |

**Stacking-context invariant:** the loader root creates its own stacking context (`z-index:1000` + `position:fixed`). All shell ambient effects (atmosphere, grain) live below z-index 1000 and are never visible during the loader window. Phase 2 port must preserve this: nothing in the new shell may declare `z-index >= 1000` except the loader itself.

---

## 4. Timing Constants (canonical → `components/loader/timing.ts`)

Single source of truth. Phase 2 port references these by name; CSS module reads them via CSS custom properties injected at mount. Hardcoded `ms` values inside the loader CSS module are forbidden (enforced by grep gate in PR).

```ts
// components/loader/timing.ts  (Phase 2 — to create)

export const LOADER_TIMING = {
  // Sigil
  SIGIL_EMERGE_DELAY:     400,   // ms — emergence start offset
  SIGIL_EMERGE_DURATION: 1100,
  HALO_DELAY:            1400,
  HALO_DURATION:         3600,   // infinite loop period

  // Ring sweeps (both 4.6s infinite, second offset by 2900ms total)
  RING_DELAY:             900,
  RING_DURATION:         4600,
  RING_R2_DELAY:         2900,

  // Wordmark
  WORDMARK_DELAY:        1100,
  WORDMARK_DURATION:     1200,
  WORDMARK_W2_DELAY:     1240,

  // Tagline
  TAGLINE_DELAY:         1750,
  TAGLINE_DURATION:       700,

  // Divider
  DIVIDER_DELAY:         2050,
  DIVIDER_DURATION:       600,

  // Status lines (uniform duration, staggered start)
  STATUS_DURATION:        560,
  STATUS_S1_DELAY:       2150,
  STATUS_S2_DELAY:       2600,
  STATUS_S3_DELAY:       3100,
  STATUS_S4_DELAY:       3650,

  // Credit
  CREDIT_DELAY:          4450,
  CREDIT_DURATION:        900,

  // Coordination
  MIN_CINEMATIC_TIME:    4900,   // earliest dissolve trigger
  DISSOLVE_DURATION:      820,   // exit fade
} as const;
```

**Total budget:** `MIN_CINEMATIC_TIME + DISSOLVE_DURATION = 5720ms` (best-case reveal).

---

## 5. Keyframes (verbatim)

```css
@keyframes vr-sigil-emerge {
  0%   { opacity:0;   filter:blur(14px) brightness(0.45); transform:scale(0.86); }
  55%  { opacity:0.9; filter:blur(2px)  brightness(0.95); transform:scale(0.97); }
  100% { opacity:1;   filter:blur(0)    brightness(1);    transform:scale(1);    }
}

@keyframes vr-halo {
  0%, 100% { opacity:0.42; transform:scale(0.92); }
  50%      { opacity:0.95; transform:scale(1.08); }
}

@keyframes vr-ring {
  0%   { transform:translate(-50%,-50%) scale(0.5); opacity:0;   }
  18%  {                                            opacity:0.7; }
  100% { transform:translate(-50%,-50%) scale(2.2); opacity:0;   }
}

@keyframes vr-wordmark {
  0%   { opacity:0;    letter-spacing:0.55em;   filter:blur(8px); transform:translateY(2px); }
  55%  { opacity:0.85;                          filter:blur(0);   transform:translateY(0);   }
  100% { opacity:1;    letter-spacing:-0.018em; filter:blur(0);   transform:translateY(0);   }
}

@keyframes vr-fade-up {
  to { opacity:1; transform:translateY(0); }
}

@keyframes vr-fade-in {
  to { opacity:1; }
}

@keyframes vr-status-in {
  from { opacity:0; transform:translateY(3px); filter:blur(4px); }
  to   { opacity:1; transform:translateY(0);   filter:blur(0);   }
}

@keyframes vr-credit-in {
  to { opacity:1; transform:translateX(-50%) translateY(0); }
}
```

**Layout-affecting animations:** `vr-wordmark` mutates `letter-spacing` — this triggers layout on every frame and is the only legitimate use in the product (MIGRATION_RULES.md Rule 30). The new port reproduces it exactly. No new layout-affecting animations may be introduced.

---

## 6. Easing Curves

| Token | Value | Used by |
|---|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | Divider fade-in |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Sigil emerge, ring sweep, wordmark, tagline, status, credit |
| (inline) | `cubic-bezier(0.45, 0, 0.55, 1)` (sine-in-out) | Halo loop, dissolve |

The port preserves these three. The four-easings token system in `tokens.css` (`--ease-standard`, `--ease-entrance`, `--ease-exit`, `--ease-cinematic`) is the **outside-loader** vocabulary. The loader is exempt (Rule 28 / Rule 29) and uses its own three curves by these legacy names — or remaps them via `timing.ts` exports. Either way, the curves themselves are immutable.

---

## 7. Font Dependencies + Load Order

From `public/index.html` lines 11–13 (exact order matters):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500&display=swap">
```

**Fonts used by the loader:**
- Sigil: `/Logo.png` (preloaded at line 9, `fetchpriority="high"`)
- Wordmark: `--font-serif` → Fraunces 600 (with `opsz` variable axis), gradient text fill `linear-gradient(180deg, #f3efe7 0%, #cfc5b3 100%)`
- Tagline: `--font-sans` → Inter 500, uppercase, 0.42em tracking
- Status: `--font-mono` → JetBrains Mono 400, uppercase, 0.34em tracking (0.4em + weight 500 for s4)
- Credit: `--font-sans` → Inter 400, uppercase, 0.44em tracking

**`font-display: swap`** is set — this means Fraunces FOUT is acceptable. Phase 2 port must keep `swap` (not `block`, not `optional`), or wordmark first-paint will desync with timeline.

**Preload optimization (recommended for Phase 2, not Phase 1 freeze):** add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the Fraunces 600 woff2 specifically, so the wordmark animation never blocks on font fetch. Document this in the parity-diff PR; do NOT add it to `public/index.html`.

---

## 8. Reduced-Motion Branch

```css
@media (prefers-reduced-motion: reduce) {
  .vault-reveal,
  .vault-reveal *,
  .tree-children > div,
  .search-wrap.is-active::after {
    animation-duration: 0.001ms !important;
    animation-delay:    0ms     !important;
    transition-duration: 0.001ms !important;
  }
}
```

**Effective behavior under reduced motion:**
- All loader animations resolve to their final keyframe instantly (`animation-fill-mode: forwards` on every element ensures the end-state is what's shown)
- Sigil at full opacity, scale 1, blur 0
- Wordmark at final letter-spacing -0.018em
- All four status lines visible immediately (s4 in gold)
- Credit visible immediately
- `.is-exiting` triggers an instant fade (transition 0.001ms)
- `MIN_CINEMATIC_TIME=4900` still holds — the loader is **still visible for ~4.9s**, just frozen at its final composition

**Phase 2 port discipline:** reduced motion preserves the cinematic *hold* (the user still sees a composed loader for 4.9s) but eliminates motion. Do **not** shorten `MIN_CINEMATIC_TIME` under reduced motion — that would be an "improvement" and is out of scope. The hold itself is part of the brand pacing.

**Open question for Phase 4 / post-migration (NOT for Phase 2):** should `MIN_CINEMATIC_TIME` collapse to ~600ms under reduced motion? Arguable on accessibility grounds. Decision deferred. Phase 2 reproduces current legacy behavior.

---

## 9. Dissolve Coordination (JS state machine)

From `public/index.html` lines 749–790. The state machine has three flags:

```
loading           — fetch('/api/tree') in flight
minTimeReached    — setTimeout fired at 4900ms
exiting           — dissolve class applied
revealed          — loader unmounted, shell visible
```

Transitions:
1. Mount → `loading=true`, `minTimeReached=false`, `exiting=false`, `revealed=false`
2. `setTimeout(4900)` fires → `minTimeReached=true`
3. When `minTimeReached && !loading && !exiting && !revealed` → `exiting=true`
4. `setTimeout(820)` after `exiting=true` → `revealed=true` → loader unmounts

**Invariants Phase 2 must preserve:**
- The 4900ms timer starts at mount, independent of fetch — not at fetch-start, not at fetch-complete
- `exiting` flips at most once (guarded by `!exiting` check)
- `revealed` flips at most once (guarded by `!revealed` check)
- The 820ms unmount timer matches the CSS transition duration *exactly* — drift here causes flash-of-shell-behind-translucent-loader

**Phase 2 implementation note:** this logic moves into `useArchiveData` (the fetch) + a Zustand selector or local state inside `VaultReveal` (the coordination). The 4900 and 820 constants come from `LOADER_TIMING`, not duplicated.

---

## 10. Recording Conditions Checklist

When capturing `docs/baseline/loader-60fps.mp4`:

- [ ] Chrome (or Edge), latest stable, **freshly opened tab**
- [ ] Hardware acceleration ON (`chrome://settings/system` → "Use hardware acceleration when available")
- [ ] **DevTools closed** — open DevTools modifies compositor timing
- [ ] No browser zoom (`Ctrl+0` to reset)
- [ ] Display at native refresh rate (verify 60Hz minimum in OS display settings)
- [ ] No other GPU-heavy applications running (close Discord, OBS preview, video players)
- [ ] Screen recorder at 60fps (OBS Studio, ShareX, or Windows Game Bar `Win+Alt+R`)
- [ ] Record from page load (Ctrl+F5 hard reload) through full loader → first frame of shell
- [ ] Capture twice: once at 1× speed, once exported at 0.25× speed for frame inspection
- [ ] Save with H.264 or VP9 codec (avoid recording-time CFR drops)

**For `loader-reduced-motion.mp4`:**
- Windows: Settings → Accessibility → Visual effects → Animation effects OFF
- macOS: System Settings → Accessibility → Display → Reduce motion ON
- Verify `window.matchMedia('(prefers-reduced-motion: reduce)').matches === true` in console (close console before recording)

Once captured, drop the files into `docs/baseline/` and commit with `git lfs` (large file storage) if size > 50MB. Otherwise plain git is fine.

---

## 11. Freeze Policy (formal)

Effective immediately and until the Phase 2 parity branch merges:

- `public/index.html` is **immutable** for any reason related to the loader (Rule 7 + this addendum)
- "Tiny tweaks" to durations, easings, font sizes, opacity values, or copy are **NOT allowed** — even one-character changes
- If a defect is discovered in the legacy loader during baseline capture, document it in this file under §12 "Known Legacy Quirks (preserve)" and reproduce it faithfully in the port
- Improvements only ship in a separate PR labeled `loader: pacing`, opened after Phase 2 merges and only after parity is independently verified

Violations of this policy invalidate Phase 2's parity claim — because the reference target moved during the port.

---

## 12. Known Legacy Quirks (preserve verbatim)

(Empty until baseline recordings reveal something. Populate during capture, not by reasoning about the code.)

Examples of things that *might* show up:
- A subtle font-swap flash at ~250ms during cold load
- A 1-pixel jump in the wordmark at the letter-spacing landing frame
- The halo opacity peak (0.95) being slightly visible behind the sigil at t≈3200ms
- Ring r1 and r2 briefly overlapping during the 2900–4500ms window

If any of these (or others) appear in the recordings, document them here as "preserve" — they're part of the spec. If they're clearly bugs, document them as "preserve, fix in post-migration loader: pacing PR".

---

## 13. Parity Acceptance Criteria for Phase 2

The Phase 2 PR may not merge unless **all** are satisfied:

1. **Timeline match (±20ms):** every row in §1 reproduced. Verified by frame-stepping the new build's recording against the baseline.
2. **DOM match:** §2 structure reproduced; class names may change (e.g., `styles.vaultReveal` from CSS modules) but the element tree, ordering, and ARIA attributes are identical.
3. **Z-index invariant:** §3 stacking preserved. Loader is the only thing at z-index 1000.
4. **Single timing source:** `components/loader/timing.ts` is the only file containing loader timing literals. `grep -E "[0-9]+ms" client/src/components/loader/*.module.css` returns zero matches.
5. **Keyframe match:** §5 keyframes reproduced verbatim (values byte-identical).
6. **Easing match:** §6 curves reproduced verbatim.
7. **Reduced-motion match:** §8 behavior reproduced. Recording confirms cinematic hold is preserved.
8. **Coordination match:** §9 state machine reproduced. The 4900ms timer fires from mount, dissolve is 820ms, both constants live in `LOADER_TIMING`.
9. **No regressions:** `tsc --noEmit` clean, no new console warnings, Lighthouse perf score not lower than Phase 1 baseline.
10. **Visual diff attached:** side-by-side video of legacy `:3000` and new `:5173` (or `:3000` with `USE_VITE_BUILD=true`) embedded in the PR description.

Anything not pixel/timing-equivalent is investigated, not rationalized. If the new build differs intentionally (e.g., the recommended Fraunces preload optimization), §12 of the PR explicitly enumerates the diff.

---

**End of baseline.**
