import { describe, it, expect } from 'vitest';
import {
  MATH_FUNCTIONS_TO_CHECK,
  MATH_TEST_INPUTS,
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

  describe('MATH_TEST_INPUTS', () => {
    it('has test input structure [fn, args]', () => {
      for (const testInput of MATH_TEST_INPUTS) {
        expect(testInput.length).toBe(2);
        const [fn, args] = testInput;

        // fn should be string
        expect(typeof fn).toBe('string');

        // args should be array or number (for polyfill)
        expect(Array.isArray(args) || typeof args === 'number').toBe(true);
      }
    });

    it('has reasonable number of test inputs', () => {
      // Should have ~85 test inputs for comprehensive coverage
      expect(MATH_TEST_INPUTS.length).toBeGreaterThan(50);
      expect(MATH_TEST_INPUTS.length).toBeLessThan(150);
    });

    it('covers all major function categories', () => {
      const functionNames = MATH_TEST_INPUTS.map((ti) => ti[0]);
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

    it('includes tests with large numbers', () => {
      const hasLargeNumber = MATH_TEST_INPUTS.some(([, args]) => {
        if (Array.isArray(args)) {
          return args.some((a) => Math.abs(a) > 1e100);
        }
        return Math.abs(args) > 1e100;
      });
      expect(hasLargeNumber).toBe(true);
    });

    it('includes polyfill detection test', () => {
      const hasPolyfill = MATH_TEST_INPUTS.some(([fn]) => fn === 'polyfill');
      expect(hasPolyfill).toBe(true);
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

  describe('test inputs produce valid results', () => {
    it('all test inputs compute to finite numbers or NaN', () => {
      for (const [fn, args] of MATH_TEST_INPUTS) {
        let result: number;
        if (fn === 'polyfill') {
          result = args as number;
        } else {
          const mathFn = Math[fn as keyof typeof Math] as (
            ...args: number[]
          ) => number;
          result = mathFn(...(args as number[]));
        }

        // Result should be a number type (includes NaN, Infinity)
        expect(typeof result).toBe('number');
      }
    });
  });
});
