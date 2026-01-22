/**
 * Canvas Validation
 *
 * Functions for generating and validating low-entropy test images to detect
 * canvas rendering modifications or browser identity spoofing.
 *
 * @module canvas/validation
 */

import {
  IS_BLINK,
  IS_GECKO,
  IS_WEBKIT,
  Analysis,
  LowerEntropy,
} from '../utils/helpers';
import { sendToTrash } from '../trash';
import { KNOWN_IMAGE_DATA } from './constants';

/**
 * Generates a low-entropy test image.
 *
 * This draws a simple pattern (black fill, white pixel, arc) and reads
 * back the exact pixel values. These values should match known patterns
 * for the detected browser engine.
 *
 * @param context - Canvas 2D context to test
 * @param canvas - Canvas element
 * @returns The concatenated pixel data string
 */
export function generateLowEntropyImageData(
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
 * Mismatches indicate:
 * - Browser is lying about its identity
 * - Canvas output is being modified
 * - Unusual rendering configuration
 *
 * @param imageData - Concatenated pixel data string
 */
export function validateLowEntropyImageData(imageData: string): void {
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
