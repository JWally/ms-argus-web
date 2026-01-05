/**
 * DOMRect Fingerprinting Types
 *
 * Type definitions for client rectangle fingerprinting.
 */

/**
 * Native representation of a DOMRect.
 */
export interface NativeRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  width: number;
  top: number;
  x: number;
  y: number;
}

/**
 * DOMRect fingerprint result.
 */
export interface DOMRectFingerprint {
  /** Rects from Element.getClientRects() */
  elementClientRects: NativeRect[];
  /** Rects from Element.getBoundingClientRect() */
  elementBoundingClientRect: NativeRect[];
  /** Rects from Range.getClientRects() */
  rangeClientRects: NativeRect[];
  /** Rects from Range.getBoundingClientRect() */
  rangeBoundingClientRect: NativeRect[];
  /** Unique emojis based on distinct bounding box dimensions */
  emojiSet: string[];
  /** Sum of unique emoji dimensions for fingerprinting */
  domrectSystemSum: number;
  /** Whether tampering was detected */
  lied: boolean;
}
