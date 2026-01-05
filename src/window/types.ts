/**
 * Window Features Fingerprinting Types
 *
 * Type definitions for window object property enumeration.
 */

/**
 * Window features fingerprint result.
 */
export interface WindowFeaturesFingerprint {
  /** All enumerable property names on the window object */
  keys: string[];
  /** Count of Apple-prefixed properties (ApplePaySession, etc.) */
  apple: number;
  /** Count of moz-prefixed properties (Firefox-specific) */
  moz: number;
  /** Count of webkit-prefixed properties */
  webkit: number;
}
