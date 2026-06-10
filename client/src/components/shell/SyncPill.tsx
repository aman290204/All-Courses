/**
 * SyncPill.tsx — Live sync status indicator.
 *
 * Reads `syncInfo` (atomic) from dataStore and renders one of three
 * states — idle (gold/ok), syncing (warn pulse), error (err). The dot
 * animation cadence flips: 1s while syncing, 3s while idle/err.
 *
 * Pure read; never writes. Display logic ported from public/index.html
 * lines 979-1005.
 */
import { useDataStore } from '@/stores/dataStore';
import { fmtIST } from '@/utils/format';
import styles from './SyncPill.module.css';

type Tone = 'ok' | 'syncing' | 'err';

const LABELS: Record<Tone, string> = {
  ok: 'Indexed & Synced',
  syncing: 'Syncing…',
  err: 'Sync error',
};

export function SyncPill(): JSX.Element {
  const syncInfo = useDataStore((s) => s.syncInfo);
  const tree = useDataStore((s) => s.tree);

  // isSyncing is the authoritative flag — lastSyncStatus stays stale (previous
  // value) while Python is running; it's only updated when sync completes.
  const isSyncing = syncInfo?.isSyncing ?? false;
  const status = syncInfo?.lastSyncStatus ?? '';
  const tone: Tone = isSyncing
    ? 'syncing'
    : (status.startsWith('err') || status.startsWith('fail') || status.startsWith('spawn'))
      ? 'err'
      : 'ok';

  const ts = syncInfo?.lastSyncTime ?? tree?.stats.lastUpdated ?? null;
  const label = LABELS[tone];
  const formatted = fmtIST(ts);

  return (
    <div
      className={styles.pill}
      data-tone={tone}
      title={formatted ? `Last sync: ${formatted}` : label}
    >
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.stack}>
        <span className={styles.label}>{label}</span>
        {formatted && <span className={styles.ts}>{formatted}</span>}
      </div>
    </div>
  );
}
