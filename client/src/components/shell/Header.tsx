/**
 * Header.tsx — Sticky top chrome: brand, stat strip (desktop + mobile 2x2),
 * search input, ⌘K hint, sync pill, focus-mode controls.
 *
 * Ported from public/index.html lines 893-1013.
 *
 * Props: `searchInputRef` is forwarded down to SearchBar so the App can
 * wire ⌘K/Ctrl+K → focus without coupling Header to the keyboard binding.
 */
import { useMemo, type Ref } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useUIStore } from '@/stores/uiStore';
import { fmtNum } from '@/utils/format';
import { catHasMatch } from '@/utils/tree';
import { SearchBar } from './SearchBar';
import { SyncPill } from './SyncPill';
import { FocusModeToggle } from './FocusModeToggle';
import styles from './Header.module.css';

export interface HeaderProps {
  readonly searchInputRef: Ref<HTMLInputElement>;
}

export function Header({ searchInputRef }: HeaderProps): JSX.Element {
  const stats = useDataStore((s) => s.tree?.stats);
  const cats = useDataStore((s) => s.tree?.categories) ?? [];
  const query = useUIStore((s) => s.query);
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);

  const visibleCount = useMemo(
    () => cats.filter((c) => catHasMatch(c, query)).length,
    [cats, query],
  );

  const desktopTiles: ReadonlyArray<readonly [string, string]> = useMemo(
    () => [
      [stats?.fileCount ? fmtNum(stats.fileCount) : '—', 'Files'],
      [fmtNum(stats?.totalFolders), 'Folders'],
      [stats?.totalSize ?? '—', 'Total Size'],
      [fmtNum(stats?.totalCategories), 'Subjects'],
    ],
    [stats],
  );

  const mobileTiles: ReadonlyArray<readonly [string, string]> = useMemo(
    () => [
      [stats?.totalSize ?? '—', 'Storage'],
      [stats?.fileCount ? fmtNum(stats.fileCount) : '—', 'Files'],
      [fmtNum(stats?.totalFolders), 'Folders'],
      [fmtNum(stats?.totalCategories), 'Subjects'],
    ],
    [stats],
  );

  return (
    <header className={styles.header}>
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`header-brand ${styles.brandRow}`}>
        <div className={styles.brandLeft}>
          <button
            className={`mobile-hamburger ${styles.hamburger}`}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open subjects menu"
          >
            ☰
          </button>
          <div className={`logo-mark ${styles.logoMark}`}>
            <img
              src="/Logo.png"
              alt="Cortexa Vault"
              width="38"
              height="38"
              draggable={false}
              className={styles.logoImg}
            />
          </div>
          <div>
            <div className={`brand-title ${styles.brandTitle}`}>Cortexa Vault</div>
            <div className={styles.brandSub}>Curated for Curious Minds</div>
          </div>
        </div>

        <div className={`desktop-stats header-stats ${styles.desktopStats}`}>
          {desktopTiles.map(([v, l]) => (
            <div key={l} className={`stat-box ${styles.statBox}`}>
              <div className="stat-val">{v}</div>
              <div className="stat-lbl">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mobile-stats">
        {mobileTiles.map(([v, l]) => (
          <div key={l} className="mobile-stat-card">
            <div className="mobile-stat-val">{v}</div>
            <div className="mobile-stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div className={`header-search-row ${styles.searchRow}`}>
        <SearchBar ref={searchInputRef} visibleCount={visibleCount} totalCount={cats.length} />
        <div className={styles.spacer} />
        <div className={`updated-label ${styles.kbdRow}`}>
          <kbd className={styles.kbd}>⌘ K</kbd>
        </div>
        <SyncPill />
        <FocusModeToggle />
      </div>
    </header>
  );
}
