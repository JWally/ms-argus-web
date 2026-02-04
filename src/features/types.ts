/**
 * Feature Detection Types
 *
 * Type definitions for browser feature fingerprinting.
 *
 * NOTE: Version detection and lie analysis moved server-side.
 * See TODO-server-side-analysis.md for server requirements.
 */

/**
 * Engine features fingerprint result.
 *
 * Contains raw feature lists for server-side version detection.
 */
export interface EngineFeaturesFingerprint {
  /** Raw CSS property names from computed style */
  cssKeys: string[];

  /** Raw window property names */
  windowKeys: string[];

  /** Raw JavaScript core feature names */
  jsKeys: string[];

  /** Engine hint: 'Blink' | 'Gecko' | 'Unknown' */
  engine: string;

  /** Hash of cssKeys for fingerprinting */
  cssKeysHash: string;

  /** Hash of windowKeys for fingerprinting */
  windowKeysHash: string;

  /** Hash of jsKeys for fingerprinting */
  jsKeysHash: string;
}

// Legacy types kept for reference - now handled server-side

/**
 * Represents differences between expected and actual feature lists.
 * Used for detecting version spoofing by comparing against MDN BCD data.
 *
 * @deprecated Version detection moved server-side. Will be removed in v2.0.
 * Implement this interface server-side using MDN BCD data for comparison.
 */
export interface FeatureListDiff {
  /** Features expected for the reported version but not present */
  removed: string[];
  /** Features present but not expected for the reported version */
  added: string[];
}

/**
 * Result of version detection from feature analysis.
 * Contains possible version matches based on feature fingerprint.
 *
 * @deprecated Version detection moved server-side. Will be removed in v2.0.
 * Implement version detection server-side using scripts/update-features-mdn.ts data.
 */
export interface VersionReport {
  /** All browser versions that match the observed features */
  versions: string[];
  /** Most likely specific version, or null if ambiguous */
  version: string | null;
}

/**
 * Result of version lie detection analysis.
 * Indicates whether the reported browser version matches actual capabilities.
 *
 * @deprecated Version lie detection moved server-side. Will be removed in v2.0.
 * Server-side implementation compares reported UA against feature-detected version.
 */
export interface FeatureLieResult {
  /** True if reported version doesn't match detected capabilities */
  versionLie: boolean;
  /** Detected version based on feature analysis */
  version: string | null;
  /** Range of possible versions if exact match not found */
  versionRange: string | null;
}
