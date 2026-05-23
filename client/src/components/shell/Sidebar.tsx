/**
 * Sidebar.tsx — Desktop-only 252px subject index (hidden ≤640px via
 * `.sidebar-nav` media query in shell.css).
 *
 * Click a subject → scroll its CatBlock into view + pin focus. While a
 * query is active, non-matching subjects fade to 22% opacity (legacy
 * lines 1031-1047).
 *
 * `nq` (lowercased query) drives matching — reading it via the uiStore
 * directly keeps the parent from re-rendering when only sidebar visuals
 * shift.
 */
import { useDataStore } from '@/stores/dataStore';
import { useUIStore } from '@/stores/uiStore';
import { catHasMatch } from '@/utils/tree';
import { hexRgb } from '@/utils/format';
import styles from './Sidebar.module.css';

export function Sidebar(): JSX.Element {
  const cats = useDataStore((s) => s.tree?.categories) ?? [];
  const activeId = useUIStore((s) => s.activeId);
  const query = useUIStore((s) => s.query);
  const setActiveId = useUIStore((s) => s.setActiveId);
  const setFocusedId = useUIStore((s) => s.setFocusedId);

  const onPick = (id: string): void => {
    setActiveId(id);
    setFocusedId(id);
    requestAnimationFrame(() => {
      document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <nav className={`sidebar sidebar-nav ${styles.sidebar}`} aria-label="Subject navigation">
      <div className={styles.inner}>
        <div className={styles.eyebrow}>
          <span className={styles.dash} />
          Subject Index
        </div>
        {cats.map((cat) => {
          const act = cat.id === activeId;
          const rgb = hexRgb(cat.hue);
          const matches = catHasMatch(cat, query);
          const dimmed = query && !matches;
          return (
            <button
              key={cat.id}
              className={`sb-btn ${styles.row}${act ? ' active-sb' : ''}`}
              data-active={act}
              data-dimmed={dimmed}
              style={{ ['--cat-rgb' as string]: rgb }}
              onClick={() => onPick(cat.id)}
            >
              <span className={styles.dot} />
              <span className={styles.name}>{cat.shortName}</span>
              <span className={styles.idx}>{cat.id}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
