/**
 * EmptyResults.tsx — "No matches found" state, shown when the active
 * search query filters every category out.
 *
 * Ported VERBATIM from public/index.html lines 1053-1068. Inline styles
 * moved into the CSS module; the Clear-search button reuses the global
 * `.ctrl` class from shell.css.
 */
import type { JSX } from 'react';
import { useUIStore } from '@/stores/uiStore';
import styles from './EmptyResults.module.css';

export interface EmptyResultsProps {
  /** The query that produced zero results — echoed in the subtitle. */
  readonly query: string;
}

export function EmptyResults({ query }: EmptyResultsProps): JSX.Element {
  const setQuery = useUIStore((s) => s.setQuery);

  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="9.5" cy="9.5" r="7" stroke="currentColor" strokeWidth="1.4" />
          <line
            x1="15"
            y1="15"
            x2="20"
            y2="20"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div className={styles.title}>No matches found</div>
        <div className={styles.subtitle}>
          No results for <span className={styles.queryEcho}>&ldquo;{query}&rdquo;</span>
        </div>
      </div>
      <button type="button" onClick={() => setQuery('')} className="ctrl">
        Clear search
      </button>
    </div>
  );
}
