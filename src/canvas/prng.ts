/**
 * Seeded Pseudo-Random Number Generator
 *
 * A deterministic PRNG using Linear Congruential Generator (LCG) algorithm.
 * This produces a repeatable sequence of numbers for a given seed, which is
 * crucial for canvas fingerprinting - we need to draw the SAME pattern every
 * time, but the pattern should be complex enough to reveal rendering differences.
 *
 * @module canvas/prng
 */

import type { PicassoSeed } from './types';

/**
 * Creates a seeded pseudo-random number generator.
 *
 * Uses a Linear Congruential Generator (LCG) which produces a deterministic
 * sequence of numbers for a given seed.
 *
 * The formula is: next = (multiplier * current) % offset
 *
 * @param seed - Initial seed value
 * @param offset - Modulus for the LCG (should be large prime-like number)
 * @param multiplier - Multiplier for the LCG
 * @returns Object with getNextSeed() method
 */
export function createPicassoSeed(
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
export function patchSeed(
  current: number,
  offset: number,
  maxBound?: number,
  computeFloat?: boolean,
): number {
  const result = ((current - 1) / offset) * (maxBound || 1) || 0;
  return computeFloat ? result : Math.floor(result);
}
