/**
 * uiStore.ts — UI state (Zustand, atomic selectors).
 *
 * MIGRATION_RULES.md Rule 19: separation of concerns. This store owns
 * transient UI state only — search query, current focus, drawer visibility,
 * the "force-open" toggle that overrides search-driven collapse. It does NOT
 * own data, network status, or theme tokens.
 *
 * Consumers must subscribe with atomic field selectors (e.g.
 * `useUIStore((s) => s.query)`) — never `useUIStore()` whole. That keeps
 * rerender scope narrow on a tree that can render hundreds of FolderRows.
 *
 * No persist middleware — persistence lands in Phase 4 with localStorage
 * keyed on stable IDs (Rule 21). Adding persist now would invalidate stored
 * state when IDs/shapes change between phases.
 */
import { create } from 'zustand';

export interface UIState {
  /** Lowercased search query — empty string means "no filter". */
  readonly query: string;
  /** Hovered / keyboard-active node id, used for ambient color sampling. */
  readonly activeId: string | null;
  /** Locked-focus category id (click-to-pin). Drives focused/dimmed classes. */
  readonly focusedId: string | null;
  /** When true, all categories render expanded regardless of search state. */
  readonly forceOpen: boolean;
  /** Mobile sidebar drawer visibility. */
  readonly drawerOpen: boolean;

  setQuery: (q: string) => void;
  setActiveId: (id: string | null) => void;
  setFocusedId: (id: string | null) => void;
  toggleForceOpen: () => void;
  setForceOpen: (v: boolean) => void;
  setDrawerOpen: (v: boolean) => void;
  /** Esc handler: clear focus first, then query on a second press. */
  clearFocusOrQuery: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  query: '',
  activeId: null,
  focusedId: null,
  forceOpen: false,
  drawerOpen: false,

  setQuery: (q) => set({ query: q.toLowerCase() }),
  setActiveId: (id) => set({ activeId: id }),
  setFocusedId: (id) => set({ focusedId: id }),
  toggleForceOpen: () => set({ forceOpen: !get().forceOpen }),
  setForceOpen: (v) => set({ forceOpen: v }),
  setDrawerOpen: (v) => set({ drawerOpen: v }),
  clearFocusOrQuery: () => {
    const { focusedId, query } = get();
    if (focusedId) set({ focusedId: null });
    else if (query) set({ query: '' });
  },
}));
