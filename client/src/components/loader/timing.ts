/**
 * Loader timing — single source of truth for the Vault Reveal cinematic.
 *
 * Canonical reference: LOADER_BASELINE.md §4.
 * Every ms value used by loader.module.css originates here and is injected
 * as a CSS custom property at mount time. Hardcoded ms values inside the
 * loader CSS module are forbidden (grep gate in CI per §13.4).
 *
 * The loader is exempt from the four-durations motion rule (MIGRATION_RULES.md
 * rule 29) — this file is the loader's own pacing language.
 */

export const LOADER_TIMING = {
  // Sigil
  SIGIL_EMERGE_DELAY: 400,
  SIGIL_EMERGE_DURATION: 1100,
  HALO_DELAY: 1400,
  HALO_DURATION: 3600,

  // Ring sweeps (both 4.6s infinite, r2 offset)
  RING_DELAY: 900,
  RING_DURATION: 4600,
  RING_R2_DELAY: 2900,

  // Wordmark
  WORDMARK_DELAY: 1100,
  WORDMARK_DURATION: 1200,
  WORDMARK_W2_DELAY: 1240,

  // Tagline
  TAGLINE_DELAY: 1750,
  TAGLINE_DURATION: 700,

  // Divider
  DIVIDER_DELAY: 2050,
  DIVIDER_DURATION: 600,

  // Status lines (uniform duration, staggered start)
  STATUS_DURATION: 560,
  STATUS_S1_DELAY: 2150,
  STATUS_S2_DELAY: 2600,
  STATUS_S3_DELAY: 3100,
  STATUS_S4_DELAY: 3650,

  // Credit
  CREDIT_DELAY: 4450,
  CREDIT_DURATION: 900,

  // Coordination
  MIN_CINEMATIC_TIME: 4900,
  DISSOLVE_DURATION: 820,

  // Reduced-motion instant — matches legacy 0.001ms; used by @media query
  INSTANT_DURATION: 0.001,
} as const;

export type LoaderTimingKey = keyof typeof LOADER_TIMING;
