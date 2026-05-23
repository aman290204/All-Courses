/**
 * AmbientController.tsx — Single writer for `--accent-rgb` on `document.body`.
 *
 * ARCHITECTURE_NOTES.md §3 — atmosphere has exactly one writer. This is it.
 * The grep gate that protects the invariant is:
 *
 *   $ grep -rn "setProperty.*--accent-rgb" client/src
 *   client/src/components/atmosphere/AmbientController.tsx: ONE MATCH ONLY.
 *
 * If any other file ever writes that property, the gate fails and the PR
 * cannot land. Consumers read via the CSS cascade — see `atmosphere.css`
 * and category CSS modules that reference `var(--accent-rgb)`.
 *
 * The component renders nothing — it is a side-effect-only React node.
 *
 * Behaviour:
 *  - When `focusedId` is set and matches a category, write that category's
 *    hue (in `r,g,b` form) to `body.style`.
 *  - When `focusedId` is null, fall back to `activeId` (hover/keyboard
 *    sample). When that is also null, fall back to the gold default.
 *  - On unmount, clear the inline override so the cascade resumes.
 */
import { useEffect } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useUIStore } from '@/stores/uiStore';
import { hexRgb } from '@/utils/format';

/** Cortexa gold — the resting accent when no category is focused or active. */
const DEFAULT_ACCENT_RGB = '212,168,79';

export function AmbientController(): null {
  const tree = useDataStore((s) => s.tree);
  const focusedId = useUIStore((s) => s.focusedId);
  const activeId = useUIStore((s) => s.activeId);

  useEffect(() => {
    const categories = tree?.categories;
    const sampleId = focusedId ?? activeId;
    const match = sampleId ? categories?.find((c) => c.id === sampleId) : undefined;
    const rgb = match ? hexRgb(match.hue) : DEFAULT_ACCENT_RGB;
    document.body.style.setProperty('--accent-rgb', rgb);
  }, [tree, focusedId, activeId]);

  useEffect(() => {
    return () => {
      document.body.style.removeProperty('--accent-rgb');
    };
  }, []);

  return null;
}
