/**
 * Canvas Fingerprinting Constants
 *
 * This file contains known canvas fingerprint patterns and configuration
 * values used to identify browser engines and detect tampering.
 *
 * ## How canvas fingerprinting works:
 * Canvas fingerprinting exploits the fact that identical drawing operations
 * produce slightly different pixel-level results across browsers/GPUs due to:
 * - Different anti-aliasing algorithms
 * - GPU rendering differences
 * - Font rendering variations
 * - Floating-point precision differences
 */

/**
 * Known legitimate low-entropy image data patterns by browser engine.
 *
 * These are the raw pixel values from a simple test pattern:
 * - 2x2 canvas with black fill, white pixel, and arc
 * - Format: RGBA values concatenated as string
 *
 * Used to detect if canvas rendering is being modified/spoofed.
 * If a browser claims to be Blink but produces Gecko patterns, that's suspicious.
 */
export const KNOWN_IMAGE_DATA: Record<string, string[]> = {
  /**
   * Chrome, Edge, Opera (Blink engine)
   * Characterized by specific anti-aliasing calculations
   */
  BLINK: [
    '255255255255178178178255246246246255555555255',
    '255255255255192192192255240240240255484848255',
    '255255255255177177177255246246246255535353255',
    '255255255255128128128255191191191255646464255',
    '255255255255178178178255247247247255565656255',
    '255255255255174174174255242242242255474747255',
    '255255255255229229229255127127127255686868255',
    '255255255255192192192255244244244255535353255',
  ],

  /**
   * Firefox (Gecko engine)
   * Different anti-aliasing produces distinct patterns
   */
  GECKO: [
    '255255255255191191191255207207207255646464255',
    '255255255255192192192255240240240255484848255',
    '255255255255191191191255239239239255646464255',
    '255255255255191191191255223223223255606060255',
    '255255255255171171171255223223223255606060255',
    '255255255255188188188255245245245255525252255',
  ],

  /**
   * Safari (WebKit engine)
   * WebKit's rendering produces its own characteristic patterns
   */
  WEBKIT: [
    '255255255255185185185255233233233255474747255',
    '255255255255185185185255229229229255474747255',
    '255255255255185185185255218218218255474747255',
    '255255255255192192192255240240240255484848255',
    '255255255255178178178255247247247255565656255',
    '255255255255178178178255247247247255565656255',
    '255255255255192192192255240240240255484848255',
    '255255255255186186186255218218218255464646255',
  ],
};

/**
 * Color palette for "Picasso-like" canvas fingerprinting.
 *
 * These colors are drawn with seeded random positions to create
 * a deterministic visual pattern. The specific colors chosen affect
 * how different GPUs/browsers render gradients and shadows.
 */
export const PICASSO_COLORS = [
  '#FF6633',
  '#FFB399',
  '#FF33FF',
  '#FFFF99',
  '#00B3E6',
  '#E6B333',
  '#3366E6',
  '#999966',
  '#99FF99',
  '#B34D4D',
  '#80B300',
  '#809900',
  '#E6B3B3',
  '#6680B3',
  '#66991A',
  '#FF99E6',
  '#CCFF1A',
  '#FF1A66',
  '#E6331A',
  '#33FFCC',
  '#66994D',
  '#B366CC',
  '#4D8000',
  '#B33300',
  '#CC80CC',
  '#66664D',
  '#991AFF',
  '#E666FF',
  '#4DB3FF',
  '#1AB399',
  '#E666B3',
  '#33991A',
  '#CC9999',
  '#B3B31A',
  '#00E680',
  '#4D8066',
  '#809980',
  '#E6FF80',
  '#1AFF33',
  '#999933',
  '#FF3380',
  '#CCCC00',
  '#66E64D',
  '#4D80CC',
  '#9900B3',
  '#E64D66',
  '#4DB380',
  '#FF4D4D',
  '#99E6E6',
  '#6666FF',
] as const;

/**
 * Configuration for the Picasso canvas painting algorithm.
 *
 * These values control the seeded random number generator that
 * determines where shapes are drawn. They produce a deterministic
 * output for the same seed, allowing consistent fingerprinting.
 */
export const PICASSO_CONFIG = {
  /** Initial seed for the pseudo-random number generator */
  SEED: 500,

  /** Offset value for PRNG calculation (prime number for better distribution) */
  OFFSET: 2001000001,

  /** Multiplier for linear congruential generator */
  MULTIPLIER: 15000,

  /** Number of drawing rounds (more rounds = more complex pattern) */
  ROUNDS: 10,

  /** Maximum blur for shadow effects */
  MAX_SHADOW_BLUR: 50,
} as const;

/**
 * Canvas size configuration.
 *
 * Different sizes are used for different tests to balance
 * fingerprint uniqueness against performance.
 */
export const CANVAS_SIZES = {
  /** Size for noise detection tests (smaller for speed) */
  NOISE_DETECTION: 8,

  /** Visual multiplier for noise detection display */
  NOISE_VISUAL_MULTIPLIER: 5,

  /** Default max canvas size for painting */
  DEFAULT_MAX: 75,

  /** Reduced size for WebKit (more stable results) */
  WEBKIT_MAX: 50,

  /** Size for text rendering tests */
  TEXT_SIZE: 50,
} as const;
