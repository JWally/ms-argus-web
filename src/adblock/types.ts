/**
 * Ad Blocker Detection Types
 *
 * Type definitions for ad blocker filter list detection.
 */

/**
 * Ad blocker detection fingerprint result.
 *
 * Probes CSS selectors targeted by major filter lists to detect
 * which ad blocker (if any) is active and which lists are enabled.
 */
export interface AdBlockFingerprint {
  /** Whether any ad blocker was detected */
  detected: boolean;
  /** Number of probe elements that were blocked */
  blockedCount: number;
  /** Total number of probe elements tested */
  totalTested: number;
  /** Hash of the bitmask of which filter lists matched */
  filterListSignature: string;
  /** Per-list detection results */
  lists: Record<string, boolean>;
}
