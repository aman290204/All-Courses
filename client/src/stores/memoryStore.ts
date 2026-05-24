/**
 * memoryStore.ts — Cross-session archive memory (Phase 5).
 *
 * Persists: activeCategoryId (last focused category) + expandedIds
 * (open FolderRow nodes). Writes are debounced via requestIdleCallback
 * (300 ms) — Rule 38. expandedIds is LRU-capped at 200 entries — Rule 43.
 * Schema is versioned; every shape change increments VERSION + provides
 * migrate() — Rule 39. Stale activeCategoryId is validated against the live
 * tree in App.tsx after dataStore.tree resolves — Rule 41.
 *
 * Cross-tab sync deferred to v2 — Rule 44.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

const STORAGE_KEY = 'cortexa-vault-memory-v1';
const MAX_EXPANDED = 200;
const VERSION = 1;

// ── debounced localStorage adapter (Rule 38) ─────────────────────────────────

let _rIC: ReturnType<typeof requestIdleCallback> | null = null;

const debouncedStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    if (_rIC !== null) cancelIdleCallback(_rIC);
    _rIC = requestIdleCallback(
      () => {
        localStorage.setItem(name, value);
        _rIC = null;
      },
      { timeout: 300 },
    );
  },
  removeItem: (name) => {
    if (_rIC !== null) {
      cancelIdleCallback(_rIC);
      _rIC = null;
    }
    localStorage.removeItem(name);
  },
};

// ── state shape ───────────────────────────────────────────────────────────────

export interface ArchiveMemoryState {
  activeCategoryId: string | null;
  /** Ordered by insertion time, oldest first. LRU-evicted when > 200. */
  expandedIds: string[];
  setActiveCategoryId: (id: string | null) => void;
  /** Toggle a node open/closed. Opening appends to end (LRU order). */
  toggleExpanded: (id: string) => void;
  /** Replace the full set — used during stale-ref cleanup (Rule 41). */
  setExpandedIds: (ids: string[]) => void;
  isExpanded: (id: string) => boolean;
}

// ── migration (Rule 39) ───────────────────────────────────────────────────────

type PersistedSlice = Pick<ArchiveMemoryState, 'activeCategoryId' | 'expandedIds'>;

function migrateState(raw: unknown, fromVersion: number): PersistedSlice {
  const base: PersistedSlice = { activeCategoryId: null, expandedIds: [] };
  if (fromVersion === 0 || !raw || typeof raw !== 'object') return base;
  const s = raw as Partial<PersistedSlice>;
  return {
    activeCategoryId: typeof s.activeCategoryId === 'string' ? s.activeCategoryId : null,
    expandedIds: Array.isArray(s.expandedIds) ? (s.expandedIds as string[]) : [],
  };
}

// ── store ─────────────────────────────────────────────────────────────────────

export const useMemoryStore = create<ArchiveMemoryState>()(
  persist(
    (set, get) => ({
      activeCategoryId: null,
      expandedIds: [],

      setActiveCategoryId: (id) => set({ activeCategoryId: id }),

      toggleExpanded: (id) =>
        set((s) => {
          const has = s.expandedIds.includes(id);
          if (has) {
            return { expandedIds: s.expandedIds.filter((x) => x !== id) };
          }
          const next = [...s.expandedIds, id];
          return {
            expandedIds:
              next.length > MAX_EXPANDED ? next.slice(next.length - MAX_EXPANDED) : next,
          };
        }),

      setExpandedIds: (ids) => set({ expandedIds: ids }),

      isExpanded: (id) => get().expandedIds.includes(id),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => debouncedStorage),
      version: VERSION,
      migrate: (raw, fromVersion) =>
        migrateState(raw, fromVersion) as unknown as ArchiveMemoryState,
      partialize: (s) =>
        ({ activeCategoryId: s.activeCategoryId, expandedIds: s.expandedIds }) as ArchiveMemoryState,
    },
  ),
);
