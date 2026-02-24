/**
 * CSS Fingerprinting Types
 *
 * Type definitions for CSS-based fingerprinting.
 */

/**
 * Result of computing CSS style properties.
 */
export interface ComputedStyleResult {
  /** All CSS property names available */
  keys: string[];
  /** The interface name (e.g., "CSSStyleDeclaration") */
  interfaceName: string;
}

/**
 * System color value mapping.
 */
export interface SystemColorValue {
  [colorName: string]: string;
}

/**
 * System font value mapping.
 */
export interface SystemFontValue {
  [fontKeyword: string]: string;
}

/**
 * System styles (colors and fonts).
 *
 * These are OS-defined values that vary by platform and theme.
 */
export interface SystemStyles {
  /** System color keyword to actual RGB value */
  colors: SystemColorValue[];
  /** System font keyword to computed font value */
  fonts: SystemFontValue[];
}

/**
 * CSS fingerprint result.
 */
export interface CSSFingerprint {
  /** Computed style properties */
  computedStyle: ComputedStyleResult | undefined;
  /** System colors and fonts */
  system: SystemStyles | undefined;
  /** Named CSS color keyword → computed RGB value mapping */
  namedColors: Record<string, string> | undefined;
}
