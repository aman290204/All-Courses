# Archive Memory Plan — Phase 5

## State Ownership

| Piece | Store | Rationale |
|---|---|---|
| `activeCategoryId` | `memoryStore` (localStorage) | Cross-session, stable cat ID (Rule 21) |
| `expandedIds` | `memoryStore` (localStorage) | Cross-session, set of stable node IDs |
| `focusedId` | `uiStore` → sessionStorage bridge | Per-session only; focus doesn't survive new tabs |
| `query` | `uiStore` only (no restore) | Stale search is confusing on return; reset is correct UX |
| `forceOpen` | `uiStore` only (no restore) | Transient mode; always off on fresh load |
| `scrollY` | sessionStorage (hook) | Per-tab, not cross-session; session-scoped is correct |

`memoryStore` is a new Zustand slice with `persist` middleware, isolated from `uiStore` and `dataStore`. No existing store is modified to add persistence.

## Persistence Boundaries

```
localStorage   ← memoryStore (activeCategoryId, expandedIds)
sessionStorage ← scrollY (useScrollRestore hook), focusedId
memory only    ← query, forceOpen, drawerOpen, activeId (ambient)
```

`memoryStore` state shape (v1):

```ts
interface ArchiveMemoryState {
  version: 1;
  activeCategoryId: string | null;
  expandedIds: string[];          // LRU, capped at 200 (Rule 43)
}
```

Schema versioning: every shape change increments `version` and provides a `migrate(raw) → ArchiveMemoryState` function (Rule 39).

## Restore Order

1. **Module init (synchronous, pre-render)**: Zustand `persist` rehydrates `memoryStore` from localStorage. No React involved yet (Rule 40).
2. **`App` mounts**: `useArchiveData` fires; `loading = true`; `VaultReveal` covers screen.
3. **Stale-ref validation**: Once `dataStore.tree` first resolves, a one-shot effect checks `memoryStore.activeCategoryId` against the live category list. If missing → set null (Rule 41).
4. **`revealed` flips true** (VaultReveal dissolve completes): Shell + ArchiveTree mount.
5. **focusedId restore** (optional): sessionStorage read happens in `uiStore` init or a small bootstrap hook before Shell mounts.
6. **Scroll restore**: `useScrollRestore` fires after Shell mounts, reads sessionStorage, scrolls to saved Y with `behavior: 'instant'` (Rule 42).
7. **activeCategoryId scroll**: after tree is visible, scroll to `cat-${activeCategoryId}` element with `behavior: 'instant'`.

## Storage Strategy

### localStorage — memoryStore

- Key: `cortexa-vault-memory-v1`
- Zustand `persist` middleware with custom `storage` adapter
- Writes debounced via `requestIdleCallback(300 ms)` — never per-event (Rule 38)
- LRU eviction: when `expandedIds.length > 200`, drop the oldest entries (Rule 43)
- `migrate()` provided for future version upgrades (Rule 39)

### sessionStorage — scrollY + focusedId

- Keys: `cortexa-scroll-y`, `cortexa-focused-id`
- Written via debounced scroll listener and focusedId watcher
- Read once on mount; no Zustand involvement — plain reads/writes to sessionStorage

## Mobile Considerations

- Scroll restore target must be confirmed visible before scrolling (check element exists in DOM)
- No additional scroll-snap or momentum-scroll overrides; existing mobile CSS untouched
- `expandedIds` LRU cap (200) prevents localStorage quota issues on mobile browsers with tighter storage limits
- All restores use `behavior: 'instant'` — no animated scroll on restore (avoids jank on low-end devices, Rule 42)

## Rerender Risk Mitigation

- `memoryStore` uses atomic selectors — components subscribe only to the slice they need (`activeCategoryId` or `expandedIds.includes(id)`)
- `FolderRow` lifts `open` to `memoryStore` but remains wrapped in `React.memo` (Rule 26); the selector returns a primitive `boolean`, so memo bail-out still works
- `expandedIds` toggle writes a new array (immutable update), enabling stable reference checks
- `CatBlock` does NOT subscribe to `memoryStore` directly; `FolderRow` handles its own expanded state
- `ArchiveTree` is unaffected — it does not subscribe to `memoryStore`
- Scroll listener writes to sessionStorage only (not Zustand), so zero rerenders on scroll

## File Changeset

| File | Action |
|---|---|
| `client/src/stores/memoryStore.ts` | CREATE |
| `client/src/hooks/useScrollRestore.ts` | CREATE |
| `client/src/components/archive/FolderRow.tsx` | MODIFY (lift `open` state) |
| `client/src/components/shell/Shell.tsx` | MODIFY (add mainRef, wire scroll hook) |
| `client/src/App.tsx` | MODIFY (stale-ref validation effect) |

No other files touched.
