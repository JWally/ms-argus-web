import { describe, it, expect } from 'vitest';
import { SVG_CONTAINER_STYLES } from './constants';

describe('svg constants', () => {
  describe('SVG_CONTAINER_STYLES', () => {
    it('is a non-empty string', () => {
      expect(typeof SVG_CONTAINER_STYLES).toBe('string');
      expect(SVG_CONTAINER_STYLES.length).toBeGreaterThan(0);
    });

    it('contains #svg-container selector', () => {
      expect(SVG_CONTAINER_STYLES).toContain('#svg-container');
    });

    it('positions container off-screen', () => {
      expect(SVG_CONTAINER_STYLES).toContain('position: absolute');
      expect(SVG_CONTAINER_STYLES).toContain('left: -9999px');
    });

    it('has auto height', () => {
      expect(SVG_CONTAINER_STYLES).toContain('height: auto');
    });

    it('contains shift-svg class', () => {
      expect(SVG_CONTAINER_STYLES).toContain('.shift-svg');
    });

    it('uses scale transform', () => {
      expect(SVG_CONTAINER_STYLES).toContain('transform: scale(');
    });

    it('uses !important for transform', () => {
      expect(SVG_CONTAINER_STYLES).toContain('!important');
    });

    it('scale value is near 1', () => {
      const scaleMatch = SVG_CONTAINER_STYLES.match(/scale\(([\d.]+)\)/);
      expect(scaleMatch).not.toBeNull();
      const scaleValue = parseFloat(scaleMatch![1]);
      expect(scaleValue).toBeCloseTo(1, 2);
    });
  });
});
