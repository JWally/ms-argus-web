import { describe, it, expect } from 'vitest';
import {
  SYSTEM_COLORS,
  SYSTEM_FONTS,
  CSS_VAR_REGEX,
  CAPS_REGEX,
} from './constants';

describe('css constants', () => {
  describe('SYSTEM_COLORS', () => {
    it('is an array', () => {
      expect(Array.isArray(SYSTEM_COLORS)).toBe(true);
    });

    it('has many system colors', () => {
      expect(SYSTEM_COLORS.length).toBeGreaterThan(30);
    });

    it('all colors are strings', () => {
      for (const color of SYSTEM_COLORS) {
        expect(typeof color).toBe('string');
      }
    });

    it('includes ActiveText', () => {
      expect(SYSTEM_COLORS).toContain('ActiveText');
    });

    it('includes Canvas', () => {
      expect(SYSTEM_COLORS).toContain('Canvas');
    });

    it('includes CanvasText', () => {
      expect(SYSTEM_COLORS).toContain('CanvasText');
    });

    it('includes Highlight/HighlightText', () => {
      expect(SYSTEM_COLORS).toContain('Highlight');
      expect(SYSTEM_COLORS).toContain('HighlightText');
    });

    it('includes LinkText', () => {
      expect(SYSTEM_COLORS).toContain('LinkText');
    });

    it('includes Window colors', () => {
      expect(SYSTEM_COLORS).toContain('Window');
      expect(SYSTEM_COLORS).toContain('WindowFrame');
      expect(SYSTEM_COLORS).toContain('WindowText');
    });
  });

  describe('SYSTEM_FONTS', () => {
    it('is an array', () => {
      expect(Array.isArray(SYSTEM_FONTS)).toBe(true);
    });

    it('has 6 system fonts', () => {
      expect(SYSTEM_FONTS.length).toBe(6);
    });

    it('includes caption', () => {
      expect(SYSTEM_FONTS).toContain('caption');
    });

    it('includes icon', () => {
      expect(SYSTEM_FONTS).toContain('icon');
    });

    it('includes menu', () => {
      expect(SYSTEM_FONTS).toContain('menu');
    });

    it('includes message-box', () => {
      expect(SYSTEM_FONTS).toContain('message-box');
    });

    it('includes small-caption', () => {
      expect(SYSTEM_FONTS).toContain('small-caption');
    });

    it('includes status-bar', () => {
      expect(SYSTEM_FONTS).toContain('status-bar');
    });
  });

  describe('CSS_VAR_REGEX', () => {
    it('is a RegExp', () => {
      expect(CSS_VAR_REGEX).toBeInstanceOf(RegExp);
    });

    it('matches CSS custom properties', () => {
      expect(CSS_VAR_REGEX.test('--my-color')).toBe(true);
      expect(CSS_VAR_REGEX.test('--primary')).toBe(true);
      expect(CSS_VAR_REGEX.test('--font-size-lg')).toBe(true);
    });

    it('does not match regular properties', () => {
      expect(CSS_VAR_REGEX.test('color')).toBe(false);
      expect(CSS_VAR_REGEX.test('font-size')).toBe(false);
      expect(CSS_VAR_REGEX.test('-webkit-appearance')).toBe(false);
    });
  });

  describe('CAPS_REGEX', () => {
    it('is a RegExp', () => {
      expect(CAPS_REGEX).toBeInstanceOf(RegExp);
    });

    it('matches capital letters', () => {
      expect('camelCase'.match(CAPS_REGEX)).toBeTruthy();
      expect('PascalCase'.match(CAPS_REGEX)!.length).toBe(2);
    });

    it('does not match lowercase', () => {
      expect('lowercase'.match(CAPS_REGEX)).toBeNull();
    });

    it('has global flag', () => {
      expect(CAPS_REGEX.global).toBe(true);
    });
  });
});
