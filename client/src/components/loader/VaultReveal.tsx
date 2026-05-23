import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LOADER_TIMING } from "./timing";
import styles from "./loader.module.css";

interface VaultRevealProps {
  /** True while upstream data is still loading. Dissolve waits for this AND
   *  the minimum cinematic timer. Matches legacy semantics from
   *  LOADER_BASELINE.md §9. */
  loading: boolean;
  /** Fired once the dissolve completes and the loader is ready to unmount. */
  onReveal?: () => void;
}

/**
 * loaderCssVars — CSS custom properties injected at mount, sourced from
 * LOADER_TIMING. This is the documented Phase 2 contract (LOADER_BASELINE.md §4)
 * and the single deliberate exception to MIGRATION_RULES.md rule 18; the
 * cascade lets loader.module.css stay free of hardcoded ms literals while
 * timing.ts remains the only timing authority.
 */
const loaderCssVars: CSSProperties = {
  ["--ld-sigil-delay" as string]: `${LOADER_TIMING.SIGIL_EMERGE_DELAY}ms`,
  ["--ld-sigil-duration" as string]: `${LOADER_TIMING.SIGIL_EMERGE_DURATION}ms`,
  ["--ld-halo-delay" as string]: `${LOADER_TIMING.HALO_DELAY}ms`,
  ["--ld-halo-duration" as string]: `${LOADER_TIMING.HALO_DURATION}ms`,
  ["--ld-ring-delay" as string]: `${LOADER_TIMING.RING_DELAY}ms`,
  ["--ld-ring-duration" as string]: `${LOADER_TIMING.RING_DURATION}ms`,
  ["--ld-ring-r2-delay" as string]: `${LOADER_TIMING.RING_R2_DELAY}ms`,
  ["--ld-wordmark-delay" as string]: `${LOADER_TIMING.WORDMARK_DELAY}ms`,
  ["--ld-wordmark-duration" as string]: `${LOADER_TIMING.WORDMARK_DURATION}ms`,
  ["--ld-wordmark-w2-delay" as string]: `${LOADER_TIMING.WORDMARK_W2_DELAY}ms`,
  ["--ld-tagline-delay" as string]: `${LOADER_TIMING.TAGLINE_DELAY}ms`,
  ["--ld-tagline-duration" as string]: `${LOADER_TIMING.TAGLINE_DURATION}ms`,
  ["--ld-divider-delay" as string]: `${LOADER_TIMING.DIVIDER_DELAY}ms`,
  ["--ld-divider-duration" as string]: `${LOADER_TIMING.DIVIDER_DURATION}ms`,
  ["--ld-status-duration" as string]: `${LOADER_TIMING.STATUS_DURATION}ms`,
  ["--ld-status-s1-delay" as string]: `${LOADER_TIMING.STATUS_S1_DELAY}ms`,
  ["--ld-status-s2-delay" as string]: `${LOADER_TIMING.STATUS_S2_DELAY}ms`,
  ["--ld-status-s3-delay" as string]: `${LOADER_TIMING.STATUS_S3_DELAY}ms`,
  ["--ld-status-s4-delay" as string]: `${LOADER_TIMING.STATUS_S4_DELAY}ms`,
  ["--ld-credit-delay" as string]: `${LOADER_TIMING.CREDIT_DELAY}ms`,
  ["--ld-credit-duration" as string]: `${LOADER_TIMING.CREDIT_DURATION}ms`,
  ["--ld-dissolve-duration" as string]: `${LOADER_TIMING.DISSOLVE_DURATION}ms`,
  ["--ld-instant" as string]: `${LOADER_TIMING.INSTANT_DURATION}ms`,
};

/**
 * VaultReveal — the cinematic loader.
 *
 * State machine (legacy parity, LOADER_BASELINE.md §9):
 *   1. mount → start MIN_CINEMATIC_TIME timer (independent of fetch)
 *   2. timer fires → minTimeReached = true
 *   3. (minTimeReached && !loading && !exiting) → exiting = true
 *   4. DISSOLVE_DURATION after exiting → revealed = true → unmount + onReveal()
 *
 * Invariants:
 *   - The 4900ms timer starts at mount, NOT at fetch start or completion
 *   - exiting flips at most once
 *   - revealed flips at most once
 *   - The unmount timer matches the CSS transition duration exactly
 */
export default function VaultReveal({ loading, onReveal }: VaultRevealProps): JSX.Element | null {
  const [minTimeReached, setMinTimeReached] = useState<boolean>(false);
  const [exiting, setExiting] = useState<boolean>(false);
  const [revealed, setRevealed] = useState<boolean>(false);

  // Latest-ref pattern so the dissolve effect doesn't re-arm on every parent render.
  const onRevealRef = useRef<VaultRevealProps["onReveal"]>(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  // Step 1 + 2: mount the minimum cinematic timer.
  useEffect(() => {
    const id = window.setTimeout(() => setMinTimeReached(true), LOADER_TIMING.MIN_CINEMATIC_TIME);
    return () => window.clearTimeout(id);
  }, []);

  // Step 3: trigger dissolve once data settled AND cinematic timer done.
  useEffect(() => {
    if (exiting || revealed) return;
    if (!minTimeReached || loading) return;
    setExiting(true);
  }, [minTimeReached, loading, exiting, revealed]);

  // Step 4: after dissolve duration, mark revealed and notify parent.
  useEffect(() => {
    if (!exiting || revealed) return;
    const id = window.setTimeout(() => {
      setRevealed(true);
      onRevealRef.current?.();
    }, LOADER_TIMING.DISSOLVE_DURATION);
    return () => window.clearTimeout(id);
  }, [exiting, revealed]);

  if (revealed) return null;

  const rootClass = exiting
    ? `${styles.vaultReveal} ${styles.isExiting}`
    : styles.vaultReveal;

  return (
    <div
      className={rootClass}
      role="status"
      aria-label="Loading Cortexa Vault"
      style={loaderCssVars}
    >
      <span className={styles.vrRing} />
      <span className={`${styles.vrRing} ${styles.r2}`} />
      <div className={styles.vrSigil}>
        <img
          src="/Logo.png"
          alt=""
          aria-hidden={true}
          width={120}
          height={120}
          draggable={false}
        />
      </div>
      <div className={styles.vrBrand} aria-hidden={true}>
        <span className={styles.vrWord}>Cortexa</span>
        <span className={styles.vrGap} />
        <span className={`${styles.vrWord} ${styles.w2}`}>Vault</span>
      </div>
      <div className={styles.vrTagline}>Curated for Curious Minds</div>
      <div className={styles.vrDivider} />
      <div className={styles.vrStatusList} aria-hidden={true}>
        <div className={`${styles.vrStatus} ${styles.s1}`}>Indexing archive…</div>
        <div className={`${styles.vrStatus} ${styles.s2}`}>Restoring knowledge map…</div>
        <div className={`${styles.vrStatus} ${styles.s3}`}>Establishing secure connection…</div>
        <div className={`${styles.vrStatus} ${styles.s4}`}>Vault ready</div>
      </div>
      <div className={styles.vrCredit}>Crafted by Aman Agrahari</div>
    </div>
  );
}
