import { describe, it, expect } from 'vitest';
import {
  KNOWN_IMAGE_DATA,
  PICASSO_COLORS,
  PICASSO_CONFIG,
  CANVAS_SIZES,
} from './constants';

describe('canvas constants', () => {
  describe('KNOWN_IMAGE_DATA', () => {
    it('is an object', () => {
      expect(typeof KNOWN_IMAGE_DATA).toBe('object');
    });

    it('has BLINK patterns', () => {
      expect(KNOWN_IMAGE_DATA.BLINK).toBeDefined();
      expect(Array.isArray(KNOWN_IMAGE_DATA.BLINK)).toBe(true);
      expect(KNOWN_IMAGE_DATA.BLINK.length).toBeGreaterThan(0);
    });

    it('has GECKO patterns', () => {
      expect(KNOWN_IMAGE_DATA.GECKO).toBeDefined();
      expect(Array.isArray(KNOWN_IMAGE_DATA.GECKO)).toBe(true);
      expect(KNOWN_IMAGE_DATA.GECKO.length).toBeGreaterThan(0);
    });

    it('has WEBKIT patterns', () => {
      expect(KNOWN_IMAGE_DATA.WEBKIT).toBeDefined();
      expect(Array.isArray(KNOWN_IMAGE_DATA.WEBKIT)).toBe(true);
      expect(KNOWN_IMAGE_DATA.WEBKIT.length).toBeGreaterThan(0);
    });

    it('all patterns are digit strings (RGBA values)', () => {
      for (const patterns of Object.values(KNOWN_IMAGE_DATA)) {
        for (const pattern of patterns) {
          expect(typeof pattern).toBe('string');
          expect(pattern).toMatch(/^[0-9]+$/);
        }
      }
    });

    it('patterns start with 255255255255 (white pixel)', () => {
      for (const patterns of Object.values(KNOWN_IMAGE_DATA)) {
        for (const pattern of patterns) {
          expect(pattern.startsWith('255255255255')).toBe(true);
        }
      }
    });
  });

  describe('PICASSO_COLORS', () => {
    it('is an array', () => {
      expect(Array.isArray(PICASSO_COLORS)).toBe(true);
    });

    it('has 50 colors', () => {
      expect(PICASSO_COLORS.length).toBe(50);
    });

    it('all colors are hex format', () => {
      for (const color of PICASSO_COLORS) {
        expect(color).toMatch(/^#[0-9A-F]{6}$/);
      }
    });

    it('first color is #FF6633', () => {
      expect(PICASSO_COLORS[0]).toBe('#FF6633');
    });

    it('last color is #6666FF', () => {
      expect(PICASSO_COLORS[PICASSO_COLORS.length - 1]).toBe('#6666FF');
    });

    it('has diverse color hues', () => {
      // Check that we have reds, greens, blues, etc.
      expect(PICASSO_COLORS.some((c) => c.startsWith('#FF'))).toBe(true); // Red shades
      expect(PICASSO_COLORS.some((c) => c.startsWith('#00'))).toBe(true); // Dark shades
      expect(PICASSO_COLORS.some((c) => c.startsWith('#99'))).toBe(true); // Mid-tones
      expect(PICASSO_COLORS.some((c) => c.endsWith('FF'))).toBe(true); // Blue component
    });
  });

  describe('PICASSO_CONFIG', () => {
    it('has SEED value', () => {
      expect(PICASSO_CONFIG.SEED).toBe(500);
    });

    it('has OFFSET value (prime number)', () => {
      expect(PICASSO_CONFIG.OFFSET).toBe(2001000001);
    });

    it('has MULTIPLIER value', () => {
      expect(PICASSO_CONFIG.MULTIPLIER).toBe(15000);
    });

    it('has ROUNDS value', () => {
      expect(PICASSO_CONFIG.ROUNDS).toBe(10);
    });

    it('has MAX_SHADOW_BLUR value', () => {
      expect(PICASSO_CONFIG.MAX_SHADOW_BLUR).toBe(50);
    });
  });

  describe('CANVAS_SIZES', () => {
    it('has NOISE_DETECTION size', () => {
      expect(CANVAS_SIZES.NOISE_DETECTION).toBe(8);
    });

    it('has NOISE_VISUAL_MULTIPLIER', () => {
      expect(CANVAS_SIZES.NOISE_VISUAL_MULTIPLIER).toBe(5);
    });

    it('has DEFAULT_MAX size', () => {
      expect(CANVAS_SIZES.DEFAULT_MAX).toBe(75);
    });

    it('has WEBKIT_MAX size (smaller than default)', () => {
      expect(CANVAS_SIZES.WEBKIT_MAX).toBe(50);
      expect(CANVAS_SIZES.WEBKIT_MAX).toBeLessThan(CANVAS_SIZES.DEFAULT_MAX);
    });

    it('has TEXT_SIZE', () => {
      expect(CANVAS_SIZES.TEXT_SIZE).toBe(50);
    });
  });
});

// Test pattern matching logic
describe('canvas fingerprint patterns', () => {
  describe('engine detection', () => {
    it('can check if pattern belongs to engine', () => {
      const isBlinkPattern = (pattern: string) =>
        KNOWN_IMAGE_DATA.BLINK.includes(pattern);
      const isGeckoPattern = (pattern: string) =>
        KNOWN_IMAGE_DATA.GECKO.includes(pattern);
      const isWebkitPattern = (pattern: string) =>
        KNOWN_IMAGE_DATA.WEBKIT.includes(pattern);

      // Test with actual patterns
      expect(isBlinkPattern(KNOWN_IMAGE_DATA.BLINK[0])).toBe(true);
      expect(isGeckoPattern(KNOWN_IMAGE_DATA.GECKO[0])).toBe(true);
      expect(isWebkitPattern(KNOWN_IMAGE_DATA.WEBKIT[0])).toBe(true);

      // Test cross-engine
      expect(isBlinkPattern(KNOWN_IMAGE_DATA.GECKO[0])).toBe(false);
    });
  });

  describe('Picasso PRNG', () => {
    it('can simulate PRNG sequence', () => {
      let seed = PICASSO_CONFIG.SEED;
      const next = () => {
        seed = (seed * 16807) % PICASSO_CONFIG.OFFSET;
        return (seed - 1) / PICASSO_CONFIG.OFFSET;
      };

      // Generate a few values
      const values = [next(), next(), next()];

      // Should be deterministic
      let seed2 = PICASSO_CONFIG.SEED;
      const next2 = () => {
        seed2 = (seed2 * 16807) % PICASSO_CONFIG.OFFSET;
        return (seed2 - 1) / PICASSO_CONFIG.OFFSET;
      };
      const values2 = [next2(), next2(), next2()];

      expect(values).toEqual(values2);
    });
  });

  describe('canvas size selection', () => {
    it('can select size based on engine', () => {
      const getMaxSize = (isWebkit: boolean) =>
        isWebkit ? CANVAS_SIZES.WEBKIT_MAX : CANVAS_SIZES.DEFAULT_MAX;

      expect(getMaxSize(true)).toBe(50);
      expect(getMaxSize(false)).toBe(75);
    });
  });
});
