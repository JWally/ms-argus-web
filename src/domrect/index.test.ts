import { describe, it, expect } from 'vitest';
import {
  BLINK_ROTATE_HASHES,
  GECKO_ROTATE_HASHES,
  RECT_STYLES,
} from './constants';

describe('domrect constants', () => {
  describe('BLINK_ROTATE_HASHES', () => {
    it('is an object', () => {
      expect(typeof BLINK_ROTATE_HASHES).toBe('object');
    });

    it('has known hash values', () => {
      expect(Object.keys(BLINK_ROTATE_HASHES).length).toBeGreaterThan(0);
    });

    it('all values are true', () => {
      for (const value of Object.values(BLINK_ROTATE_HASHES)) {
        expect(value).toBe(true);
      }
    });

    it('keys are 8-character hex strings', () => {
      for (const key of Object.keys(BLINK_ROTATE_HASHES)) {
        expect(key).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it('includes 9d9215cc (100px)', () => {
      expect(BLINK_ROTATE_HASHES['9d9215cc']).toBe(true);
    });
  });

  describe('GECKO_ROTATE_HASHES', () => {
    it('is an object', () => {
      expect(typeof GECKO_ROTATE_HASHES).toBe('object');
    });

    it('has known hash values', () => {
      expect(Object.keys(GECKO_ROTATE_HASHES).length).toBeGreaterThan(0);
    });

    it('all values are true', () => {
      for (const value of Object.values(GECKO_ROTATE_HASHES)) {
        expect(value).toBe(true);
      }
    });

    it('keys are 8-character hex strings', () => {
      for (const key of Object.keys(GECKO_ROTATE_HASHES)) {
        expect(key).toMatch(/^[0-9a-f]{8}$/);
      }
    });

    it('includes e38453f0 (100px)', () => {
      expect(GECKO_ROTATE_HASHES['e38453f0']).toBe(true);
    });
  });

  describe('RECT_STYLES', () => {
    it('is a non-empty string', () => {
      expect(typeof RECT_STYLES).toBe('string');
      expect(RECT_STYLES.length).toBeGreaterThan(0);
    });

    it('contains rect-ghost class', () => {
      expect(RECT_STYLES).toContain('.rect-ghost');
    });

    it('contains rect-known class', () => {
      expect(RECT_STYLES).toContain('.rect-known');
    });

    it('contains visibility hidden', () => {
      expect(RECT_STYLES).toContain('visibility: hidden');
    });

    it('contains 45deg rotation for known rect', () => {
      expect(RECT_STYLES).toContain('rotate(45deg)');
    });

    it('contains multiple rect elements (cRect1-12)', () => {
      for (let i = 1; i <= 12; i++) {
        expect(RECT_STYLES).toContain(`#cRect${i}`);
      }
    });

    it('contains transform properties', () => {
      expect(RECT_STYLES).toContain('transform:');
    });

    it('contains skewY transforms', () => {
      expect(RECT_STYLES).toContain('skewY(');
    });

    it('contains matrix transforms', () => {
      expect(RECT_STYLES).toContain('matrix(');
    });

    it('contains perspective transform', () => {
      expect(RECT_STYLES).toContain('perspective(');
    });

    it('contains shift-dom-rect class', () => {
      expect(RECT_STYLES).toContain('.shift-dom-rect');
    });
  });
});

// Test hash lookup patterns
describe('domrect hash patterns', () => {
  describe('engine detection via rotate hash', () => {
    it('can detect Blink engine', () => {
      const isBlinkRotate = (hash: string) => !!BLINK_ROTATE_HASHES[hash];
      const isGeckoRotate = (hash: string) => !!GECKO_ROTATE_HASHES[hash];

      // Test Blink hash
      expect(isBlinkRotate('9d9215cc')).toBe(true);
      expect(isGeckoRotate('9d9215cc')).toBe(false);

      // Test Gecko hash
      expect(isBlinkRotate('e38453f0')).toBe(false);
      expect(isGeckoRotate('e38453f0')).toBe(true);
    });
  });

  describe('hash lookup', () => {
    it('unknown hash returns undefined', () => {
      expect(BLINK_ROTATE_HASHES['unknown']).toBeUndefined();
      expect(GECKO_ROTATE_HASHES['unknown']).toBeUndefined();
    });
  });
});
