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
import { useState, type JSX } from 'react';
import VaultReveal from '@/components/loader/VaultReveal';
import { Shell } from '@/components/shell/Shell';
import { ArchiveTree } from '@/components/archive/ArchiveTree';
import { AmbientController } from '@/components/atmosphere/AmbientController';
import { AmbientLayer } from '@/components/atmosphere/AmbientLayer';
import { useArchiveData } from '@/hooks/useArchiveData';
import { useDataStore } from '@/stores/dataStore';

export default function App(): JSX.Element {
  // Single data-fetching surface — Rule 19.
  useArchiveData();
  const loading = useDataStore((s) => s.loading);
  const [revealed, setRevealed] = useState<boolean>(false);

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
