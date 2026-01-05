/**
 * SVG Fingerprinting Types
 *
 * Type definitions for SVG-based fingerprinting.
 */

/**
 * SVG fingerprint result.
 */
export interface SVGFingerprint {
  /** Sum of SVG bounding box dimensions */
  bBox: number;
  /** Sum of getExtentOfChar() dimensions */
  extentOfChar: number;
  /** Result of getSubStringLength() */
  subStringLength: number;
  /** Result of getComputedTextLength() */
  computedTextLength: number;
  /** Unique emojis based on distinct text length patterns */
  emojiSet: string[];
  /** Sum of unique emoji text lengths */
  svgrectSystemSum: number;
  /** Whether tampering was detected */
  lied: boolean;
}
