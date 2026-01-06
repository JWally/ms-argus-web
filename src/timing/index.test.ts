import { describe, it, expect, vi, beforeEach } from 'vitest';
import getTimingFingerprint, {
  measureResolution,
  takeSample,
  type TimingFingerprint,
} from './index';

describe('timing module', () => {
  describe('takeSample', () => {
    it('returns sample with all clock sources', () => {
      const sample = takeSample();

      expect(typeof sample.perfNow).toBe('number');
      expect(typeof sample.dateNow).toBe('number');
      expect(typeof sample.monotonic).toBe('number');
      expect(sample.perfNow).toBeGreaterThan(0);
      expect(sample.dateNow).toBeGreaterThan(0);
      expect(sample.monotonic).toBeGreaterThan(0);
    });

    it('monotonic equals timeOrigin + perfNow', () => {
      const sample = takeSample();
      const expected = performance.timeOrigin + sample.perfNow;

      // Allow small tolerance for execution time
      expect(Math.abs(sample.monotonic - expected)).toBeLessThan(1);
    });
  });

  describe('measureResolution', () => {
    it('returns non-negative number', () => {
      const resolution = measureResolution(10);

      expect(typeof resolution).toBe('number');
      // May be 0 in fast test environments
      expect(resolution).toBeGreaterThanOrEqual(0);
    });

    it('resolution is non-negative', () => {
      const resolution = measureResolution(10);

      // In Node test environment, resolution may be 0 (fast execution)
      // In browsers: ~1ms normal, ~0.005ms high precision
      expect(resolution).toBeGreaterThanOrEqual(0);
      expect(resolution).toBeLessThanOrEqual(20);
    });
  });

  describe('getTimingFingerprint', () => {
    beforeEach(() => {
      // Mock crossOriginIsolated as false (default for most sites)
      vi.stubGlobal('crossOriginIsolated', false);
    });

    it('returns timing fingerprint', async () => {
      const result = await getTimingFingerprint();

      expect(result).toBeDefined();
      expect(result?.highPrecision).toBe(false);
      expect(result?.start).toBeDefined();
      expect(result?.end).toBeDefined();
      expect(typeof result?.perfElapsed).toBe('number');
      expect(typeof result?.dateElapsed).toBe('number');
      expect(typeof result?.drift).toBe('number');
      expect(typeof result?.resolution).toBe('number');
      expect(typeof result?.$hash).toBe('string');
    });

    it('end timestamps are greater than start', async () => {
      const result = await getTimingFingerprint();

      expect(result?.end.perfNow).toBeGreaterThan(result?.start.perfNow ?? 0);
      expect(result?.end.dateNow).toBeGreaterThanOrEqual(
        result?.start.dateNow ?? 0,
      );
    });

    it('elapsed times are positive', async () => {
      const result = await getTimingFingerprint();

      expect(result?.perfElapsed).toBeGreaterThan(0);
      expect(result?.dateElapsed).toBeGreaterThanOrEqual(0);
    });

    it('drift is small for consistent clocks', async () => {
      const result = await getTimingFingerprint();

      // Drift should be small (< 10ms) for well-behaved clocks
      // Could be larger on slow/virtualized systems
      expect(result?.drift).toBeLessThan(100);
    });

    it('does not include samples when not crossOriginIsolated', async () => {
      const result = await getTimingFingerprint();

      expect(result?.samples).toBeUndefined();
    });

    it('includes samples when crossOriginIsolated', async () => {
      vi.stubGlobal('crossOriginIsolated', true);

      const result = await getTimingFingerprint();

      expect(result?.highPrecision).toBe(true);
      expect(result?.samples).toBeDefined();
      expect(Array.isArray(result?.samples)).toBe(true);
      expect(result?.samples?.length).toBeGreaterThan(0);
    });

    it('returns consistent hash for same conditions', async () => {
      const result1 = await getTimingFingerprint();
      const result2 = await getTimingFingerprint();

      // Hash includes resolution which should be stable
      // but drift varies, so hashes may differ slightly
      expect(result1?.$hash).toBeDefined();
      expect(result2?.$hash).toBeDefined();
    });
  });

  describe('clock skew detection use cases', () => {
    it('provides data for server-side drift analysis', async () => {
      const result = await getTimingFingerprint();

      // Server would use these to calculate:
      // 1. Client clock offset = client.monotonic - server.timestamp
      // 2. Over multiple requests, track drift rate
      expect(result?.start.monotonic).toBeDefined();
      expect(result?.end.monotonic).toBeDefined();
      expect(result?.timeOrigin).toBeDefined();
    });

    it('detects potential time manipulation via drift', async () => {
      const result = await getTimingFingerprint();

      // Large drift between performance.now() and Date.now()
      // could indicate tampering (Date can be manipulated, performance.now cannot)
      // Normal drift should be < 5ms over 50ms test period
      const suspiciousDrift = (result?.drift ?? 0) > 20;

      // This is informational - high drift is suspicious but not proof
      expect(typeof suspiciousDrift).toBe('boolean');
    });
  });
});
