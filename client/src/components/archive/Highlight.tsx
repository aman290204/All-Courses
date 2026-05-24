/**
 * Highlight.tsx — Inline match highlighter.
 *
 * Wraps every occurrence of `q` in a <mark>. Returns the original text
 * untouched when `q` is empty or no match exists.
 *
 * Ported VERBATIM from public/index.html lines 615-620 (the legacy `Hl`
 * component). Phase 7: now highlights ALL occurrences instead of only
 * the first. Inline mark styling lives in Highlight.module.css (Rule 18).
 */
import type { JSX } from 'react';
import styles from './Highlight.module.css';

export interface HighlightProps {
  readonly text: string;
  /** Lowercase query — empty string disables highlighting entirely. */
  readonly q: string;
}

export function Highlight({ text, q }: HighlightProps): JSX.Element {
  if (!q) return <>{text}</>;

  const lower = text.toLowerCase();
  const segments: JSX.Element[] = [];
  let cursor = 0;
  let key = 0;

  for (;;) {
    const idx = lower.indexOf(q, cursor);
    if (idx === -1) break;
    if (idx > cursor) segments.push(<span key={key++}>{text.slice(cursor, idx)}</span>);
    segments.push(
      <mark key={key++} className={styles.mark}>
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
  }

  if (segments.length === 0) return <>{text}</>;
  if (cursor < text.length) segments.push(<span key={key++}>{text.slice(cursor)}</span>);
  return <>{segments}</>;
}
