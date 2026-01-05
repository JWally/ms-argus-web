/**
 * Console Errors Fingerprinting Types
 *
 * Type definitions for JavaScript engine error message fingerprinting.
 */

/**
 * Console errors fingerprint result.
 *
 * Contains error messages from intentionally triggered JavaScript errors.
 * The exact wording varies by browser engine.
 */
export interface ConsoleErrorsFingerprint {
  /** Array of error messages from triggered JavaScript errors */
  errors: string[];
}
