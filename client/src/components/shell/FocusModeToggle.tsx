/**
 * FocusModeToggle.tsx — Expand all / Collapse pair from the header right rail.
 *
 * "Expand all" turns on the forceOpen override and clears any pinned focus.
 * "Collapse" clears forceOpen, focus, AND the search query (matches legacy
 * line 1010 — collapse is a full reset, not just a state flip).
 *
 * Uses the shared `.ctrl` global class from shell.css for visuals.
 */
import { useUIStore } from '@/stores/uiStore';
import styles from './FocusModeToggle.module.css';

export function FocusModeToggle(): JSX.Element {
  const forceOpen = useUIStore((s) => s.forceOpen);
  const setForceOpen = useUIStore((s) => s.setForceOpen);
  const setFocusedId = useUIStore((s) => s.setFocusedId);
  const setQuery = useUIStore((s) => s.setQuery);

  const onExpand = (): void => {
    setForceOpen(true);
    setFocusedId(null);
  };
  const onCollapse = (): void => {
    setForceOpen(false);
    setFocusedId(null);
    setQuery('');
  };

  return (
    <div className={styles.row}>
      <div className={styles.divider} />
      <button className={`ctrl${forceOpen ? ' on' : ''}`} onClick={onExpand} aria-pressed={forceOpen}>
        Expand all
      </button>
      <button className="ctrl" onClick={onCollapse}>
        Collapse
      </button>
    </div>
  );
}
