/**
 * CatBlock.tsx — One of the 17 top-level subject categories.
 *
 * Ported VERBATIM from public/index.html lines 657-720. Behaviour preserved:
 *   - Self-owned `hovered` no longer needed — the hover lift is now a pure
 *     CSS `:hover` rule (CatBlock.module.css), narrower in scope.
 *   - `show = isFocused || forceOpen || (!!q && catHasMatch)` — search auto-
 *     opens any category that contains a match.
 *   - `isDimmed = anyFocused && !isFocused && !forceOpen` — siblings of a
 *     focused category fade and become pointer-events:none (archive.css).
 *   - Per-category accent is keyed via the `--cat-rgb`, `--accent`, and
 *     `--size-pct` custom-property channels written in a SINGLE inline
 *     style object — the documented Rule 18 exception.
 *   - Clicking the category toggles focus (click-to-pin); hovering pushes
 *     `cat.id` into `useUIStore.activeId` so the ambient layer samples the
 *     correct hue.
 *   - Rule 17: child rows are keyed off the stable `n.id` (never index).
 *   - Rule 22: when `cat.driveId` is empty, no Drive link is rendered.
 */
import type { CSSProperties, JSX, MouseEvent } from 'react';
import type { Category } from '@/types/archive';
import { useUIStore } from '@/stores/uiStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { fmtNum } from '@/utils/format';
import { hexRgb } from '@/utils/format';
import { catHasMatch } from '@/utils/tree';
import { Highlight } from './Highlight';
import { FolderRow } from './FolderRow';
import styles from './CatBlock.module.css';

export interface CatBlockProps {
  readonly cat: Category;
  /** Largest category size in GB — drives the bottom size-bar width. */
  readonly maxSizeGB: number;
}

export function CatBlock({ cat, maxSizeGB }: CatBlockProps): JSX.Element | null {
  const query = useUIStore((s) => s.query);
  const focusedId = useUIStore((s) => s.focusedId);
  const forceOpen = useUIStore((s) => s.forceOpen);
  const setFocusedId = useUIStore((s) => s.setFocusedId);
  const setActiveId = useUIStore((s) => s.setActiveId);
  const setActiveCategoryId = useMemoryStore((s) => s.setActiveCategoryId);

  // Visibility gate at parent level too, but keep this short-circuit for safety.
  if (!catHasMatch(cat, query)) return null;

  const isFocused = focusedId === cat.id;
  const anyFocused = focusedId !== null;
  const show = isFocused || forceOpen || (!!query && catHasMatch(cat, query));
  const isDimmed = anyFocused && !isFocused && !forceOpen;

  const rgb = hexRgb(cat.hue);
  const url = cat.driveId ? `https://drive.google.com/drive/folders/${cat.driveId}` : null;
  const sizePct = maxSizeGB
    ? Math.min(100, Math.max(4, ((cat.sizeGB || 0) / maxSizeGB) * 100))
    : 0;

  // Rule 18 exception — single typed CSS custom-property channel object.
  const channel: CSSProperties = {
    '--cat-rgb': rgb,
    '--accent': `rgba(${rgb}, 0.55)`,
    '--size-pct': `${sizePct}%`,
  } as CSSProperties;

  const onFocusClick = (): void => {
    const next = isFocused ? null : cat.id;
    setFocusedId(next);
    if (next !== null) setActiveCategoryId(next);
  };
  const onEnter = (): void => {
    setActiveId(cat.id);
  };
  const stopLink = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.stopPropagation();
  };

  const blockClass = [
    'cat-block',
    styles.block,
    show ? 'is-open' : '',
    isFocused ? 'is-focused' : '',
    isDimmed ? 'is-dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={`cat-${cat.id}`}
      className={blockClass}
      data-open={show ? 'true' : 'false'}
      data-focused={isFocused ? 'true' : 'false'}
      data-dimmed={isDimmed ? 'true' : 'false'}
      style={channel}
      onMouseEnter={onEnter}
    >
      <button
        type="button"
        onClick={onFocusClick}
        className={`cat-btn ${styles.button}`}
        aria-expanded={show}
      >
        <div className={`archive-label ${styles.label}`}>{cat.id}</div>
        <div className={styles.body}>
          <div className={`cat-name ${styles.name}`}>
            <Highlight text={cat.name} q={query} />
          </div>
          <div className={styles.meta}>
            <span className={styles.metaFolders}>{fmtNum(cat.count)} folders</span>
            <span className={styles.metaDot} aria-hidden />
            <span className={styles.metaSize}>{cat.size}</span>
          </div>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopLink}
            className={styles.go}
            title="Open in Google Drive"
            aria-label="Open in Google Drive"
          >
            ↗
          </a>
        )}
        <span aria-hidden className={styles.chevron}>⌄</span>
      </button>
      {sizePct > 0 && (
        <div className="size-bar">
          <span />
        </div>
      )}
      {show && (
        <div className={`tree-children ${styles.children}`}>
          {cat.children.map((n) => (
            <FolderRow key={n.id} node={n} depth={0} q={query} forceOpen={forceOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
