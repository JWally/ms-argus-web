/**
 * Canvas Painter
 *
 * Orchestrates the "Picasso-like" canvas painting algorithm by combining
 * the seeded PRNG with drawing primitives to create a deterministic
 * fingerprinting pattern.
 *
 * @module canvas/painter
 */

import { IS_WEBKIT } from '../utils/helpers';
import { PICASSO_COLORS, PICASSO_CONFIG } from './constants';
import { createPicassoSeed, patchSeed } from './prng';
import {
  addRandomCanvasGradient,
  createBezierCurve,
  createCircularArc,
  createEllipticalArc,
  createQuadraticCurve,
  drawOutlineOfText,
  type CanvasArea,
} from './primitives';
import type { PaintCanvasOptions } from './types';

/**
 * Type for drawing method functions.
 */
type DrawMethod = (
  ctx: CanvasRenderingContext2D,
  off: number,
  area: CanvasArea,
  seed: () => number,
) => void;

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
export function paintCanvas(options: PaintCanvasOptions): void {
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
