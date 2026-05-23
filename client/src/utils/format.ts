/**
 * format.ts — Display formatters.
 *
 * Phase 3 — ported VERBATIM from public/index.html lines 607-610. Every
 * locale, every option object, every fallback character is identical so
 * pixel-equivalent visual diffs against legacy pass.
 *
 * Pure functions — no React, no side effects.
 */

/**
 * Hex color → "r,g,b" string suitable for direct interpolation into rgba().
 *
 * Used for per-category accent keying: `rgba(${hexRgb(cat.hue)}, 0.55)`.
 * Accepts 7-char hex (`#rrggbb`). No alpha channel.
 */
export function hexRgb(h: string): string {
  return `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`;
}

/**
 * Integer → en-IN locale string (Indian grouping: 1,23,456).
 * Returns `'—'` em-dash placeholder for null / undefined input.
 */
export function fmtNum(n: number | null | undefined): string {
  return n?.toLocaleString('en-IN') ?? '—';
}

/**
 * ISO timestamp → IST short timestamp ("23 May, 02:30 pm IST").
 * Returns null when input is null / empty.
 */
export function fmtIST(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return (
    new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  );
}

/**
 * ISO timestamp → relative ("just now" / "5m ago" / "2h ago" / "3d ago").
 * Returns null when input is null / empty.
 */
export function fmtRel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
