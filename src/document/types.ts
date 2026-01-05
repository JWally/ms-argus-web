/**
 * Document Fingerprinting Types
 *
 * Type definitions for HTML element property enumeration.
 */

/**
 * HTML element version fingerprint result.
 *
 * Contains the enumerated properties of document.documentElement,
 * which vary by browser and version.
 */
export interface HTMLElementVersionFingerprint {
  /** All enumerable properties on document.documentElement */
  keys: string[];
}
