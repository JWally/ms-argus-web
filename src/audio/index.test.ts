import { describe, it, expect } from 'vitest';
import {
  AUDIO_CONFIG,
  AUDIO_TRAP,
} from './constants';

describe('audio constants', () => {
  describe('AUDIO_CONFIG', () => {
    it('has BUFFER_LENGTH', () => {
      expect(AUDIO_CONFIG.BUFFER_LENGTH).toBe(5000);
    });

    it('has SAMPLE_RATE (CD quality)', () => {
      expect(AUDIO_CONFIG.SAMPLE_RATE).toBe(44100);
    });

    it('has sample range start and end', () => {
      expect(AUDIO_CONFIG.SAMPLE_RANGE_START).toBe(4500);
      expect(AUDIO_CONFIG.SAMPLE_RANGE_END).toBe(4600);
      expect(AUDIO_CONFIG.SAMPLE_RANGE_END).toBeGreaterThan(AUDIO_CONFIG.SAMPLE_RANGE_START);
    });

    it('has OSCILLATOR_FREQUENCY', () => {
      expect(AUDIO_CONFIG.OSCILLATOR_FREQUENCY).toBe(10000);
    });

    it('has compressor settings', () => {
      expect(AUDIO_CONFIG.COMPRESSOR_THRESHOLD).toBe(-50);
      expect(AUDIO_CONFIG.COMPRESSOR_KNEE).toBe(40);
    });

    it('sample range is within buffer length', () => {
      expect(AUDIO_CONFIG.SAMPLE_RANGE_START).toBeLessThan(AUDIO_CONFIG.BUFFER_LENGTH);
      expect(AUDIO_CONFIG.SAMPLE_RANGE_END).toBeLessThanOrEqual(AUDIO_CONFIG.BUFFER_LENGTH);
    });
  });

  describe('AUDIO_TRAP', () => {
    it('is a number', () => {
      expect(typeof AUDIO_TRAP).toBe('number');
    });

    it('is between 0 and 1 (Math.random)', () => {
      expect(AUDIO_TRAP).toBeGreaterThanOrEqual(0);
      expect(AUDIO_TRAP).toBeLessThan(1);
    });
  });
});
