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
 * The module tests ~85 specific inputs across 22 math functions, comparing results
 * against known browser-specific values to identify the JS engine.
 *
 * @see https://nickcw.me/math-fingerprinting/ - Analysis of technique
 * @module math
 */

import { attempt, captureError } from '../errors';
import { lieProps, documentLie } from '../lies';
import { createTimer, logTestResult } from '../utils/helpers';
import {
  MATH_FUNCTIONS_TO_CHECK,
  MATH_TEST_CASES,
  EQUALITY_CHECK_ARGS,
  DEFAULT_EQUALITY_ARGS,
} from './constants';
import type { MathFingerprint, MathTestResult } from './types';

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
 * Runs a single math test and compares against known browser values.
 *
 * Each test case contains expected values for Chrome, Firefox, Tor, and Safari.
 * NaN in expected values means "same as Chrome" (the reference).
 *
 * @param testCase - Test case from MATH_TEST_CASES
 * @returns Test result with browser matches, or undefined on error
 */
function runMathTest(
  testCase: (typeof MATH_TEST_CASES)[number],
): MathTestResult | undefined {
  return attempt(() => {
    const [fn, args, , chrome, firefox, torBrowser, safari] = testCase;

    // Calculate result (polyfill test uses pre-computed value)
    const result =
      fn !== 'polyfill'
        ? // @ts-expect-error - Dynamic function access
          Math[fn](...(args as number[]))
        : (args as number);

    // Compare against known browser values
    return {
      result,
      chrome: result === chrome,
      firefox: !isNaN(firefox) && result === firefox,
      torBrowser: !isNaN(torBrowser) && result === torBrowser,
      safari: !isNaN(safari) && result === safari,
    };
  });
}

/**
 * Runs all math fingerprinting tests.
 *
 * Tests ~85 specific inputs across 22 math functions. Each test produces
 * a floating-point result that is compared against known browser values.
 *
 * @returns Map of test names to results
 */
function runAllMathTests(): Record<string, MathTestResult | undefined> {
  const data: Record<string, MathTestResult | undefined> = {};

  for (const testCase of MATH_TEST_CASES) {
    const testName = testCase[2]; // Display name is at index 2
    data[testName] = runMathTest(testCase);
  }

  return data;
}

/**
 * Collects math fingerprint data.
 *
 * Performs two types of analysis:
 * 1. Equality checks - Detects if math functions have been tampered with
 * 2. Precision tests - Compares results against known browser values
 *
 * The combination provides both tamper detection and browser identification.
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

    logTestResult({ time: timer.stop(), test: 'math', passed: true });

    return { data, lied };
  } catch (error) {
    logTestResult({ test: 'math', passed: false });
    captureError(error);
    return undefined;
  }
}
