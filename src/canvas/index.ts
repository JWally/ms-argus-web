/**
 * Canvas Fingerprinting Module
 *
 * This module generates a unique fingerprint based on how the browser renders
 * graphics through the Canvas 2D API. Canvas fingerprinting is one of the most
 * effective techniques because it captures differences in:
 *
 * - **GPU rendering**: Different GPUs produce subtly different pixels
 * - **Font rendering**: System fonts render differently across platforms
 * - **Anti-aliasing**: Browsers use different smoothing algorithms
 * - **Color management**: Color profiles and gamma correction vary
 *
 * ## How it works:
 * 1. Draw a complex pattern using shapes, gradients, text, and emojis
 * 2. Read back the pixel data and hash it
 * 3. Compare against known patterns to identify browser/platform
 * 4. Detect if anti-fingerprinting tools are modifying the output
 *
 * ## Tampering detection:
 * - **Pixel noise injection**: Privacy tools add random noise to pixel reads
 * - **TextMetrics tampering**: Metrics may be fuzzed with small random values
 * - **API lies**: Native functions may be wrapped to return fake values
 * - **Pattern mismatches**: Known image data doesn't match claimed browser
 *
 * ## References:
 * - Pixel mods detection inspired by: https://arkenfox.github.io/TZP/tests/canvasnoise.html
 * - Picasso algorithm based on: https://github.com/antoinevastel/picasso-like-canvas-fingerprinting
 *
 * @module canvas
 */

import { captureError } from '../errors';
import { lieProps, PHANTOM_DARKNESS, documentLie } from '../lies';
import { sendToTrash } from '../trash';
import {
  createTimer,
  queueEvent,
  LIKE_BRAVE,
  CSS_FONT_FAMILY,
  EMOJIS,
  logTestResult,
  IS_WEBKIT,
  IS_BLINK,
  Analysis,
  LowerEntropy,
  IS_GECKO,
} from '../utils/helpers';
import {
  KNOWN_IMAGE_DATA,
  PICASSO_COLORS,
  PICASSO_CONFIG,
  CANVAS_SIZES,
} from './constants';
import type {
  PixelMods,
  PaintCanvasOptions,
  PicassoSeed,
  CanvasFingerprint,
} from './types';

/**
 * Module-level variable to store the random input canvas for debugging.
 * This shows what random pixels were written before testing for modifications.
 */
let pixelImageRandom = '';

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Creates a seeded pseudo-random number generator.
 *
 * This uses a Linear Congruential Generator (LCG) which produces a deterministic
 * sequence of numbers for a given seed. This is crucial for canvas fingerprinting
 * because we need to draw the SAME pattern every time - but the pattern should
 * be complex enough to reveal rendering differences.
 *
 * The formula is: next = (multiplier * current) % offset
 *
 * @param seed - Initial seed value
 * @param offset - Modulus for the LCG (should be large prime-like number)
 * @param multiplier - Multiplier for the LCG
 * @returns Object with getNextSeed() method
 */
function createPicassoSeed(
  seed: number,
  offset: number,
  multiplier: number,
): PicassoSeed {
  let current = seed % offset;

  return {
    getNextSeed: () => {
      current = (multiplier * current) % offset;
      return current;
    },
  };
}

/**
 * Converts a seed value to a bounded result for drawing parameters.
 *
 * This normalizes the large PRNG output to usable canvas coordinates/sizes.
 * For example, if maxBound is 50 (canvas width), this converts the seed
 * to a value between 0 and 50.
 *
 * @param current - Current seed value from PRNG
 * @param offset - The offset used in PRNG
 * @param maxBound - Maximum value for the result
 * @param computeFloat - If true, returns float; otherwise floors to integer
 * @returns Bounded value for use in canvas drawing operations
 */
function patchSeed(
  current: number,
  offset: number,
  maxBound?: number,
  computeFloat?: boolean,
): number {
  const result = ((current - 1) / offset) * (maxBound || 1) || 0;
  return computeFloat ? result : Math.floor(result);
}

// ============================================================================
// CANVAS DRAWING PRIMITIVES
// ============================================================================

/**
 * Adds a radial gradient with random colors and positions.
 *
 * Gradients are particularly good for fingerprinting because:
 * - GPU interpolation algorithms vary between vendors
 * - Color blending differs subtly
 * - Gradient stops are calculated differently
 */
function addRandomCanvasGradient(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  colors: readonly string[],
  getNextSeed: () => number,
): void {
  const { width, height } = area;

  const canvasGradient = context.createRadialGradient(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
  );

  canvasGradient.addColorStop(
    0,
    colors[patchSeed(getNextSeed(), offset, colors.length)],
  );
  canvasGradient.addColorStop(
    1,
    colors[patchSeed(getNextSeed(), offset, colors.length)],
  );
  context.fillStyle = canvasGradient;
}

/**
 * Draws text outline at a random position.
 *
 * Text rendering is highly variable because it depends on:
 * - System font availability and fallbacks
 * - Font rasterization (TrueType, ClearType, etc.)
 * - Subpixel rendering settings
 * - Hinting algorithms
 */
function drawOutlineOfText(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  getNextSeed: () => number,
  cssFontFamily: string,
): void {
  const { width, height } = area;
  const fontSize = 2.99;

  context.font = `${height / fontSize}px ${cssFontFamily.replace(/!important/gm, '')}`;
  context.strokeText(
    '\uD83D\uDC7E A', // alien emoji + letter A
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
  );
}

/**
 * Creates a circular arc at a random position.
 *
 * Arcs test:
 * - Anti-aliasing algorithms (edge smoothing)
 * - Trigonometric calculation precision
 * - Sub-pixel positioning
 */
function createCircularArc(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  getNextSeed: () => number,
): void {
  const { width, height } = area;

  context.beginPath();
  context.arc(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, Math.min(width, height)),
    patchSeed(getNextSeed(), offset, 2 * Math.PI, true),
    patchSeed(getNextSeed(), offset, 2 * Math.PI, true),
  );
  context.stroke();
}

/**
 * Creates a Bezier curve at random control points.
 *
 * Bezier curves are excellent fingerprinting vectors because:
 * - Curve interpolation is computationally complex
 * - Different GPUs use different curve approximation algorithms
 * - Anti-aliasing along curves reveals rendering differences
 */
function createBezierCurve(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  getNextSeed: () => number,
): void {
  const { width, height } = area;

  context.beginPath();
  context.moveTo(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
  );
  context.bezierCurveTo(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
  );
  context.stroke();
}

/**
 * Creates a quadratic curve at random control points.
 *
 * Simpler than Bezier but still reveals rendering differences.
 */
function createQuadraticCurve(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  getNextSeed: () => number,
): void {
  const { width, height } = area;

  context.beginPath();
  context.moveTo(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
  );
  context.quadraticCurveTo(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
  );
  context.stroke();
}

/**
 * Creates an elliptical arc at random position.
 *
 * Ellipses are more complex than circles and test additional
 * GPU computation paths. Note: excluded from WebKit due to instability.
 */
function createEllipticalArc(
  context: CanvasRenderingContext2D,
  offset: number,
  area: { width: number; height: number },
  getNextSeed: () => number,
): void {
  // Not all browsers support ellipse - check first
  if (!('ellipse' in context)) {
    return;
  }

  const { width, height } = area;

  context.beginPath();
  context.ellipse(
    patchSeed(getNextSeed(), offset, width),
    patchSeed(getNextSeed(), offset, height),
    patchSeed(getNextSeed(), offset, Math.floor(width / 2)),
    patchSeed(getNextSeed(), offset, Math.floor(height / 2)),
    patchSeed(getNextSeed(), offset, 2 * Math.PI, true),
    patchSeed(getNextSeed(), offset, 2 * Math.PI, true),
    patchSeed(getNextSeed(), offset, 2 * Math.PI, true),
  );
  context.stroke();
}

// ============================================================================
// MAIN PAINTING FUNCTION
// ============================================================================

/**
 * Paints a complex "Picasso-like" pattern on a canvas.
 *
 * This is the core fingerprinting function. It draws a deterministic
 * pattern of shapes, gradients, and shadows that will render slightly
 * differently on different browser/GPU combinations.
 *
 * The pattern is "Picasso-like" because it uses abstract shapes at
 * seemingly random (but actually deterministic) positions.
 *
 * @param options - Configuration for painting
 */
function paintCanvas(options: PaintCanvasOptions): void {
  const {
    canvas,
    context,
    strokeText = false,
    cssFontFamily = '',
    area = { width: 50, height: 50 },
    rounds = PICASSO_CONFIG.ROUNDS,
    maxShadowBlur = PICASSO_CONFIG.MAX_SHADOW_BLUR,
    seed = PICASSO_CONFIG.SEED,
    offset = PICASSO_CONFIG.OFFSET,
    multiplier = PICASSO_CONFIG.MULTIPLIER,
  } = options;

  if (!context) {
    return;
  }

  // Clear and resize canvas
  context.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = area.width;
  canvas.height = area.height;

  // Hide canvas if it has a style property (i.e., in DOM)
  if (canvas.style) {
    canvas.style.display = 'none';
  }

  // Initialize the seeded PRNG
  const picassoSeed = createPicassoSeed(seed, offset, multiplier);
  const { getNextSeed } = picassoSeed;

  // Build array of drawing methods
  // Each method draws a different shape type for variety
  type DrawMethod = (
    ctx: CanvasRenderingContext2D,
    off: number,
    area: { width: number; height: number },
    seed: () => number,
  ) => void;

  const methods: DrawMethod[] = [
    createCircularArc,
    createBezierCurve,
    createQuadraticCurve,
  ];

  // Ellipse is unstable in WebKit - produces inconsistent results
  if (!IS_WEBKIT) {
    methods.push(createEllipticalArc);
  }

  // Text drawing if requested (adds font-based fingerprinting)
  if (strokeText) {
    methods.push((ctx, off, area, seed) =>
      drawOutlineOfText(ctx, off, area, seed, cssFontFamily),
    );
  }

  // Draw multiple rounds of random shapes with gradients and shadows
  for (let i = 0; i < rounds; i++) {
    // Add random gradient background
    addRandomCanvasGradient(context, offset, area, PICASSO_COLORS, getNextSeed);

    // Set random shadow (shadows interact with anti-aliasing)
    context.shadowBlur = patchSeed(getNextSeed(), offset, maxShadowBlur, true);
    context.shadowColor =
      PICASSO_COLORS[patchSeed(getNextSeed(), offset, PICASSO_COLORS.length)];

    // Draw a random shape type
    const nextMethod =
      methods[patchSeed(getNextSeed(), offset, methods.length)];
    nextMethod(context, offset, area, getNextSeed);

    // Fill the shape
    context.fill();
  }
}

// ============================================================================
// PIXEL MODIFICATION DETECTION
// ============================================================================

/**
 * Detects if pixel data is being modified by privacy tools.
 *
 * ## How it works:
 * 1. Create a canvas and fill it with known random pixel values
 * 2. Read back the pixel data via getImageData
 * 3. Compare what we wrote vs what we read
 * 4. Any difference indicates pixel noise injection
 *
 * Privacy tools like Canvas Blocker inject small random changes to
 * getImageData() results to prevent fingerprinting. This test detects
 * that interference.
 *
 * @returns Detection results or undefined if canvas blocked
 */
function getPixelMods(): PixelMods | undefined {
  const pattern1: string[] = [];
  const pattern2: string[] = [];
  const len = CANVAS_SIZES.NOISE_DETECTION;
  const alpha = 255;
  const visualMultiplier = CANVAS_SIZES.NOISE_VISUAL_MULTIPLIER;

  try {
    // Canvas options that encourage consistent rendering
    const options: CanvasRenderingContext2DSettings = {
      willReadFrequently: true,
      desynchronized: true,
    };

    // Create two sets of canvases:
    // - Display canvases: larger, for visual debugging
    // - Test canvases: small, for actual comparison
    const canvasDisplay1 = document.createElement('canvas');
    const canvasDisplay2 = document.createElement('canvas');
    const canvas1 = document.createElement('canvas');
    const canvas2 = document.createElement('canvas');
    const contextDisplay1 = canvasDisplay1.getContext('2d', options);
    const contextDisplay2 = canvasDisplay2.getContext('2d', options);
    const context1 = canvas1.getContext('2d', options);
    const context2 = canvas2.getContext('2d', options);

    if (!contextDisplay1 || !contextDisplay2 || !context1 || !context2) {
      throw new Error('canvas context blocked');
    }

    // Set dimensions
    canvasDisplay1.width = len * visualMultiplier;
    canvasDisplay1.height = len * visualMultiplier;
    canvasDisplay2.width = len * visualMultiplier;
    canvasDisplay2.height = len * visualMultiplier;
    canvas1.width = len;
    canvas1.height = len;
    canvas2.width = len;
    canvas2.height = len;

    // Step 1: Fill canvas1 with random pixels
    // We generate random RGB values and draw them pixel by pixel
    for (let x = 0; x < len; x++) {
      for (let y = 0; y < len; y++) {
        const red = ~~(Math.random() * 256);
        const green = ~~(Math.random() * 256);
        const blue = ~~(Math.random() * 256);
        const colors = `${red}, ${green}, ${blue}, ${alpha}`;

        // Draw to test canvas
        context1.fillStyle = `rgba(${colors})`;
        context1.fillRect(x, y, 1, 1);

        // Draw scaled-up version for visual debugging
        contextDisplay1.fillStyle = `rgba(${colors})`;
        contextDisplay1.fillRect(
          x * visualMultiplier,
          y * visualMultiplier,
          visualMultiplier,
          visualMultiplier,
        );

        pattern1.push(colors);
      }
    }

    // Step 2: Read canvas1 and write to canvas2
    // This tests the getImageData() -> fillRect() round-trip
    for (let x = 0; x < len; x++) {
      for (let y = 0; y < len; y++) {
        // Read what canvas1 reports as its pixel value
        const imageData = context1.getImageData(x, y, 1, 1);
        const [red, green, blue, readAlpha] = imageData?.data || [0, 0, 0, 0];
        const colors = `${red}, ${green}, ${blue}, ${readAlpha}`;

        // Write to canvas2
        context2.fillStyle = `rgba(${colors})`;
        context2.fillRect(x, y, 1, 1);

        // Read back from canvas2 for comparison
        const imageData2 = context2.getImageData(x, y, 1, 1);
        const [red2, green2, blue2, alpha2] = imageData2?.data || [0, 0, 0, 0];

        // Create visual diff: white if unchanged, colored if modified
        const displayColors = `
          ${red != red2 ? red2 : 255},
          ${green != green2 ? green2 : 255},
          ${blue != blue2 ? blue2 : 255},
          ${readAlpha != alpha2 ? alpha2 : 1}
        `;
        contextDisplay2.fillStyle = `rgba(${displayColors})`;
        contextDisplay2.fillRect(
          x * visualMultiplier,
          y * visualMultiplier,
          visualMultiplier,
          visualMultiplier,
        );

        pattern2.push(colors);
      }
    }

    // Step 3: Compare patterns and collect differences
    const patternDiffs: [number, string][] = [];
    const rgbaChannels = new Set<string>();

    for (let i = 0; i < pattern1.length; i++) {
      const pixelColor1 = pattern1[i];
      const pixelColor2 = pattern2[i];

      if (pixelColor1 !== pixelColor2) {
        const rgbaValues1 = pixelColor1.split(',');
        const rgbaValues2 = pixelColor2.split(',');

        // Identify which channels were modified
        const colors = [
          rgbaValues1[0] !== rgbaValues2[0] ? 'r' : '',
          rgbaValues1[1] !== rgbaValues2[1] ? 'g' : '',
          rgbaValues1[2] !== rgbaValues2[2] ? 'b' : '',
          rgbaValues1[3] !== rgbaValues2[3] ? 'a' : '',
        ].join('');

        rgbaChannels.add(colors);
        patternDiffs.push([i, colors]);
      }
    }

    // Store the random input image for debugging
    pixelImageRandom = canvasDisplay1.toDataURL();

    // Create output image showing modifications
    const pixelImage = canvasDisplay2.toDataURL();
    const rgba = rgbaChannels.size
      ? [...rgbaChannels].sort().join(', ')
      : undefined;
    const pixels = patternDiffs.length || undefined;

    return { rgba, pixels, pixelImage };
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

// ============================================================================
// TEXT METRICS ANALYSIS
// ============================================================================

/**
 * Detects if TextMetrics values contain suspicious floating-point noise.
 *
 * Legitimate TextMetrics values should be integers or clean floats.
 * Some privacy tools add small random decimals to these values.
 * For example, width might be 45.00001234 instead of 45.
 *
 * @param context - Canvas 2D context to test
 * @returns true if suspicious float values detected
 */
function getTextMetricsFloatLie(context: CanvasRenderingContext2D): boolean {
  const isFloat = (n: number) => n % 1 !== 0;

  const metrics = context.measureText('') || {};
  const {
    actualBoundingBoxAscent: abba,
    actualBoundingBoxDescent: abbd,
    actualBoundingBoxLeft: abbl,
    actualBoundingBoxRight: abbr,
    fontBoundingBoxAscent: fbba,
    fontBoundingBoxDescent: fbbd,
  } = metrics;

  // Check if any bounding box value is an unexpected float
  // Note: width is excluded as it can legitimately be a float
  const lied = [abba, abbd, abbl, abbr, fbba, fbbd].find((x) =>
    isFloat(x || 0),
  );

  return !!lied;
}

/**
 * Collects unique emoji rendering patterns via TextMetrics.
 *
 * Different platforms render emojis at different sizes. By measuring
 * the bounding boxes of various emojis, we can:
 * 1. Identify the platform (Windows, macOS, iOS, Android)
 * 2. Detect emoji font availability
 * 3. Create a stable fingerprint based on text rendering
 *
 * @param context - Canvas 2D context to measure with
 * @returns Object containing unique emoji set and metrics sum
 */
/**
 * Extracts all available TextMetrics properties.
 * Different browsers/OSes return different values for baselines.
 */
function extractAllMetrics(metrics: TextMetrics): number[] {
  // Standard properties (well-supported)
  const standard = [
    metrics.width,
    metrics.actualBoundingBoxAscent,
    metrics.actualBoundingBoxDescent,
    metrics.actualBoundingBoxLeft,
    metrics.actualBoundingBoxRight,
    metrics.fontBoundingBoxAscent,
    metrics.fontBoundingBoxDescent,
  ];

  // Extended baseline properties (newer, vary by OS font rendering)
  // @ts-expect-error - These properties may not exist in older browsers
  const alphabeticBaseline = metrics.alphabeticBaseline ?? 0;
  // @ts-expect-error
  const hangingBaseline = metrics.hangingBaseline ?? 0;
  // @ts-expect-error
  const ideographicBaseline = metrics.ideographicBaseline ?? 0;
  // @ts-expect-error
  const emHeightAscent = metrics.emHeightAscent ?? 0;
  // @ts-expect-error
  const emHeightDescent = metrics.emHeightDescent ?? 0;

  return [
    ...standard,
    alphabeticBaseline,
    hangingBaseline,
    ideographicBaseline,
    emHeightAscent,
    emHeightDescent,
  ].map((v) => v || 0);
}

/**
 * Test strings for comprehensive text metrics fingerprinting.
 * Includes Latin, CJK, Arabic, and special characters that
 * render differently across font stacks.
 */
const TEXT_METRICS_TEST_STRINGS = [
  'Sphinx of black quartz, judge my vow!', // Latin pangram
  'fjord', // Ligatures: fi, fj
  'WAVE', // Kerning: WA, AV, VE
  'Illegal1l|', // Ambiguous characters
  '日本語テスト', // Japanese
  'العربية', // Arabic (RTL)
  '🎨🔥💻', // Emojis (multi-codepoint)
  'ﬁﬂﬀ', // Ligature characters
];

/**
 * Font configurations to test for rendering differences.
 * Variable fonts and system fonts behave differently across OSes.
 */
const TEXT_METRICS_FONTS = [
  '16px sans-serif',
  '16px serif',
  '16px monospace',
  '24px system-ui', // Modern system font
  'italic 16px sans-serif',
  'bold 16px sans-serif',
  '16px "Segoe UI", sans-serif', // Windows
  '16px "-apple-system", sans-serif', // macOS/iOS
];

function collectEmojiMetrics(context: CanvasRenderingContext2D): {
  emojiSet: Set<string>;
  textMetricsSystemSum: number;
  textMetricsExtended: {
    baselineSupport: boolean;
    fontFingerprint: string;
    metricsHash: string;
  };
} {
  context.font = `10px ${CSS_FONT_FAMILY.replace(/!important/gm, '')}`;

  const pattern = new Set<string>();
  const emojiSet = new Set<string>();

  // Measure each emoji and collect unique dimension patterns
  for (const emoji of EMOJIS) {
    const metrics = context.measureText(emoji) || {};
    const {
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      fontBoundingBoxAscent,
      fontBoundingBoxDescent,
      width,
    } = metrics;

    const dimensions = [
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      fontBoundingBoxAscent,
      fontBoundingBoxDescent,
      width,
    ].join(',');

    // Only keep one emoji per unique dimension pattern
    if (!pattern.has(dimensions)) {
      pattern.add(dimensions);
      emojiSet.add(emoji);
    }
  }

  // Calculate a sum of all metric values for fingerprinting
  // Multiplied by small number to keep value manageable
  const textMetricsSystemSum =
    0.00001 *
    [...pattern]
      .map((x) => x.split(',').reduce((acc, val) => acc + (+val || 0), 0))
      .reduce((acc, x) => acc + x, 0);

  // Extended TextMetrics collection
  // Test baseline support (newer browsers)
  const testMetrics = context.measureText('test');
  // @ts-expect-error
  const baselineSupport = typeof testMetrics.alphabeticBaseline === 'number';

  // Collect comprehensive font metrics across fonts and strings
  const allMetrics: number[] = [];

  for (const font of TEXT_METRICS_FONTS) {
    try {
      context.font = font;
    } catch {
      continue; // Font not available
    }

    for (const str of TEXT_METRICS_TEST_STRINGS) {
      try {
        const metrics = context.measureText(str);
        allMetrics.push(...extractAllMetrics(metrics));
      } catch {
        // Ignore measurement errors
      }
    }
  }

  // Create fingerprints from collected metrics
  const fontFingerprint = allMetrics
    .map((v) => Math.round(v * 100))
    .slice(0, 50) // Take first 50 values for stability
    .join(',');

  // XOR hash of all metrics
  let metricsXor = 0;
  for (const v of allMetrics) {
    metricsXor ^= Math.round(v * 1000);
  }

  return {
    emojiSet,
    textMetricsSystemSum,
    textMetricsExtended: {
      baselineSupport,
      fontFingerprint,
      metricsHash: metricsXor.toString(16),
    },
  };
}

// ============================================================================
// LOW ENTROPY IMAGE DATA VALIDATION
// ============================================================================

/**
 * Generates and validates a low-entropy test image.
 *
 * This draws a simple pattern (black fill, white pixel, arc) and reads
 * back the exact pixel values. These values should match known patterns
 * for the detected browser engine. Mismatches indicate:
 * - Browser is lying about its identity
 * - Canvas output is being modified
 * - Unusual rendering configuration
 *
 * @param context - Canvas 2D context to test
 * @param canvas - Canvas element
 * @returns The concatenated pixel data string
 */
function generateLowEntropyImageData(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): string {
  canvas.width = 2;
  canvas.height = 2;

  // Draw a simple pattern
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff';
  context.fillRect(2, 2, 1, 1);
  context.beginPath();
  context.arc(0, 0, 2, 0, 1, true);
  context.closePath();
  context.fill();

  // Read back and concatenate all RGBA values
  return context.getImageData(0, 0, 2, 2).data.join('');
}

/**
 * Validates low-entropy image data against known patterns.
 *
 * @param imageData - Concatenated pixel data string
 */
function validateLowEntropyImageData(imageData: string): void {
  Analysis.imageDataLowEntropy = imageData;

  // Check if the image data matches known patterns for the detected engine
  if (IS_BLINK && !KNOWN_IMAGE_DATA.BLINK.includes(imageData)) {
    LowerEntropy.CANVAS = true;
  } else if (IS_GECKO && !KNOWN_IMAGE_DATA.GECKO.includes(imageData)) {
    LowerEntropy.CANVAS = true;
  } else if (IS_WEBKIT && !KNOWN_IMAGE_DATA.WEBKIT.includes(imageData)) {
    LowerEntropy.CANVAS = true;
  }

  if (LowerEntropy.CANVAS) {
    sendToTrash(
      'CanvasRenderingContext2D.getImageData',
      'suspicious pixel data',
    );
  }
}

// ============================================================================
// LIE DETECTION
// ============================================================================

/**
 * Checks for known lies/tampering in canvas-related APIs.
 *
 * The lies module tracks if native browser APIs have been modified.
 * This function aggregates all canvas-related lie indicators.
 *
 * @returns Object containing individual lie flags and combined lied status
 */
function checkCanvasLies(): {
  dataLie: boolean;
  contextLie: boolean;
  imageDataLie: boolean;
  textMetricsLie: boolean;
  codePointLie: boolean;
  lied: boolean;
} {
  const dataLie = !!lieProps['HTMLCanvasElement.toDataURL'];
  const contextLie = !!lieProps['HTMLCanvasElement.getContext'];
  const imageDataLie = !!(
    lieProps['CanvasRenderingContext2D.fillText'] ||
    lieProps['CanvasRenderingContext2D.font'] ||
    lieProps['CanvasRenderingContext2D.getImageData'] ||
    lieProps['CanvasRenderingContext2D.strokeText']
  );
  const codePointLie = !!lieProps['String.fromCodePoint'];
  const textMetricsLie = !!(
    lieProps['CanvasRenderingContext2D.measureText'] ||
    lieProps['TextMetrics.actualBoundingBoxAscent'] ||
    lieProps['TextMetrics.actualBoundingBoxDescent'] ||
    lieProps['TextMetrics.actualBoundingBoxLeft'] ||
    lieProps['TextMetrics.actualBoundingBoxRight'] ||
    lieProps['TextMetrics.fontBoundingBoxAscent'] ||
    lieProps['TextMetrics.fontBoundingBoxDescent'] ||
    lieProps['TextMetrics.width']
  );

  const lied =
    dataLie || contextLie || imageDataLie || textMetricsLie || codePointLie;

  return {
    dataLie,
    contextLie,
    imageDataLie,
    textMetricsLie,
    codePointLie,
    lied,
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Collects a complete canvas 2D fingerprint.
 *
 * This is the main entry point for canvas fingerprinting. It:
 * 1. Checks for API tampering (lies)
 * 2. Generates multiple canvas fingerprint images
 * 3. Detects pixel modification (noise injection)
 * 4. Collects text metrics from emojis
 * 5. Validates against known patterns
 *
 * @returns Complete canvas fingerprint or undefined if blocked
 */
export default async function getCanvas2d(): Promise<
  CanvasFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Check for known API lies
    let { textMetricsLie, lied } = checkCanvasLies();

    // Get window reference - use PHANTOM_DARKNESS for iframe isolation if available
    // This helps bypass some anti-fingerprinting extensions
    let win: Window = window;
    if (!LIKE_BRAVE && PHANTOM_DARKNESS) {
      win = PHANTOM_DARKNESS as Window;
    }
    const doc = win.document;

    // Create canvas contexts
    const canvas = doc.createElement('canvas');
    const context = canvas.getContext('2d');

    // CPU canvas uses specific options for more consistent software rendering
    const canvasCPU = doc.createElement('canvas');
    const contextCPU = canvasCPU.getContext('2d', {
      desynchronized: true,
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error('canvas context blocked');
    }

    // Generate main fingerprint image (with text)
    await queueEvent(timer);
    const imageSizeMax = IS_WEBKIT
      ? CANVAS_SIZES.WEBKIT_MAX
      : CANVAS_SIZES.DEFAULT_MAX;
    paintCanvas({
      canvas,
      context,
      strokeText: true,
      cssFontFamily: CSS_FONT_FAMILY,
      area: { width: imageSizeMax, height: imageSizeMax },
      rounds: PICASSO_CONFIG.ROUNDS,
    });
    const dataURI = canvas.toDataURL();

    // Detect pixel modifications (noise injection)
    await queueEvent(timer);
    const mods = getPixelMods();

    // Collect emoji TextMetrics and extended font metrics
    await queueEvent(timer);
    const { emojiSet, textMetricsSystemSum, textMetricsExtended } =
      collectEmojiMetrics(context);

    // Generate paint-only fingerprint (no text)
    // This isolates GPU rendering from font rendering
    const maxSize = CANVAS_SIZES.DEFAULT_MAX;
    await queueEvent(timer);
    paintCanvas({
      canvas,
      context,
      area: { width: maxSize, height: maxSize },
    });
    const paintURI = canvas.toDataURL();

    // Generate CPU-rendered version for comparison
    // Differences between GPU and CPU rendering can detect GPU spoofing
    await queueEvent(timer);
    paintCanvas({
      canvas: canvasCPU,
      context: contextCPU,
      area: { width: maxSize, height: maxSize },
    });
    const paintCpuURI = canvasCPU.toDataURL();

    // Generate text-only fingerprint
    context.restore();
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = CANVAS_SIZES.TEXT_SIZE;
    canvas.height = CANVAS_SIZES.TEXT_SIZE;
    context.font = `${CANVAS_SIZES.TEXT_SIZE}px ${CSS_FONT_FAMILY.replace(/!important/gm, '')}`;
    context.fillText('A', 7, 37);
    const textURI = canvas.toDataURL();

    // Generate emoji-only fingerprint
    context.restore();
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = CANVAS_SIZES.TEXT_SIZE;
    canvas.height = CANVAS_SIZES.TEXT_SIZE;
    context.font = `35px ${CSS_FONT_FAMILY.replace(/!important/gm, '')}`;
    context.fillText('\uD83D\uDC7E', 0, 37); // alien emoji
    const emojiURI = canvas.toDataURL();

    // Check for pixel modification lies
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (
      (mods && mods.pixels) ||
      !!Math.max(...context.getImageData(0, 0, 8, 8).data)
    ) {
      lied = true;
      documentLie(
        'CanvasRenderingContext2D.getImageData',
        'pixel data modified',
      );
    }

    // Validate low-entropy image data against known patterns
    const imageDataLowEntropy = generateLowEntropyImageData(context, canvas);
    validateLowEntropyImageData(imageDataLowEntropy);

    // Check for TextMetrics floating-point noise
    await queueEvent(timer);
    if (getTextMetricsFloatLie(context)) {
      textMetricsLie = true;
      lied = true;
      documentLie(
        'CanvasRenderingContext2D.measureText',
        'metric noise detected',
      );
    }

    logTestResult({ time: timer.stop(), test: 'canvas 2d', passed: true });

    return {
      dataURI,
      paintURI,
      paintCpuURI,
      textURI,
      emojiURI,
      mods,
      textMetricsSystemSum,
      textMetricsExtended,
      liedTextMetrics: textMetricsLie,
      emojiSet: [...emojiSet],
      lied,
    };
  } catch (error) {
    logTestResult({ test: 'canvas 2d', passed: false });
    captureError(error);
    return undefined;
  }
}
