/**
 * AmbientLayer.tsx — Renders the two fixed atmosphere layers.
 *
 * MIGRATION_RULES.md Rule 18: no inline styles in new components. The
 * gradients consume `var(--accent-rgb)` via classes defined in
 * `client/src/styles/atmosphere.css`. This component is pure JSX — it
 * never writes `--accent-rgb` (see AmbientController for the sole writer).
 *
 * Layer order (back to front):
 *  1. .ambient-layer  — soft radial accent glows top-left + bottom-right
 *  2. .archive-grid   — faint 64px grid with elliptical mask
 *
 * Both are `position: fixed; inset: 0; pointer-events: none;` and sit at
 * z-index `--z-atmosphere` (0), behind every interactive surface.
 */

export function AmbientLayer(): JSX.Element {
  return (
    <>
      <div className="ambient-layer" aria-hidden="true" />
      <div className="archive-grid" aria-hidden="true" />
    </>
  );
}
