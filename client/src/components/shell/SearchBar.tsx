/**
 * SearchBar.tsx — Vault-wide search input + clear button + result counter.
 *
 * Reads `query` from uiStore atomically and writes via `setQuery`. The
 * counter (visible / total) reads `visibleCount` and `totalCount` from
 * props so SearchBar stays decoupled from the tree filter — App computes
 * both with `useMemo`.
 *
 * Keyboard contract: focus is exposed via `inputRef` (forwarded). The App
 * binds ⌘K/Ctrl+K to focus it. Esc is owned by uiStore.clearFocusOrQuery.
 */
import { forwardRef, type ChangeEvent } from 'react';
import { useUIStore } from '@/stores/uiStore';
import styles from './SearchBar.module.css';

export interface SearchBarProps {
  readonly visibleCount: number;
  readonly totalCount: number;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { visibleCount, totalCount },
  ref,
) {
  const query = useUIStore((s) => s.query);
  const setQuery = useUIStore((s) => s.setQuery);

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => setQuery(e.target.value);
  const onClear = (): void => setQuery('');

  return (
    <>
      <div className={`${styles.wrap} search-wrap${query ? ' is-active' : ''}`}>
        <svg className={`${styles.icon} search-icon`} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.35" />
          <line x1="9.6" y1="9.6" x2="12.6" y2="12.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
        <input
          ref={ref}
          className={`${styles.input} search-in`}
          value={query}
          onChange={onChange}
          placeholder={query ? 'Searching the archive…' : 'Search the vault…'}
          aria-label="Search categories and folders"
        />
        {query && (
          <button className={styles.clear} onClick={onClear} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
      {query && (
        <span className={styles.count}>
          {visibleCount}
          <span className={styles.countSep}>/</span>
          {totalCount}
        </span>
      )}
    </>
  );
});
