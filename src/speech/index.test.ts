import { describe, it, expect } from 'vitest';
import { VOICE_LOAD_DELAY_MS, VOICE_TIMEOUT_MS } from './constants';

describe('speech constants', () => {
  describe('VOICE_LOAD_DELAY_MS', () => {
    it('is a number', () => {
      expect(typeof VOICE_LOAD_DELAY_MS).toBe('number');
    });

    it('is 50ms', () => {
      expect(VOICE_LOAD_DELAY_MS).toBe(50);
    });

    it('is positive', () => {
      expect(VOICE_LOAD_DELAY_MS).toBeGreaterThan(0);
    });

    it('is less than timeout', () => {
      expect(VOICE_LOAD_DELAY_MS).toBeLessThan(VOICE_TIMEOUT_MS);
    });
  });

  describe('VOICE_TIMEOUT_MS', () => {
    it('is a number', () => {
      expect(typeof VOICE_TIMEOUT_MS).toBe('number');
    });

    it('is 200ms (lowered for faster fingerprinting)', () => {
      expect(VOICE_TIMEOUT_MS).toBe(200);
    });

    it('is positive', () => {
      expect(VOICE_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('is reasonable for voice loading', () => {
      expect(VOICE_TIMEOUT_MS).toBeGreaterThan(100);
      expect(VOICE_TIMEOUT_MS).toBeLessThan(5000);
    });
  });
});
