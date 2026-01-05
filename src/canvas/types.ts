/**
 * Canvas Fingerprinting Types
 *
 * Type definitions for canvas fingerprinting data structures.
 */

/**
 * Result of pixel modification detection.
 *
 * This detects if privacy tools are injecting noise into canvas reads.
 * The test writes known pixel values and reads them back - any difference
 * indicates tampering.
 */
export interface PixelMods {
  /**
   * Which RGBA channels showed modifications.
   * Examples: "r", "rg", "rgb", "rgba"
   * undefined if no modifications detected.
   */
  rgba: string | undefined;

  /**
   * Number of pixels that were modified.
   * undefined if no modifications detected.
   */
  pixels: number | undefined;

  /**
   * Data URL of the visual representation showing modified pixels.
   * White pixels = unmodified, colored pixels = modified.
   */
  pixelImage: string;
}

/**
 * Configuration for the Picasso canvas painting algorithm.
 */
export interface PaintCanvasOptions {
  /** The canvas element to paint on */
  canvas: HTMLCanvasElement;

  /** The 2D rendering context */
  context: CanvasRenderingContext2D | null;

  /** Whether to include text stroke in the pattern */
  strokeText?: boolean;

  /** CSS font family string to use for text */
  cssFontFamily?: string;

  /** Canvas dimensions */
  area?: { width: number; height: number };

  /** Number of drawing iterations */
  rounds?: number;

  /** Maximum shadow blur radius */
  maxShadowBlur?: number;

  /** Seed for pseudo-random number generator */
  seed?: number;

  /** Offset for PRNG calculation */
  offset?: number;

  /** Multiplier for PRNG calculation */
  multiplier?: number;
}

/**
 * Internal state for the seeded random number generator.
 */
export interface PicassoSeed {
  /** Get the next pseudo-random value */
  getNextSeed: () => number;
}

/**
 * Complete canvas fingerprint result.
 */
export interface CanvasFingerprint {
  /**
   * Data URL of the main canvas fingerprint image.
   * This is the "Picasso-like" pattern with text.
   */
  dataURI: string;

  /**
   * Data URL of the paint-only fingerprint (no text).
   * Isolates GPU rendering differences from font differences.
   */
  paintURI: string;

  /**
   * Data URL from CPU-rendered canvas.
   * Comparing this to GPU render can detect GPU spoofing.
   */
  paintCpuURI: string;

  /**
   * Data URL of text rendering test.
   * Tests font rendering specifically.
   */
  textURI: string;

  /**
   * Data URL of emoji rendering test.
   * Emoji rendering varies significantly across OS/browser.
   */
  emojiURI: string;

  /**
   * Pixel modification detection results.
   * Non-null values indicate anti-fingerprinting tools.
   */
  mods: PixelMods | undefined;

  /**
   * Sum of text metrics for emoji set.
   * Combines multiple TextMetrics measurements into a fingerprint value.
   */
  textMetricsSystemSum: number;

  /**
   * Extended TextMetrics fingerprint data.
   * Includes baseline support detection and comprehensive font metrics.
   */
  textMetricsExtended: {
    /** Whether newer baseline properties (alphabeticBaseline, etc.) are supported */
    baselineSupport: boolean;
    /** Fingerprint of font metrics across multiple fonts and test strings */
    fontFingerprint: string;
    /** XOR hash of all collected metrics */
    metricsHash: string;
  };

  /**
   * Whether TextMetrics tampering was detected.
   * True if metrics contain suspicious floating-point values.
   */
  liedTextMetrics: boolean | undefined;

  /**
   * Unique emoji glyphs based on distinct rendering metrics.
   * Different platforms render emojis with different dimensions.
   */
  emojiSet: string[];

  /**
   * Whether any tampering/lies were detected in canvas APIs.
   */
  lied: boolean;
}
