import { describe, it, expect } from 'vitest';
import {
  MATH_FUNCTIONS_TO_CHECK,
  MATH_TEST_CASES,
  EQUALITY_CHECK_ARGS,
  DEFAULT_EQUALITY_ARGS,
} from './constants';

describe('math constants', () => {
  describe('MATH_FUNCTIONS_TO_CHECK', () => {
    it('contains standard math functions', () => {
      const expectedFunctions = [
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
      ];
      expect(MATH_FUNCTIONS_TO_CHECK).toEqual(expectedFunctions);
    });

    it('all functions exist on Math object', () => {
      for (const fn of MATH_FUNCTIONS_TO_CHECK) {
        expect(typeof Math[fn as keyof typeof Math]).toBe('function');
      }
    });

    it('has 22 functions to check', () => {
      expect(MATH_FUNCTIONS_TO_CHECK.length).toBe(22);
    });
  });

  describe('MATH_TEST_CASES', () => {
    it('has test case structure [fn, args, displayName, chrome, firefox, tor, safari]', () => {
      for (const testCase of MATH_TEST_CASES) {
        expect(testCase.length).toBe(7);
        const [fn, args, displayName, chrome, firefox, torBrowser, safari] =
          testCase;

        // fn should be string
        expect(typeof fn).toBe('string');

        // args should be array or number (for polyfill)
        expect(Array.isArray(args) || typeof args === 'number').toBe(true);

        // displayName should be string
        expect(typeof displayName).toBe('string');

        // Expected values should be numbers (NaN counts as number type)
        expect(typeof chrome).toBe('number');
        expect(typeof firefox).toBe('number');
        expect(typeof torBrowser).toBe('number');
        expect(typeof safari).toBe('number');
      }
    });

    it('has reasonable number of test cases', () => {
      // Should have ~85 test cases for comprehensive coverage
      expect(MATH_TEST_CASES.length).toBeGreaterThan(50);
      expect(MATH_TEST_CASES.length).toBeLessThan(150);
    });

    it('covers all major function categories', () => {
      const functionNames = MATH_TEST_CASES.map((tc) => tc[0]);
      const uniqueFunctions = new Set(functionNames);

      // Should test multiple different functions
      expect(uniqueFunctions.size).toBeGreaterThan(15);

      // Should include trigonometric functions
      expect(uniqueFunctions.has('sin')).toBe(true);
      expect(uniqueFunctions.has('cos')).toBe(true);
      expect(uniqueFunctions.has('tan')).toBe(true);

      // Should include hyperbolic functions
      expect(uniqueFunctions.has('sinh')).toBe(true);
      expect(uniqueFunctions.has('cosh')).toBe(true);
      expect(uniqueFunctions.has('tanh')).toBe(true);

      // Should include logarithmic functions
      expect(uniqueFunctions.has('log')).toBe(true);
      expect(uniqueFunctions.has('log10')).toBe(true);
      expect(uniqueFunctions.has('log1p')).toBe(true);

      // Should include exponential functions
      expect(uniqueFunctions.has('exp')).toBe(true);
      expect(uniqueFunctions.has('expm1')).toBe(true);
    });

    it('includes edge case tests with large numbers', () => {
      const testNames = MATH_TEST_CASES.map((tc) => tc[2]);

      // Should have tests with 1e308 (near max float)
      const hasLargeNumber = testNames.some(
        (name) => name.includes('1e308') || name.includes('1e300'),
      );
      expect(hasLargeNumber).toBe(true);
    });

    it('includes Math constant tests', () => {
      const testNames = MATH_TEST_CASES.map((tc) => tc[2]);

      // Should test with Math constants
      const hasMathPI = testNames.some((name) => name.includes('Math.PI'));
      const hasMathE = testNames.some((name) => name.includes('Math.E'));
      const hasMathSQRT2 = testNames.some(
        (name) => name.includes('Math.SQRT2') || name.includes('Math.SQRT1_2'),
      );

      expect(hasMathPI).toBe(true);
      expect(hasMathE).toBe(true);
      expect(hasMathSQRT2).toBe(true);
    });
  });

  describe('EQUALITY_CHECK_ARGS', () => {
    it('is an object mapping functions to test arguments', () => {
      expect(typeof EQUALITY_CHECK_ARGS).toBe('object');
    });

    it('contains arrays of numbers', () => {
      for (const [, args] of Object.entries(EQUALITY_CHECK_ARGS)) {
        expect(Array.isArray(args)).toBe(true);
        for (const arg of args) {
          expect(typeof arg).toBe('number');
        }
      }
    });
  });

  describe('DEFAULT_EQUALITY_ARGS', () => {
    it('is an array', () => {
      expect(Array.isArray(DEFAULT_EQUALITY_ARGS)).toBe(true);
    });

    it('contains numeric values', () => {
      for (const arg of DEFAULT_EQUALITY_ARGS) {
        expect(typeof arg).toBe('number');
      }
    });
  });
});

// Test math fingerprinting patterns
describe('math fingerprinting patterns', () => {
  describe('floating point precision', () => {
    it('has precision differences at 15+ decimal places', () => {
      // The key to math fingerprinting is that different engines
      // round differently at the edge of IEEE 754 precision
      const result = Math.acos(0.123);

      // All browsers should agree to ~15 decimal places
      expect(result).toBeCloseTo(1.447484051603, 10);

      // But they may differ at the last few digits
      const precision = result.toString().split('.')[1]?.length || 0;
      expect(precision).toBeGreaterThan(10);
    });

    it('handles special values consistently', () => {
      // NaN behavior
      expect(Number.isNaN(Math.acos(2))).toBe(true); // Outside domain
      expect(Number.isNaN(Math.log(-1))).toBe(true); // Negative log

      // Infinity behavior
      expect(Math.exp(1000)).toBe(Infinity);
      expect(Math.log(0)).toBe(-Infinity);
    });
  });

  describe('math equality checking pattern', () => {
    it('same function called twice should return same result', () => {
      for (const fn of MATH_FUNCTIONS_TO_CHECK) {
        const mathFn = Math[fn as keyof typeof Math] as (
          ...args: number[]
        ) => number;

        // Use appropriate test values based on function
        let args: number[];
        if (fn === 'atan2' || fn === 'pow' || fn === 'hypot') {
          args = [0.5, 0.5];
        } else {
          args = [0.5];
        }

        const result1 = mathFn(...args);
        const result2 = mathFn(...args);

        // Results should be identical (including NaN === NaN handling)
        const matching =
          Number.isNaN(result1) && Number.isNaN(result2)
            ? true
            : result1 === result2;
        expect(matching).toBe(true);
      }
    });
  });

  describe('browser-specific result patterns', () => {
    it('test case expected values are plausible', () => {
      // Each test case should have a Chrome baseline value
      // and variations for other browsers
      for (const testCase of MATH_TEST_CASES) {
        const [fn, args, , chrome] = testCase;

        if (fn !== 'polyfill' && Array.isArray(args)) {
          const mathFn = Math[fn as keyof typeof Math] as (
            ...args: number[]
          ) => number;
          const result = mathFn(...args);

          // Result should be finite or NaN (not undefined)
          expect(typeof result).toBe('number');

          // If Chrome value is not NaN, it should be a valid number
          if (!Number.isNaN(chrome)) {
            expect(
              Number.isFinite(chrome) ||
                chrome === Infinity ||
                chrome === -Infinity,
            ).toBe(true);
          }
        }
      }
    });

    it('NaN in expected values indicates same-as-chrome', () => {
      // By convention, NaN in firefox/tor/safari columns means "same as Chrome"
      // This is a compression technique in the test data
      for (const testCase of MATH_TEST_CASES) {
        const [, , , chrome, firefox, torBrowser, safari] = testCase;

        // Chrome should always have a defined value
        expect(typeof chrome).toBe('number');

        // Other browsers may have NaN to indicate "same as Chrome"
        // or a different value if they differ
        expect(typeof firefox).toBe('number');
        expect(typeof torBrowser).toBe('number');
        expect(typeof safari).toBe('number');
      }
    });
  });
});
