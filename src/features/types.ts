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
 * @deprecated Version detection moved server-side
 */
export interface FeatureListDiff {
  removed: string[];
  added: string[];
}

/**
 * @deprecated Version detection moved server-side
 */
export interface VersionReport {
  versions: string[];
  version: string | null;
}

/**
 * @deprecated Version lie detection moved server-side
 */
export interface FeatureLieResult {
  versionLie: boolean;
  version: string | null;
  versionRange: string | null;
}
