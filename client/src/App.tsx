import { useState } from "react";
import VaultReveal from "@/components/loader/VaultReveal";

/**
 * App — Phase 2 composition root.
 *
 * Scope (MIGRATION_RULES.md Phase 2):
 *   - Mounts VaultReveal only. No Shell, no data fetch.
 *   - Once the loader signals reveal, a minimal placeholder takes over so
 *     the dissolve transition has something to dissolve INTO.
 *
 * Phase 3 will replace `loading={false}` with `useArchiveData()` and the
 * placeholder with the real Shell.
 */
export default function App(): JSX.Element {
  const [revealed, setRevealed] = useState<boolean>(false);

  return (
    <>
      <VaultReveal loading={false} onReveal={() => setRevealed(true)} />
      {revealed && <div data-app-placeholder>Cortexa Vault — Vite Foundation</div>}
    </>
  );
}
