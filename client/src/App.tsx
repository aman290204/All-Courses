/**
 * App.tsx — Phase 3 composition root.
 *
 * Mounts the single data-fetching surface (`useArchiveData`) at the root,
 * passes `dataStore.loading` to VaultReveal so the cinematic dissolve waits
 * for the real /api/tree fetch, then composes the live shell once the
 * loader's reveal handshake completes.
 *
 * Composition order (back-to-front in z-stack):
 *   1. AmbientLayer — pinned background atmosphere (grid + glow)
 *   2. AmbientController — invisible side-effect; writes --accent-rgb
 *   3. Shell — Drawer / Header / Sidebar / main scroll surface
 *   4. ArchiveTree — section label + CatBlock list + scroll-fade + Footer
 *   5. VaultReveal — sits on top until the dissolve completes
 *
 * MIGRATION_RULES.md:
 *   - Rule 19: ONE data-fetching surface (`useArchiveData`) called here.
 *   - Rule 18: no inline styles in this file.
 */
import { useState, useEffect, useRef, type JSX } from 'react';
import VaultReveal from '@/components/loader/VaultReveal';
import { Shell } from '@/components/shell/Shell';
import { ArchiveTree } from '@/components/archive/ArchiveTree';
import { AmbientController } from '@/components/atmosphere/AmbientController';
import { AmbientLayer } from '@/components/atmosphere/AmbientLayer';
import { useArchiveData } from '@/hooks/useArchiveData';
import { useDataStore } from '@/stores/dataStore';
import { useMemoryStore } from '@/stores/memoryStore';

export default function App(): JSX.Element {
  // Single data-fetching surface — Rule 19.
  useArchiveData();
  const loading = useDataStore((s) => s.loading);
  const tree = useDataStore((s) => s.tree);
  const [revealed, setRevealed] = useState<boolean>(false);
  const scrolledOnce = useRef<boolean>(false);

  // Stale-ref validation + initial category scroll (Rules 41, 42).
  // Fires once after VaultReveal dissolve completes and tree is loaded.
  useEffect(() => {
    if (!revealed || !tree || scrolledOnce.current) return;
    scrolledOnce.current = true;
    const { activeCategoryId, setActiveCategoryId } = useMemoryStore.getState();
    if (activeCategoryId === null) return;
    const exists = tree.categories.some((c) => c.id === activeCategoryId);
    if (!exists) {
      setActiveCategoryId(null);
      return;
    }
    const el = document.getElementById(`cat-${activeCategoryId}`);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [revealed, tree]);

  return (
    <>
      <VaultReveal loading={loading} onReveal={() => setRevealed(true)} />
      {revealed && (
        <>
          <AmbientLayer />
          <AmbientController />
          <Shell>
            <ArchiveTree />
          </Shell>
        </>
      )}
    </>
  );
}
