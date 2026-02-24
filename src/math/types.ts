/**
 * Math Fingerprinting Types
 *
 * Type definitions for floating-point precision fingerprinting.
 */

/**
 * A math test input: [functionName, args].
 *
 * For regular Math functions, args is number[].
 * For the polyfill test, args is a pre-computed number.
 */
export type MathTestInput = [string, number[] | number];

/**
 * Math fingerprint result.
 *
 * Contains raw computed values from all math function tests.
 */
export interface MathFingerprint {
  /** Ordered array of computed results (NaN for failed tests) */
  data: number[];
  /** IEEE 754 byte representation of test floats via shared ArrayBuffer */
  floatBytes: number[];
  /** Whether tampering was detected */
  lied: boolean;
}
