/**
 * archive.ts — Canonical type shapes for the archive data model.
 *
 * MIGRATION_RULES.md:
 *  - Rule 16: no `any` in shipped code.
 *  - Rule 21: stable IDs are the identity model — `id` is primary key,
 *    `path` is display-only.
 *  - Rule 23: `FlatNode` is the canonical render shape for the tree.
 *
 * The server response shape is captured by `ApiTree`. The in-memory render
 * shape is `FlatNode[]`. The atomic store value is `ArchiveNode` (recursive).
 */

/** Single node in the recursive archive tree, as returned by /api/tree. */
export interface ArchiveNode {
  /** Drive folder ID, or synthetic `syn_${fnv1a(...)}` for intermediate segments. */
  readonly id: string;
  /** Display name (cleaned of trailing size annotations server-side). */
  readonly name: string;
  /** Slash-joined path used for display only — never persisted as identity. */
  readonly path: string;
  /** Direct children. Absent → leaf node. */
  readonly children?: readonly ArchiveNode[];
}

/** One of the 17 top-level subject categories. */
export interface Category {
  /** Two-digit category prefix, e.g. "01". Stable across syncs. */
  readonly id: string;
  /** URL-safe slug derived from shortName. */
  readonly slug: string;
  /** Full display name, e.g. "Finance & Investing". */
  readonly name: string;
  /** Short name used in sidebar / drawer, e.g. "Finance". */
  readonly shortName: string;
  /** Accent color (hex `#rrggbb`) used to atmospherically key the category. */
  readonly hue: string;
  /** Direct folder count below this category. */
  readonly count: number;
  /** Size in GB (float). */
  readonly sizeGB: number;
  /** Pre-formatted human size string ("12.3 GB", "—"). */
  readonly size: string;
  /** Top-level Drive folder ID for this category, or empty for synthetic. */
  readonly driveId: string;
  /** First-level children of the category. */
  readonly children: readonly ArchiveNode[];
}

/** Aggregate stats — rendered in header desktop strip / mobile 2x2 grid. */
export interface ArchiveStats {
  readonly totalFolders: number;
  readonly totalCategories: number;
  readonly totalSizeGB: number;
  readonly totalSize: string;
  readonly lastUpdated: string;
  readonly recordCount: number;
  readonly fileCount: number | null;
}

/** Full /api/tree response. */
export interface ApiTree {
  readonly categories: readonly Category[];
  readonly stats: ArchiveStats;
}

/** Live sync status — /api/status. */
export interface SyncInfo {
  readonly lastSyncTime: string | null;
  readonly lastSyncStatus: string;
  readonly isSyncing: boolean;
  readonly cacheLoaded?: boolean;
  readonly stats?: ArchiveStats | null;
}

/**
 * Canonical render shape for the virtualised / virtualisable archive tree.
 *
 * `FolderRow` is engineered so its rendered height is a pure function of
 * the FlatNode fields below — no DOM measurement (rule 24). Future drop-in
 * for react-window happens against `FlatNode[]`.
 */
export interface FlatNode {
  /** Stable id — drives React `key`, scroll anchors, memory state. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Slash-joined path — display only. */
  readonly path: string;
  /** Nesting depth (0 = top-level child of a category). */
  readonly depth: number;
  /** True when this node has direct children. */
  readonly hasChildren: boolean;
  /** Direct child count (0 when `hasChildren` is false). */
  readonly childCount: number;
  /** Whether this node is currently expanded. */
  readonly expanded: boolean;
  /** Convenience back-pointer to the raw children for renderers that recurse. */
  readonly children: readonly ArchiveNode[] | undefined;
}
