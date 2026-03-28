/**
 * Math Fingerprinting Module
 *
 * Fingerprints browsers via floating-point precision differences in Math functions.
 * This technique works because:
 *
 * 1. **Engine Differences**: V8 (Chrome), SpiderMonkey (Firefox), and JavaScriptCore
 *    (Safari) implement transcendental math functions differently. Each engine makes
 *    unique rounding decisions at the edge of floating-point precision.
 *
 * 2. **Stable Values**: Unlike canvas or audio, math results are deterministic and
 *    stable across sessions. The same browser always returns the same values.
 *
 * 3. **Hard to Spoof**: Spoofing requires implementing all math functions to match
 *    a target browser's precision. Most spoofers don't bother because the differences
 *    are in the 15th+ decimal place.
 *
 * 4. **Privacy Browser Detection**: Tor Browser modifies some math precision for
 *    fingerprint resistance, which ironically makes it identifiable.
 *
 * The module tests ~85 specific inputs across 22 math functions, collecting the
 * raw computed values as a stable-order array for server-side analysis.
 *
 * @see https://nickcw.me/math-fingerprinting/ - Analysis of technique
 * @module math
 */

import { attempt, captureError } from '../errors';
import { lieProps, documentLie } from '../lies';
import { createTimer, logTestResult } from '../utils/helpers';
import {
  MATH_FUNCTIONS_TO_CHECK,
  MATH_TEST_INPUTS,
  EQUALITY_CHECK_ARGS,
  DEFAULT_EQUALITY_ARGS,
} from './constants';
import type { MathFingerprint } from './types';

/**
 * Gets the test arguments for equality checking.
 *
 * Different functions need different inputs to properly test consistency.
 * For example, cos(1e308) exercises edge cases better than cos(Math.PI).
 *
 * @param prop - Math function name
 * @returns Array of arguments to pass to the function
 */
function getEqualityCheckArgs(prop: string): number[] {
  return EQUALITY_CHECK_ARGS[prop] || DEFAULT_EQUALITY_ARGS;
}

/**
 * Checks if Math functions return consistent results.
 *
 * Calls each Math function twice with the same input. If results differ,
 * the function has been tampered with - likely by a fingerprint randomizer
 * that adds noise to math results.
 *
 * @returns True if any function was detected as tampered
 */
function checkMathEquality(): boolean {
  let lied = false;

  for (const prop of MATH_FUNCTIONS_TO_CHECK) {
    // Check if lie detection already flagged this function
    if (lieProps[`Math.${prop}`]) {
      lied = true;
    }

    // Get appropriate test arguments for this function
    const args = getEqualityCheckArgs(prop);

    // Call the function twice with identical arguments
    // @ts-expect-error - Dynamic function access
    const res1 = Math[prop](...args);
    // @ts-expect-error - Dynamic function access
    const res2 = Math[prop](...args);

    // Compare results (NaN === NaN is false, so handle that case)
    const matching = isNaN(res1) && isNaN(res2) ? true : res1 === res2;

    if (!matching) {
      lied = true;
      documentLie(`Math.${prop}`, 'expected x and got y');
    }
  }

  return lied;
}

/**
 * Computes the result of a single math test.
 *
 * @param testInput - Test input from MATH_TEST_INPUTS
 * @returns The computed number, or NaN on error
 */
function runMathTest(testInput: (typeof MATH_TEST_INPUTS)[number]): number {
  const result = attempt(() => {
    const [fn, args] = testInput;

    // Polyfill test uses pre-computed value directly
    if (fn === 'polyfill') {
      return args as number;
    }

    // @ts-expect-error - Dynamic function access
    return Math[fn](...(args as number[])) as number;
  });

  return result ?? NaN;
}

/**
 * Runs all math fingerprinting tests.
 *
 * Tests ~85 specific inputs across 22 math functions. Returns the raw
 * computed values as an ordered array. Failed tests produce NaN to
 * maintain stable array length.
 *
 * @returns Ordered array of computed results
 */
function runAllMathTests(): number[] {
  return MATH_TEST_INPUTS.map(runMathTest);
}

/**
 * Probes IEEE 754 float byte layout via Float32Array/Uint8Array buffer sharing.
 *
 * Detects endianness and float implementation differences across platforms.
 * The same logical float values produce identical byte representations on the
 * same architecture, but differ across big-endian vs little-endian systems.
 *
 * @returns Byte representation as number[]
 */
function getFloatByteRepresentation(): number[] {
  const testValues = [
    1.0,
    -1.0,
    0.5,
    Math.PI,
    Math.E,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    1 / 3,
    Math.sqrt(2),
    Math.LOG2E,
  ];
  const buffer = new ArrayBuffer(testValues.length * 4);
  const floatView = new Float32Array(buffer);
  const byteView = new Uint8Array(buffer);

  for (let i = 0; i < testValues.length; i++) {
    floatView[i] = testValues[i];
  }

  return [...byteView];
}

/**
 * Collects math fingerprint data.
 *
 * Performs two types of analysis:
 * 1. Equality checks - Detects if math functions have been tampered with
 * 2. Precision tests - Collects raw computed values for server-side analysis
 *
 * @returns Math fingerprint data or undefined on error
 */
export default function getMaths(): MathFingerprint | undefined {
  try {
    const timer = createTimer();
    timer.start();

    // Check for tampering (results that change between calls)
    const lied = checkMathEquality();

    // Run all precision tests
    const data = runAllMathTests();

    // Probe IEEE 754 byte layout
    const floatBytes = getFloatByteRepresentation();

    logTestResult({ time: timer.stop(), test: 'math', passed: true });

    return { data, floatBytes, lied };
  } catch (error) {
    logTestResult({ test: 'math', passed: false });
    captureError(error as Error);
    return undefined;
  }
}
