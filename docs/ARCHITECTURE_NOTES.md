# Cortexa Vault — Architecture Notes

**Purpose.** This document is a contract, not a description. It governs Phase 3 and Phase 4 of the Vite migration by fixing ownership boundaries that the legacy monolith never declared. Every Phase 3 component lands inside one of these boundaries; any deviation requires a rule-exception note in the PR per `MIGRATION_RULES.md` §Exceptions.

It exists because the legacy `App()` (`public/index.html:746–1180`) is a 13-`useState` monolith that fetches data, owns the cinematic loader state machine, computes derived view data, drives focus, mutates `document.body` for atmosphere, and triggers scrolls. Phase 3 must not reproduce that shape. The rules below are the structural counter-spec.

Phase 2 is locked (`feedback_lock_stable_subsystems.md`). Phase 3 begins by writing components against these contracts, not by reading the legacy file for "structure."

---

## 1. Render Ownership

The legacy app conflates four concerns in one component: **fetch**, **cinematic transition**, **layout composition**, **derived view state**. Phase 3 splits each into a single owner.

| Concern | Owner | Forbidden elsewhere |
|---|---|---|
| Data fetch (`/api/tree`, `/api/sync-info`) | `useArchiveData` hook | Layout components must not call `fetch` (Rule 20) |
| Cinematic loader animation + state machine | `VaultReveal` (Phase 2, locked) | No other component animates over the full viewport |
| Top-level composition (mount loader, mount Shell, route reveal) | `App.tsx` | App never owns scroll position, focus id, or derived view data |
| Layout (Header, Sidebar, Main, Footer, Drawer) | `Shell` and its children | Shell never fetches; it receives `FlatNode[]` and selectors |
| Derived render shape (nested cats → `FlatNode[]`) | `useFlatTree` selector | Components never re-derive from raw tree data |
| Visual atmosphere (grain, radials, glow) | `AmbientLayer` + body class — see §3 | Components do not write to `document.body.style` |
| Row interaction (hover, focus, expand) | CSS-only or one delegated handler at the tree root | No per-row JS listeners (Rule 25) |

**Rule 19 restated for Phase 3:** *No component owns both data fetching and cinematic transitions.* Extending the spirit: no component owns both data fetching and view-derived state. `useArchiveData` returns `{ tree, loading, error, syncInfo }` only. `useFlatTree(tree)` derives `FlatNode[]`. The Shell consumes both.

**App.tsx after Phase 3 (target shape):**

```tsx
const { tree, loading, error, syncInfo } = useArchiveData();
const [revealed, setRevealed] = useState(false);
return (
  <>
    <VaultReveal loading={loading} onReveal={() => setRevealed(true)} />
    {revealed && <Shell tree={tree} error={error} syncInfo={syncInfo} />}
  </>
);
```

No other state lives in `App`. Anything that survives a reveal goes into a store (§2). Anything that is local to a Shell subtree goes into that subtree.

---

## 2. Store Boundaries

Zustand is the state container. Phase 3 ships three stores. They never reach across boundaries.

### 2.1 `uiStore` — ephemeral interaction state

Owns: `query`, `activeId`, `focusedId`, `forceOpen`, `drawerOpen`.

**Rules:**
- No fetch logic. Pure setters and selectors.
- No persistence middleware in Phase 3. Memory wiring is Phase 4.
- Selectors are atomic: `useUiStore(s => s.focusedId)`, never `useUiStore(s => s)`. Whole-store subscriptions are the rerender-storm vector identified in risk area 2.

### 2.2 `dataStore` — server data, snapshot-shaped

Owns: `tree` (the parsed `/api/tree` response), `syncInfo`, `loading`, `error`.

**Rules:**
- Populated only by `useArchiveData`. No component writes here.
- `tree` is the raw nested shape from the server. View-derived shapes (`FlatNode[]`, search-filtered subsets) are computed by selectors, not stored.
- Mutations are atomic snapshots — never partial. A refetch replaces the whole snapshot or fails; there is no in-place patching.

### 2.3 `memoryStore` — Phase 4, declared here to fix its shape

Owns: persisted `activeCategoryId`, `expanded` map (LRU-capped to 200 per Rule 43), `scrollAnchor`, `version`.

**Rules (Phase 4 reminders, recorded now so Phase 3 leaves room):**
- Persist middleware lives only on `memoryStore`. Never on `uiStore` or `dataStore`.
- Hydration is synchronous and pre-render (Rule 40).
- Schema is versioned and migrates (Rule 39).
- `uiStore` reads from `memoryStore` once at hydration; afterward they are independent.

**Cross-store rule.** A component subscribes to one slice from one store per concern. A row needs `focusedId` from `uiStore` — it subscribes to exactly that. It does not also subscribe to `tree` or `syncInfo`. Component-level subscription discipline is the structural defense against risk area 2.

---

## 3. Atmosphere Ownership

The legacy atmosphere is three stacked layers plus a body-level CSS variable cascade. They must not be re-stacked, re-implemented, or duplicated by any consuming component. **There is exactly one owner per layer.**

### 3.1 Layer inventory (legacy reference)

| Layer | Legacy site | Phase 3 owner |
|---|---|---|
| Grain noise (overlay blend, opacity 0.022) | `body::before` (`public/index.html:106`) | `body` rule in `styles/atmosphere.css` |
| Page radials (gold tint, fixed) | body background (legacy) | `body` rule in `styles/atmosphere.css` |
| Ambient gold radials, accent-aware | `.ambient-layer` (legacy line 324) | `<AmbientLayer />` component, mounted once by `Shell` |
| Focused-card halo | inline `--accent` on `CatBlock` (legacy line 676) | `FolderRow` consumes `--accent` from its own `style` only when focused |
| Body-level `--accent-rgb` cascade | `document.body.style.setProperty('--accent-rgb', rgb)` (legacy line 811) | `AmbientController` effect — *the single writer* |

### 3.2 The cascade rule

`--accent-rgb` is a body-level CSS variable. It is read by `.ambient-layer` background radials and by `FolderRow` halos. It is **written by exactly one effect**: `AmbientController`, mounted by `Shell`, subscribing to `focusedId` from `uiStore`.

```tsx
// Shell.tsx — exactly one AmbientController instance
<AmbientController />   // writes --accent-rgb to document.body
<AmbientLayer />        // reads --accent-rgb via CSS
```

`AmbientController` renders `null`. It exists for the side effect. This is the only sanctioned write to `document.body.style` in the application. Any other write is a leak.

### 3.3 Why "ownership" not "responsibility"

Two components writing to `--accent-rgb` at different rates produces flicker on focus change. Two components rendering ambient radials produces double-stacked opacity. Both are silent bugs. The rule is therefore not "be careful" — it is "exactly one writer, exactly one renderer, named, located, enforced."

### 3.4 Risk area 1 — atmosphere leakage (contract)

A component **leaks atmosphere** if it:
1. Mutates `document.body.style` directly, or
2. Renders a full-viewport `position: fixed` element with non-zero opacity outside of `AmbientLayer` / `VaultReveal`, or
3. Sets `--accent-rgb` on any element other than `:root` / `body` via the controller, or
4. Adds a second `mix-blend-mode` overlay on top of the grain layer.

CI grep gate (Phase 3 acceptance): `grep -rE "document\.body\.style|--accent-rgb" client/src` returns exactly two matches — both inside `AmbientController.tsx`.

---

## 4. Shell Layering

`Shell` is a layout component. It owns no data, no atmosphere math, no scroll behavior. It owns *placement*.

### 4.1 Mount order (top to bottom in the DOM)

```
<Shell>
  <AmbientController />       {/* renders null; mounts effect */}
  <AmbientLayer />            {/* z-index 0 — radials + grain consumer */}
  <Header />                  {/* z-index 100 — sticky */}
  <Sidebar />                 {/* desktop; z-index 1 */}
  <Drawer />                  {/* mobile only; z-index 200 when open */}
  <Main>
    <SearchBar />             {/* z-index 2 when expanded/focused */}
    <ArchiveTree />           {/* z-index 1; renders FlatNode[] */}
  </Main>
  <Footer />
</Shell>
```

### 4.2 Shell rules

- Shell receives `tree`, `error`, `syncInfo` as props. It reads `uiStore` for `query`, `activeId`, `focusedId`, `drawerOpen` via atomic selectors.
- Shell composes; it does not transform. `tree → FlatNode[]` is `useFlatTree`'s job.
- Shell mounts `AmbientController` and `AmbientLayer` exactly once. Children never re-mount either.
- Shell does not render the loader. `App` does.
- Shell does not own the reveal transition. The reveal is a mount/unmount toggle in `App`; Shell appears already laid out (Rule 19, Rule 42).

### 4.3 Layout components and data

`Header`, `Sidebar`, `Footer`, `ArchiveTree`, `FolderRow`, `SearchBar` — none of these call `fetch`. None of these subscribe to `dataStore.tree`. They receive `FlatNode[]` or a derived selector as props. (Rule 20.)

---

## 5. Z-Index Contract

Z-index is contested in legacy CSS — values 0, 2, 100, 200, 1000 appear without comment and the reader must reconstruct intent. Phase 3 makes the ladder explicit and exhaustive.

### 5.1 The ladder

| Layer | Owner | Purpose |
|---|---|---|
| **0** | `AmbientLayer`, `body::before` (grain) | Atmosphere — radials and grain. Nothing interactive at this level. |
| **1** | `Sidebar`, `ArchiveTree`, default shell content | Default in-flow content. |
| **2** | `SearchBar` (active), elevated `FolderRow` (focused) | Briefly raised content during direct interaction. |
| **100** | `Header` (sticky) | Always on top of scrolling content; never on top of overlays. |
| **200** | `Drawer` (mobile) | Modal-ish overlay on top of the shell. |
| **1000** | `VaultReveal` only | The cinematic ceiling. Nothing else ever reaches this band. |

### 5.2 Z-index rules

1. **No values between layers.** No `z-index: 50`, `z-index: 150`, `z-index: 999`. If a layer is missing, the ladder is incomplete and adding a value is a structural decision, not a fix.
2. **1000 is loader-exclusive.** Toasts, modals, dropdowns, popovers (Phase 4+) live below 200 or get a new named tier in this document.
3. **`position: fixed` requires a z-index from the ladder.** No implicit stacking.
4. **No `z-index: -1`.** Backgrounds use the natural document flow or layer 0.

### 5.3 Single source of truth

`client/src/styles/tokens.css` declares the ladder as named tokens once Phase 3 begins:

```css
--z-atmosphere: 0;
--z-shell: 1;
--z-elevated: 2;
--z-header: 100;
--z-drawer: 200;
--z-loader: 1000;
```

CSS modules reference the tokens. Raw `z-index: N` values in `.module.css` are forbidden during Phase 3 review.

---

## 6. Transition Ownership

The legacy loader runs on CSS animations driven by class toggles. Phase 3 adds focus, expand, search-state, and reveal transitions. These must not stack onto the loader's domain or each other.

### 6.1 The principle

**One component owns each animated property.** If `FolderRow` animates `opacity` for focus dimming, no parent animates `opacity` on the same row. If `Drawer` animates `transform: translateX`, no parent animates `transform` on it.

### 6.2 Ownership table

| Animation | Owner | Source of motion |
|---|---|---|
| Loader sequence (rings, sigil, wordmark, status, dissolve) | `VaultReveal` | `loader.module.css` keyframes via `timing.ts` |
| Reveal mount (Shell appearing) | `App` (mount toggle) | None — Shell mounts after dissolve completes; no Shell-side transition |
| Focus dim/highlight (`FolderRow` opacity, halo) | `FolderRow` | `--motion-focus`, `--ease-cinematic` |
| Expand/collapse (row height) | `FolderRow` (CSS `height` or `grid-template-rows` transition) | `--motion-base`, `--ease-standard` |
| Drawer slide | `Drawer` | `--motion-base`, `--ease-standard` |
| Search-bar focus (border, scale) | `SearchBar` | `--motion-fast`, `--ease-standard` |
| Atmosphere accent cross-fade (when `focusedId` changes) | CSS transition on `--accent-rgb` via `transition: background 520ms` on `AmbientLayer` | Not a JS animation; the variable is set once and CSS interpolates the consuming radials |

### 6.3 Reveal handoff

The reveal is not a transition Shell participates in. The sequence is:
1. `VaultReveal` starts dissolve (opacity 1 → 0, `DISSOLVE_DURATION`).
2. Loader unmounts; `setRevealed(true)` fires.
3. `App` mounts `Shell`. Shell renders immediately, fully visible, no fade-in.

Shell does **not** animate its own entrance. A second fade collides with the loader's dissolve and produces a perceptible double-step. Risk area 4 (scroll restoration timing) lives here: Phase 4 will restore scroll *before* Shell mounts, using `behavior: 'instant'` (Rule 42), so the first painted frame is already scrolled.

### 6.4 What is forbidden during migration

- New animations (Rule 4). The migration ships only the transitions that exist in the legacy product, ported to the four-duration / four-easing system (Rules 27, 28).
- Layout-thrashing animations beyond the loader's wordmark `letter-spacing` (Rule 30).
- Blanket `will-change` (Rule 31).

---

## 7. Phase 3 Risk Areas (Explicit Contracts)

Risk areas the user identified, restated as testable contracts.

### 7.1 Atmosphere leakage

**Contract:** Exactly one writer (`AmbientController`) and exactly one viewport renderer (`AmbientLayer`) per atmosphere layer.

**Test (CI grep):**
```
grep -rE "document\.body\.style|setProperty\(['\"]--accent" client/src
```
Acceptable matches: inside `AmbientController.tsx` only. Any other match fails review.

**Test (visual diff):** Toggle through all 17 categories. The `--accent-rgb` cross-fade is single-stepped and matches legacy frame-for-frame at the inflection.

### 7.2 Focus mode rerender storms

**Cause in legacy:** `focusedId` is a prop passed through `App → CatBlock`. Every row re-renders on every focus change because the whole tree re-renders.

**Contract:**
- `focusedId` lives in `uiStore`. Components subscribe via atomic selector: `useUiStore(s => s.focusedId)`.
- `FolderRow` is wrapped in `React.memo` (Rule 26).
- A row reads its own `isFocused` via a memoized selector: `useUiStore(s => s.focusedId === props.id)`. Subscribing to the *boolean*, not the id, means only the previously-focused row and the newly-focused row re-render — not all 1,000+ rows.
- `FolderRow` derives `isDimmed` from `focusedId != null && focusedId !== props.id`. Same selector pattern.

**Test:** With React DevTools profiler, switching focus re-renders ≤ 3 `FolderRow` instances regardless of tree size.

### 7.3 Tree virtualization compatibility

**Contract:** Virtualization is designed for in Phase 3 but not enabled. Compatibility means a future virtualization wrapper drops in without API changes.

- `ArchiveTree` consumes `FlatNode[]` (Rule 23). Flattening is what makes a virtual list possible; nested recursive rendering is not virtualizable.
- `FolderRow` computes its height from props alone (Rule 24). No `useEffect` measuring DOM, no `getBoundingClientRect` in render, no sibling-dependent layout.
- Row interaction is CSS-only or event-delegated at the tree root (Rule 25). No per-row JS listeners — a virtual list mounts/unmounts rows during scroll, and per-row listeners would thrash.
- `FlatNode` includes `depth`, `expanded`, `hasChildren`, and a stable `id`. Visual hierarchy is rendered from `depth` (padding-left or grid column), not from DOM nesting.
- `ArchiveTree` renders `FlatNode[]` via `.map(node => <FolderRow key={node.id} node={node} />)`. Switching to `react-window` or `@tanstack/virtual` later replaces only this `.map`.

**Test:** A reviewer can write a virtualization wrapper in one PR that touches only `ArchiveTree.tsx` (no `FolderRow`, no store).

### 7.4 Scroll restoration timing

**Contract:** Smooth scroll is used for in-app navigation (clicking a sidebar category). Instant scroll is used for state restoration during the loader window (Rule 42).

- `scrollTo(id)` (Phase 3): `document.getElementById(\`cat-${id}\`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`. This matches legacy line 814.
- `restoreScroll(id)` (Phase 4): `scrollIntoView({ behavior: 'instant', block: 'start' })`. Fires before reveal, while loader still covers viewport. The first painted Shell frame is already at the restored position.
- The two functions are distinct entry points, never the same call site with a parameter. Mixing them at the boundary is the bug Rule 42 exists to prevent — a smooth scroll started during the loader window is still in motion when the dissolve completes, and the user sees the page scrolling on its own.
- Restoration runs against `node.id`, never `node.path` (Rule 21). A category renamed in the source data does not produce an orphan anchor; an invalid `id` falls back to default (Rule 41).

---

## 8. What This Document Does Not Cover

- **Specific component file structure.** That belongs in the Phase 3 PR description.
- **Tailwind / className conventions.** Out of scope; `*.module.css` is the rule (Rule 18).
- **Test framework choice.** Phase 3 ships components; the test plan is a separate decision.
- **Accessibility audit.** Phase 3 inherits legacy a11y. Improvements are Tier 2 work after parity.
- **Performance budgets.** Lighthouse baseline is set at end of Phase 1 (Rule 37). Phase 3 must not regress; specific budgets per route are not enumerated here.

---

## 9. How to Use This Document

Before writing a Phase 3 component, locate it in §1 (Render Ownership) and §4 (Shell Layering). Confirm the store slice it reads in §2. If it animates, find the row in §6.2. If it touches the viewport, confirm the z-index tier in §5.1. If it modifies `document.body`, stop — only `AmbientController` does that (§3.2).

When a component does not fit any boundary in this document, that is the signal a boundary is missing — update this document in the same PR, do not work around it.

---

**Status:** Phase 2 locked. Phase 3 begins with this contract. No Shell code lands before this document is reviewed.
