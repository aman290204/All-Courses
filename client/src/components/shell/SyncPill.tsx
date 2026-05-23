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

function classify(status: string): Tone {
  if (status.startsWith('syncing') || status.startsWith('running')) return 'syncing';
  if (status.startsWith('err') || status.startsWith('fail')) return 'err';
  return 'ok';
}

const LABELS: Record<Tone, string> = {
  ok: 'Indexed & Synced',
  syncing: 'Syncing…',
  err: 'Sync error',
};

export function SyncPill(): JSX.Element {
  const syncInfo = useDataStore((s) => s.syncInfo);
  const tree = useDataStore((s) => s.tree);
  const tone = classify(syncInfo?.lastSyncStatus ?? '');
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
