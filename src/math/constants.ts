/**
 * Math Fingerprinting Constants
 *
 * Test inputs for floating-point precision detection.
 *
 * Different JavaScript engines (V8, SpiderMonkey, JavaScriptCore) implement
 * math functions with subtle precision differences. By testing specific
 * inputs, we can identify which browser/engine is being used.
 */

import type { MathTestInput } from './types';

/**
 * Math functions to check for tampering.
 *
 * Each function is called twice with the same input. If results differ,
 * the function has been tampered with (likely for fingerprint randomization).
 */
export const MATH_FUNCTIONS_TO_CHECK = [
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atanh',
  'atan2',
  'cbrt',
  'cos',
  'cosh',
  'expm1',
  'exp',
  'hypot',
  'log',
  'log1p',
  'log10',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'pow',
] as const;

/**
 * Standard test value for most functions.
 */
const n = 0.123;

/**
 * Large number that produces engine-specific results.
 */
const bigN = 5.860847362277284e38;

/**
 * Math function test inputs.
 *
 * Format: [functionName, args]
 *
 * Each entry defines a specific input to a Math function. The computed
 * results differ subtly across JS engines due to floating-point rounding
 * decisions, making them useful for fingerprinting.
 */
export const MATH_TEST_INPUTS: MathTestInput[] = [
  // acos tests
  ['acos', [n]],
  ['acos', [Math.SQRT1_2]],

  // acosh tests
  ['acosh', [1e308]],
  ['acosh', [Math.PI]],
  ['acosh', [Math.SQRT2]],

  // asin tests
  ['asin', [n]],

  // asinh tests
  ['asinh', [1e300]],
  ['asinh', [Math.PI]],

  // atan tests
  ['atan', [2]],
  ['atan', [Math.PI]],

  // atanh tests
  ['atanh', [0.5]],

  // atan2 tests
  ['atan2', [1e-310, 2]],
  ['atan2', [Math.PI, 2]],

  // cbrt tests
  ['cbrt', [100]],
  ['cbrt', [Math.PI]],

  // cos tests
  ['cos', [n]],
  ['cos', [Math.PI]],
  ['cos', [bigN]],
  ['cos', [-1e308]],
  ['cos', [13 * Math.E]],
  ['cos', [57 * Math.E]],
  ['cos', [21 * Math.LN2]],
  ['cos', [51 * Math.LN2]],
  ['cos', [21 * Math.LOG2E]],
  ['cos', [25 * Math.SQRT2]],
  ['cos', [50 * Math.SQRT1_2]],
  ['cos', [21 * Math.SQRT1_2]],
  ['cos', [17 * Math.LOG10E]],
  ['cos', [2 * Math.LOG10E]],

  // cosh tests
  ['cosh', [1]],
  ['cosh', [Math.PI]],
  ['cosh', [492 * Math.LOG2E]],
  ['cosh', [502 * Math.SQRT2]],

  // expm1 tests
  ['expm1', [1]],
  ['expm1', [Math.PI]],

  // exp tests
  ['exp', [n]],
  ['exp', [Math.PI]],

  // hypot tests
  ['hypot', [1, 2, 3, 4, 5, 6]],
  ['hypot', [bigN, bigN]],
  ['hypot', [2 * Math.E, -100]],
  ['hypot', [6 * Math.PI, -100]],
  ['hypot', [2 * Math.LN2, -100]],
  ['hypot', [Math.LOG2E, -100]],
  ['hypot', [Math.SQRT2, -100]],
  ['hypot', [Math.SQRT1_2, -100]],
  ['hypot', [2 * Math.LOG10E, -100]],

  // log tests
  ['log', [n]],
  ['log', [Math.PI]],

  // log1p tests
  ['log1p', [n]],
  ['log1p', [Math.PI]],

  // log10 tests
  ['log10', [n]],
  ['log10', [Math.PI]],
  ['log10', [Math.E]],
  ['log10', [34 * Math.E]],
  ['log10', [Math.LN2]],
  ['log10', [11 * Math.LN2]],
  ['log10', [Math.LOG2E]],
  ['log10', [43 * Math.LOG2E]],
  ['log10', [Math.LOG10E]],
  ['log10', [7 * Math.LOG10E]],
  ['log10', [Math.SQRT1_2]],
  ['log10', [2 * Math.SQRT1_2]],
  ['log10', [Math.SQRT2]],

  // sin tests
  ['sin', [bigN]],
  ['sin', [Math.PI]],
  ['sin', [39 * Math.E]],
  ['sin', [35 * Math.LN2]],
  ['sin', [110 * Math.LOG2E]],
  ['sin', [7 * Math.LOG10E]],
  ['sin', [35 * Math.SQRT1_2]],
  ['sin', [21 * Math.SQRT2]],

  // sinh tests
  ['sinh', [1]],
  ['sinh', [Math.PI]],
  ['sinh', [Math.E]],
  ['sinh', [Math.LN2]],
  ['sinh', [Math.LOG2E]],
  ['sinh', [492 * Math.LOG2E]],
  ['sinh', [Math.LOG10E]],
  ['sinh', [Math.SQRT1_2]],
  ['sinh', [Math.SQRT2]],
  ['sinh', [502 * Math.SQRT2]],

  // sqrt tests
  ['sqrt', [n]],
  ['sqrt', [Math.PI]],

  // tan tests
  ['tan', [-1e308]],
  ['tan', [Math.PI]],
  ['tan', [6 * Math.E]],
  ['tan', [6 * Math.LN2]],
  ['tan', [10 * Math.LOG2E]],
  ['tan', [17 * Math.SQRT2]],
  ['tan', [34 * Math.SQRT1_2]],
  ['tan', [10 * Math.LOG10E]],

  // tanh tests
  ['tanh', [n]],
  ['tanh', [Math.PI]],

  // pow tests
  ['pow', [n, -100]],
  ['pow', [Math.PI, -100]],
  ['pow', [Math.E, -100]],
  ['pow', [Math.LN2, -100]],
  ['pow', [Math.LN10, -100]],
  ['pow', [Math.LOG2E, -100]],
  ['pow', [Math.LOG10E, -100]],
  ['pow', [Math.SQRT1_2, -100]],
  ['pow', [Math.SQRT2, -100]],

  // Polyfill detection - tests the ** operator vs Math.pow
  ['polyfill', 2e-3 ** -100],
];

/**
 * Test arguments for equality check by function name.
 *
 * These inputs are used to verify that Math functions return
 * consistent results when called twice.
 */
export const EQUALITY_CHECK_ARGS: Record<string, number[]> = {
  cos: [1e308],
  acos: [0.5],
  asin: [0.5],
  atanh: [0.5],
  pow: [Math.PI, 2],
  atan2: [Math.PI, 2],
};

/**
 * Default arguments for equality check (most functions use Math.PI).
 */
export const DEFAULT_EQUALITY_ARGS = [Math.PI];
