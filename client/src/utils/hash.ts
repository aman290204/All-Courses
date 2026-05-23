/**
 * hash.ts — FNV-1a 32-bit hash for synthetic intermediate node IDs.
 *
 * MIGRATION_RULES.md rule 22: synthetic intermediate nodes use deterministic
 * IDs of shape `syn_${hash(parentId + '\0' + segmentName)}`. The hash function
 * lives here and is FNV-1a — small, fast, dependency-free, well-distributed
 * for short strings.
 *
 * Why FNV-1a: it is the algorithm originally specified in ARCHITECTURE_NOTES.
 * Stable IDs are the identity model (rule 21). Switching the hash function
 * would break persisted memory after Phase 4 lands.
 *
 * Pure, deterministic, zero allocations beyond the returned hex string.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash → 8-character lowercase hex.
 *
 * @param input — any string. Caller is responsible for delimiting fields with
 *                `'\0'` so `('ab','c')` and `('a','bc')` hash to different values.
 * @returns 8 lowercase hex chars (no leading prefix).
 */
export function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps multiplication in int32 range (avoids float overflow).
    hash = Math.imul(hash, FNV_PRIME);
  }
  // >>> 0 forces unsigned, then pad so result is always 8 hex chars.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Synthetic node ID for an intermediate folder that has no Drive ID of its own.
 *
 * Format: `syn_${fnv1a(parentId + '\0' + segmentName)}`.
 * Stable across renders and sessions for the same (parent, segment) pair.
 */
export function syntheticNodeId(parentId: string, segmentName: string): string {
  return `syn_${fnv1a(`${parentId}\0${segmentName}`)}`;
}
