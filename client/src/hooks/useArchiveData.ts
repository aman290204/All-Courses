/**
 * useArchiveData.ts — Sole data-fetching surface for the app.
 *
 * MIGRATION_RULES.md Rule 19: separation of concerns. All network reads
 * funnel through this hook — components and stores never call `fetch`
 * directly. The hook:
 *   1. Fetches `/api/tree` once on mount → dataStore.tree
 *   2. Fetches `/api/status` once on mount → dataStore.syncInfo
 *   3. Sets up a 60-second `/api/status` poll for sync freshness
 *   4. Surfaces errors via dataStore.error (does not throw)
 *
 * Legacy parity: matches public/index.html's fetch + 60s polling cadence.
 *
 * Mount once at the App root (after loader dissolves). Subsequent mounts
 * are idempotent but redundant — guard via App composition, not here.
 */
import { useEffect } from 'react';
import { useDataStore } from '@/stores/dataStore';
import type { ApiTree, SyncInfo } from '@/types/archive';

const POLL_MS = 60_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function useArchiveData(): void {
  const setTree = useDataStore((s) => s.setTree);
  const setSyncInfo = useDataStore((s) => s.setSyncInfo);
  const setLoading = useDataStore((s) => s.setLoading);
  const setError = useDataStore((s) => s.setError);

  useEffect(() => {
    let cancelled = false;

    const loadTree = async (): Promise<void> => {
      try {
        const tree = await fetchJson<ApiTree>('/api/tree');
        if (!cancelled) {
          setTree(tree);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load archive');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const loadStatus = async (): Promise<void> => {
      try {
        const status = await fetchJson<SyncInfo>('/api/status');
        if (!cancelled) setSyncInfo(status);
      } catch {
        // Status polling failures are non-fatal — leave previous value in place.
      }
    };

    void loadTree();
    void loadStatus();

    const id = window.setInterval(() => {
      void loadStatus();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setTree, setSyncInfo, setLoading, setError]);
}
