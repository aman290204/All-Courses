/**
 * FolderRow.tsx — Recursive row in the archive folder tree.
 *
 * Ported VERBATIM from public/index.html lines 622-655 (legacy `TreeNode`).
 * Behaviour preserved exactly:
 *   - Open/close state persisted in `memoryStore.expandedIds` (Phase 5).
 *   - `isOpen = forceOpen || open || (!!q && childMatch)` — search auto-opens
 *     any branch that contains a match.
 *   - Visibility: a row is rendered iff query is empty, the row itself
 *     matches, or any descendant matches.
 *   - Padding-left is `depth * 16 + 16`, expressed via the `--depth` custom
 *     property (Rule 18 exception — single typed CSS channel).
 *   - Children container indents `pad + 10 = depth * 16 + 26` and inherits
 *     the same `--depth` channel.
 *   - Synthetic intermediate nodes (`id.startsWith('syn_')`) — Rule 22 —
 *     do NOT render a Drive link, since they have no Drive folder ID.
 *
 * Rule 17: children are keyed off the stable `node.id` (never array index).
 * Rule 24: rendered height is a pure function of props — no DOM measurement.
 *
 * Wrapped in `React.memo` to bound rerender scope when the parent CatBlock
 * rerenders for unrelated reasons (e.g. ambient color drift).
 */
import { memo, type CSSProperties, type JSX, type KeyboardEvent, type MouseEvent } from 'react';
import type { ArchiveNode } from '@/types/archive';
import { useMemoryStore } from '@/stores/memoryStore';
import { nodeHasMatch } from '@/utils/tree';
import { Highlight } from './Highlight';
import styles from './FolderRow.module.css';

export interface FolderRowProps {
  readonly node: ArchiveNode;
  /** 0 at top-level child of a category; +1 per nesting level. */
  readonly depth: number;
  /** Lowercase search query — empty string disables filtering. */
  readonly q: string;
  /** When true, every branch renders expanded regardless of search/open state. */
  readonly forceOpen: boolean;
}

function FolderRowImpl({ node, depth, q, forceOpen }: FolderRowProps): JSX.Element | null {
  const open = useMemoryStore((s) => s.expandedIds.includes(node.id));
  const toggleExpanded = useMemoryStore((s) => s.toggleExpanded);

  const has = !!node.children?.length;
  const childMatch = has && (node.children?.some((c) => nodeHasMatch(c, q)) ?? false);
  const selfMatch = !!q && node.name.toLowerCase().includes(q);
  const visible = !q || selfMatch || childMatch;
  if (!visible) return null;

  const isOpen = forceOpen || open || (!!q && childMatch);
  const url = node.id && !node.id.startsWith('syn_')
    ? `https://drive.google.com/drive/folders/${node.id}`
    : null;

  // Rule 18 exception: single typed CSS custom-property channel for depth.
  const channel: CSSProperties = { '--depth': depth } as CSSProperties;

  const onRowClick = (): void => {
    if (has) toggleExpanded(node.id);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (has && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleExpanded(node.id);
    }
  };
  const stopLink = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.stopPropagation();
  };

  return (
    <div style={channel}>
      <div
        className={`tree-row ${styles.row}`}
        data-depth={depth}
        data-has={has ? 'true' : 'false'}
        data-open={isOpen ? 'true' : 'false'}
        onClick={onRowClick}
        onKeyDown={onKeyDown}
        {...(has ? { role: 'button', tabIndex: 0, 'aria-expanded': isOpen } : {})}
      >
        <span className={styles.name}>
          {has ? (
            <span className={styles.arrow} aria-hidden>›</span>
          ) : (
            <span className={styles.spacer} aria-hidden />
          )}
          <Highlight text={node.name} q={q} />
        </span>
        {has && <span className={styles.count}>{node.children?.length ?? 0}</span>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopLink}
            className={styles.goLink}
            title="Open in Drive"
            aria-label="Open in Google Drive"
          >
            ↗
          </a>
        )}
      </div>
      {has && isOpen && (
        <div className={`tree-children ${styles.children}`}>
          {node.children?.map((c) => (
            <FolderRow key={c.id} node={c} depth={depth + 1} q={q} forceOpen={forceOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

export const FolderRow = memo(FolderRowImpl);
