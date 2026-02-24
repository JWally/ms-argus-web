/**
 * MathML Layout Fingerprinting Types
 *
 * Type definitions for MathML element layout measurement.
 */

/**
 * Bounding rect dimensions for a MathML test element.
 */
export interface MathMLRect {
  width: number;
  height: number;
}

/**
 * MathML layout fingerprint result.
 *
 * Contains layout dimensions from rendering various MathML elements.
 * Different layout engines produce distinct dimensions for the same markup.
 */
export interface MathMLFingerprint {
  /** Whether the browser supports MathML rendering */
  supported: boolean;
  /** Bounding rects for each test element by name */
  rects: Record<string, MathMLRect>;
  /** Sum of all widths + heights (quick comparison value) */
  dimensionSum: number;
  /** Whether tampering was detected */
  lied: boolean;
}
