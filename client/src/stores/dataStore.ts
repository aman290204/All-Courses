/**
 * dataStore.ts — Network-backed data (Zustand, atomic selectors).
 *
 * MIGRATION_RULES.md Rule 19: this store is the canonical home for server
 * data — the archive tree and live sync status. It does NOT own UI state
 * (see uiStore.ts) and is never written from a component — only from the
 * single data-fetching hook in `hooks/useArchiveData.ts`.
 *
 * Atomic selectors only: `useDataStore((s) => s.tree)` etc. The 17-category
 * tree triggers fan-out renders if subscribed wholesale.
 */
import { create } from 'zustand';
import type { ApiTree, SyncInfo } from '@/types/archive';

export interface DataState {
  /** Full archive tree — null while initial fetch is in flight. */
  readonly tree: ApiTree | null;
  /** Live sync info polled every 60s. */
  readonly syncInfo: SyncInfo | null;
  /** True until the first /api/tree response resolves (success or error). */
  readonly loading: boolean;
  /** Last error message — null when healthy. */
  readonly error: string | null;

  setTree: (t: ApiTree) => void;
  setSyncInfo: (s: SyncInfo) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useDataStore = create<DataState>((set) => ({
  tree: null,
  syncInfo: null,
  loading: true,
  error: null,

  setTree: (t) => set({ tree: t }),
  setSyncInfo: (s) => set({ syncInfo: s }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));
