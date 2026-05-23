/**
 * Footer.tsx — End-of-archive vault footer.
 *
 * Ported from public/index.html lines 1078-1093. Reads tree stats
 * atomically from dataStore; safe to render before stats arrive (uses
 * em-dash placeholder).
 */
import { useDataStore } from '@/stores/dataStore';
import { fmtNum } from '@/utils/format';
import styles from './Footer.module.css';

export function Footer(): JSX.Element {
  const stats = useDataStore((s) => s.tree?.stats);

  return (
    <footer className={`vault-footer ${styles.footer}`}>
      <div className={styles.eyebrow}>── End of Archive ──</div>
      <img
        src="/Logo-with-Name.png"
        alt="Cortexa Vault"
        draggable={false}
        className={styles.logo}
      />
      <div className={styles.tagline}>Curated for Curious Minds</div>
      <div className={styles.counts}>
        {stats?.fileCount ? fmtNum(stats.fileCount) : '—'} <span className={styles.dim}>Files</span>
        <span className={styles.sep}>·</span>
        {fmtNum(stats?.totalFolders)} <span className={styles.dim}>Folders</span>
        <span className={styles.sep}>·</span>
        {stats?.totalSize ?? '—'}
      </div>
      <div className={styles.quote}>&ldquo;Curated knowledge compounds forever.&rdquo;</div>
      <div className={styles.byline}>
        Crafted &amp; Curated by <span className={styles.who}>Aman Agrahari</span>
      </div>
    </footer>
  );
}
