/**
 * ArchiveTree.tsx — Main archive surface: section label + CatBlock list +
 * footer. Renders the EmptyResults state when the active query filters all
 * 17 categories out.
 *
 * Subscriptions use atomic Zustand selectors per MIGRATION_RULES.md Rule 19
 * — never `useDataStore()` whole. The 17-category tree triggers fan-out
 * rerenders otherwise.
 *
 * Rule 17: categories are keyed off the stable `cat.id` (e.g. "01", "11").
 * Rule 32 visual-diff target: the section label + sorted list of cat-blocks
 * must match public/index.html for the same dataset.
 */
import type { JSX } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useUIStore } from '@/stores/uiStore';
import { catHasMatch } from '@/utils/tree';
import { Footer } from '@/components/shell/Footer';
import { CatBlock } from './CatBlock';
import { EmptyResults } from './EmptyResults';
import styles from './ArchiveTree.module.css';

export function ArchiveTree(): JSX.Element {
  const tree = useDataStore((s) => s.tree);
  const loading = useDataStore((s) => s.loading);
  const error = useDataStore((s) => s.error);
  const query = useUIStore((s) => s.query);

  if (loading && !tree) {
    return <div className={styles.loading}>Loading archive…</div>;
  }
  if (error && !tree) {
    return <div className={styles.error}>Failed to load archive: {error}</div>;
  }
  if (!tree) return <div className={styles.loading}>No archive data.</div>;

  const cats = tree.categories;
  const visible = cats.filter((c) => catHasMatch(c, query));
  const maxSizeGB = cats.reduce((m, c) => Math.max(m, c.sizeGB || 0), 0);

  return (
    <div className={styles.container}>
      {visible.length === 0 ? (
        <EmptyResults query={query} />
      ) : (
        <>
          <div className="section-label">Archive · {cats.length} categories</div>
          <div className={styles.list}>
            {visible.map((cat) => (
              <CatBlock key={cat.id} cat={cat} maxSizeGB={maxSizeGB} />
            ))}
          </div>
          <div className="scroll-fade" aria-hidden />
          <Footer />
        </>
      )}
    </div>
  );
}
