/**
 * Pixel Modification Detection
 *
 * Detects if pixel data is being modified by privacy tools. Privacy tools
 * like Canvas Blocker inject small random changes to getImageData() results
 * to prevent fingerprinting. This module detects that interference.
 *
 * ## How it works:
 * 1. Create a canvas and fill it with known random pixel values
 * 2. Read back the pixel data via getImageData
 * 3. Compare what we wrote vs what we read
 * 4. Any difference indicates pixel noise injection
 *
 * @module canvas/pixel-mods
 */

import { CANVAS_SIZES } from './constants';
import type { PixelMods } from './types';

/**
 * Factory interface for creating canvas elements (for DI/testing).
 */
export interface CanvasFactory {
  createElement: (tag: 'canvas') => HTMLCanvasElement;
}

/**
 * Default canvas factory using document.
 */
export const defaultCanvasFactory: CanvasFactory = {
  createElement: (tag: 'canvas') => document.createElement(tag),
};

/**
 * Module-level variable to store the random input canvas for debugging.
 * This shows what random pixels were written before testing for modifications.
 */
let pixelImageRandom = '';

/**
 * Gets the random input image data URL (for debugging).
 */
export function getPixelImageRandom(): string {
  return pixelImageRandom;
}

/**
 * Detects if pixel data is being modified by privacy tools.
 *
 * @param factory - Optional canvas factory for DI/testing
 * @returns Detection results or undefined if canvas blocked
 */
export function getPixelMods(
  factory: CanvasFactory = defaultCanvasFactory,
): PixelMods | undefined {
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
    const canvasDisplay1 = factory.createElement('canvas');
    const canvasDisplay2 = factory.createElement('canvas');
    const canvas1 = factory.createElement('canvas');
    const canvas2 = factory.createElement('canvas');
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
