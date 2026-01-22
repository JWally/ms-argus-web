/**
 * Canvas Drawing Primitives
 *
 * Low-level drawing functions for canvas fingerprinting. Each function draws
 * a specific shape type with parameters derived from the seeded PRNG.
 *
 * These primitives are designed to reveal rendering differences across
 * browsers and GPUs through:
 * - Anti-aliasing algorithms (edge smoothing)
 * - GPU interpolation for gradients
 * - Curve calculation precision
 * - Sub-pixel positioning
 *
 * @module canvas/primitives
 */

import { patchSeed } from './prng';

/**
 * Area dimensions for canvas operations.
 */
export interface CanvasArea {
  width: number;
  height: number;
}

/**
 * Adds a radial gradient with random colors and positions.
 *
 * Gradients are particularly good for fingerprinting because:
 * - GPU interpolation algorithms vary between vendors
 * - Color blending differs subtly
 * - Gradient stops are calculated differently
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param colors - Color palette to choose from
 * @param getNextSeed - PRNG seed getter function
 */
export function addRandomCanvasGradient(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param getNextSeed - PRNG seed getter function
 * @param cssFontFamily - CSS font family string
 */
export function drawOutlineOfText(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param getNextSeed - PRNG seed getter function
 */
export function createCircularArc(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param getNextSeed - PRNG seed getter function
 */
export function createBezierCurve(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param getNextSeed - PRNG seed getter function
 */
export function createQuadraticCurve(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
 *
 * @param context - Canvas 2D rendering context
 * @param offset - PRNG offset value
 * @param area - Canvas dimensions
 * @param getNextSeed - PRNG seed getter function
 */
export function createEllipticalArc(
  context: CanvasRenderingContext2D,
  offset: number,
  area: CanvasArea,
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
