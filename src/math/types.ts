/**
 * Math Fingerprinting Types
 *
 * Type definitions for floating-point precision fingerprinting.
 */

/**
 * Result of a single math function test.
 *
 * Compares the actual result against known browser-specific values.
 */
export interface MathTestResult {
  /** The actual computed result */
  result: number;
  /** Whether result matches Chrome's expected value */
  chrome: boolean;
  /** Whether result matches Firefox's expected value */
  firefox: boolean;
  /** Whether result matches Tor Browser's expected value */
  torBrowser: boolean;
  /** Whether result matches Safari's expected value */
  safari: boolean;
}

/**
 * Math fingerprint result.
 *
 * Contains results of all math function tests.
 */
export interface MathFingerprint {
  /** Map of test name to result */
  data: Record<string, MathTestResult | undefined>;
  /** Whether tampering was detected */
  lied: boolean;
}

/**
 * Test case definition for a math function.
 *
 * Format: [functionName, args, displayName, chromeResult, firefoxResult, torResult, safariResult]
 * NaN values indicate the browser doesn't have a known distinct value.
 */
export type MathTestCase = [
  string, // Function name or 'polyfill'
  number[] | number, // Arguments or polyfill value
  string, // Display name
  number, // Chrome expected value
  number, // Firefox expected value (NaN if same as Chrome)
  number, // Tor Browser expected value (NaN if same as Chrome)
  number, // Safari expected value (NaN if same as Chrome)
];
