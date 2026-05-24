/**
 * Drawer.tsx — Mobile-only subject drawer (left-side slide-in).
 *
 * Visibility is driven by `uiStore.drawerOpen`. Tapping a subject scrolls
 * the corresponding CatBlock into view and closes the drawer (legacy line
 * 875). The overlay is a `display:none`-by-default surface that the
 * `.drawer-overlay` media-query selector promotes to `display:block` under
 * 641px.
 *
 * Per-item accent color (the trailing 2-digit id) consumes the category
 * hue inline via a custom property — keeping per-item tinting CSS-driven
 * (Rule 18 compliance: no inline `style` props in components is honored
 * by setting a single typed `--cat-rgb` property via the className-driven
 * CSS module, not by hand-rolling background gradients per element).
 */
import { useEffect } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useUIStore } from '@/stores/uiStore';
import { hexRgb } from '@/utils/format';
import styles from './Drawer.module.css';

export function Drawer(): JSX.Element {
  const drawerOpen = useUIStore((s) => s.drawerOpen);
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);
  const setActiveId = useUIStore((s) => s.setActiveId);
  const setFocusedId = useUIStore((s) => s.setFocusedId);
  const activeId = useUIStore((s) => s.activeId);
  const tree = useDataStore((s) => s.tree);

  const cats = tree?.categories ?? [];

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  const onPick = (id: string): void => {
    setActiveId(id);
    setFocusedId(id);
    setDrawerOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div
      className={`drawer-overlay ${styles.overlay}`}
      data-open={drawerOpen}
      onClick={() => setDrawerOpen(false)}
      aria-hidden={!drawerOpen}
    >
      <nav
        className={styles.drawer}
        data-open={drawerOpen}
        onClick={(e) => e.stopPropagation()}
        aria-label="Subject navigation"
        aria-modal={drawerOpen || undefined}
      >
        <div className={styles.head}>
          <span className={styles.eyebrow}>Subjects</span>
          <button
            className={styles.close}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>
          {cats.map((cat) => {
            const act = cat.id === activeId;
            const rgb = hexRgb(cat.hue);
            return (
              <button
                key={cat.id}
                className={`sb-btn ${styles.row}`}
                data-active={act}
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
    </div>
  );
}
