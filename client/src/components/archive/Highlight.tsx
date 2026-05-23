/**
 * Highlight.tsx — Inline match highlighter.
 *
 * Splits the input text around the first lowercase occurrence of `q` and
 * wraps the match in a styled <mark>. Returns the original text untouched
 * when `q` is empty or no match exists.
 *
 * Ported VERBATIM from public/index.html lines 615-620 (the legacy `Hl`
 * component). Inline mark styling moved into Highlight.module.css to satisfy
 * Rule 18 (no inline style on new components).
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
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className={styles.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
