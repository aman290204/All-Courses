/**
 * tree.ts — Tree-walking predicates used by search filtering.
 *
 * Phase 3 — ported VERBATIM from public/index.html lines 612-613. The
 * predicates short-circuit on an empty query so the no-search render
 * path costs nothing.
 */

import type { ArchiveNode, Category } from '@/types/archive';

/**
 * Returns true when `node` or any descendant matches the lowercase query `q`.
 * Empty `q` is treated as "match everything".
 */
export function nodeHasMatch(n: ArchiveNode, q: string): boolean {
  if (!q) return true;
  if (n.name.toLowerCase().includes(q)) return true;
  return n.children?.some((c) => nodeHasMatch(c, q)) ?? false;
}

/**
 * Returns true when category name or any descendant folder matches `q`.
 * Empty `q` is treated as "match everything".
 */
export function catHasMatch(c: Category, q: string): boolean {
  if (!q) return true;
  if (c.name.toLowerCase().includes(q)) return true;
  return c.children?.some((n) => nodeHasMatch(n, q)) ?? false;
}
