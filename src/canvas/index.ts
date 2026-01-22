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
import { hashMini } from '../utils/crypto';
import {
  createTimer,
  queueEvent,
  LIKE_BRAVE,
  CSS_FONT_FAMILY,
  logTestResult,
  IS_WEBKIT,
} from '../utils/helpers';
import { CANVAS_SIZES, PICASSO_CONFIG } from './constants';
import { paintCanvas } from './painter';
import { getPixelMods } from './pixel-mods';
import { collectEmojiMetrics, getTextMetricsFloatLie } from './text-metrics';
import {
  generateLowEntropyImageData,
  validateLowEntropyImageData,
} from './validation';
import type { CanvasFingerprint } from './types';

// Re-export types for backwards compatibility
export type {
  PixelMods,
  PaintCanvasOptions,
  PicassoSeed,
  CanvasFingerprint,
} from './types';

// Re-export sub-modules for direct access
export { paintCanvas } from './painter';
export { createPicassoSeed, patchSeed } from './prng';
export { getPixelMods, getPixelImageRandom } from './pixel-mods';
export {
  collectEmojiMetrics,
  getTextMetricsFloatLie,
  extractAllMetrics,
} from './text-metrics';
export {
  generateLowEntropyImageData,
  validateLowEntropyImageData,
} from './validation';

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

    // Hash URIs to reduce fingerprint size (full base64 strings are huge)
    return {
      dataURI: hashMini(dataURI),
      paintURI: hashMini(paintURI),
      paintCpuURI: hashMini(paintCpuURI),
      textURI: hashMini(textURI),
      emojiURI: hashMini(emojiURI),
      mods: mods
        ? {
            ...mods,
            pixelImage: hashMini(mods.pixelImage), // Hash the pixel image too
          }
        : undefined,
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
