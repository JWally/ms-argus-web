/**
 * Timing and Clock Skew Module
 *
 * Collects timing data for server-side clock skew analysis.
 *
 * Clock skew fingerprinting works because:
 * 1. Each device has a unique crystal oscillator with slight frequency variations
 * 2. These variations cause predictable drift patterns over time
 * 3. By comparing client timestamps with server timestamps across multiple
 *    requests, the server can build a "clock fingerprint"
 *
 * This module exposes raw timing data - the actual analysis happens server-side
 * where multiple samples can be accumulated.
 *
 * If crossOriginIsolated is true (COOP/COEP headers set), we can use
 * SharedArrayBuffer for higher precision timing (~microsecond vs ~millisecond).
 *
 * @module timing
 */

import { captureError } from '../errors';
import { hashMini } from '../utils/crypto';
import { createTimer, logTestResult } from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';

/**
 * Timing sample with multiple clock sources.
 */
export interface TimingSample {
  /** High-resolution timestamp from performance.now() */
  perfNow: number;
  /** Unix timestamp from Date.now() */
  dateNow: number;
  /** Monotonic time if available (performance.timeOrigin + performance.now()) */
  monotonic: number;
}

/**
 * Clock skew fingerprint result.
 */
export interface TimingFingerprint {
  /** Whether high-precision timing is available (crossOriginIsolated) */
  highPrecision: boolean;

  /** Timestamp at collection start */
  start: TimingSample;

  /** Timestamp at collection end */
  end: TimingSample;

  /** Time elapsed according to performance.now() */
  perfElapsed: number;

  /** Time elapsed according to Date.now() */
  dateElapsed: number;

  /** Difference between the two elapsed times (clock drift indicator) */
  drift: number;

  /** Performance.timeOrigin (when the page started) */
  timeOrigin: number;

  /**
   * High-precision timing samples (only if crossOriginIsolated).
   * Array of [perfNow, dateNow] pairs taken rapidly.
   * Server can analyze jitter and precision.
   */
  samples?: number[][];

  /**
   * Resolution test: smallest measurable time difference.
   * Lower = higher precision. ~1ms normal, ~0.005ms with SAB.
   */
  resolution: number;

  /** Resource timing metrics from the page's own navigation and resources */
  resourceTiming?: ResourceTimingData;

  /** Hash for quick comparison */
  $hash: string;
}

/**
 * Resource timing data extracted from the Performance API.
 *
 * Captures connection lifecycle metrics that vary by network path
 * and can detect proxies, VPNs, and unusual network configurations.
 */
export interface ResourceTimingData {
  /** Navigation timing (the page itself) */
  navigation: NavigationTimingMetrics | undefined;
  /** First N resource entries summarized */
  resources: ResourceTimingEntry[];
}

/**
 * Key timing metrics from PerformanceNavigationTiming.
 */
export interface NavigationTimingMetrics {
  /** DNS lookup duration (ms) */
  dnsLookup: number;
  /** TCP connection duration (ms) */
  tcpConnect: number;
  /** TLS handshake duration (ms), 0 if not HTTPS */
  tlsHandshake: number;
  /** Time to first byte (ms) */
  ttfb: number;
  /** Response download duration (ms) */
  responseTime: number;
  /** Total transfer size (bytes) */
  transferSize: number;
  /** Decoded body size (bytes) */
  decodedBodySize: number;
  /** Connection protocol (e.g., "h2", "h3") */
  nextHopProtocol: string;
}

/**
 * Summarized resource timing entry.
 */
export interface ResourceTimingEntry {
  /** Resource type (script, css, img, etc.) */
  initiatorType: string;
  /** Connection protocol */
  nextHopProtocol: string;
  /** DNS lookup duration (ms) */
  dnsLookup: number;
  /** TCP connection duration (ms) */
  tcpConnect: number;
  /** TLS handshake duration (ms) */
  tlsHandshake: number;
  /** Time to first byte (ms) */
  ttfb: number;
  /** Transfer size (bytes) */
  transferSize: number;
}

/**
 * Rounds a timing value to 3 decimal places.
 */
function roundTiming(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Collects resource timing data from the Performance API.
 *
 * Extracts navigation timing (the page load itself) and the first 10
 * resource entries. Connection lifecycle metrics reveal network topology
 * and can help detect proxies/VPNs server-side.
 *
 * @returns Resource timing data or undefined if unsupported
 */
function collectResourceTiming(): ResourceTimingData | undefined {
  if (typeof performance.getEntriesByType !== 'function') return undefined;

  let navigation: NavigationTimingMetrics | undefined;

  const navEntries = performance.getEntriesByType(
    'navigation',
  ) as PerformanceNavigationTiming[];
  if (navEntries.length > 0) {
    const nav = navEntries[0];
    navigation = {
      dnsLookup: roundTiming(nav.domainLookupEnd - nav.domainLookupStart),
      tcpConnect: roundTiming(nav.connectEnd - nav.connectStart),
      tlsHandshake: roundTiming(
        nav.secureConnectionStart > 0
          ? nav.connectEnd - nav.secureConnectionStart
          : 0,
      ),
      ttfb: roundTiming(nav.responseStart - nav.requestStart),
      responseTime: roundTiming(nav.responseEnd - nav.responseStart),
      transferSize: nav.transferSize,
      decodedBodySize: nav.decodedBodySize,
      nextHopProtocol: nav.nextHopProtocol,
    };
  }

  const resourceEntries = performance.getEntriesByType(
    'resource',
  ) as PerformanceResourceTiming[];
  const resources: ResourceTimingEntry[] = resourceEntries
    .slice(0, 10)
    .map((r) => ({
      initiatorType: r.initiatorType,
      nextHopProtocol: r.nextHopProtocol,
      dnsLookup: roundTiming(r.domainLookupEnd - r.domainLookupStart),
      tcpConnect: roundTiming(r.connectEnd - r.connectStart),
      tlsHandshake: roundTiming(
        r.secureConnectionStart > 0
          ? r.connectEnd - r.secureConnectionStart
          : 0,
      ),
      ttfb: roundTiming(r.responseStart - r.requestStart),
      transferSize: r.transferSize,
    }));

  return { navigation, resources };
}

/**
 * Measures timer resolution by finding smallest non-zero delta.
 */
function measureResolution(iterations = 100): number {
  let minDelta = Infinity;

  for (let i = 0; i < iterations; i++) {
    const t1 = performance.now();
    let t2 = t1;

    // Spin until time changes
    while (t2 === t1) {
      t2 = performance.now();
    }

    const delta = t2 - t1;
    if (delta < minDelta) {
      minDelta = delta;
    }
  }

  return Math.round(minDelta * 1000) / 1000; // Round to 3 decimals
}

/**
 * Takes a timing sample from multiple clock sources.
 */
function takeSample(): TimingSample {
  const perfNow = performance.now();
  const dateNow = Date.now();
  const monotonic = performance.timeOrigin + perfNow;

  return { perfNow, dateNow, monotonic };
}

/**
 * Collects rapid timing samples for jitter analysis.
 * Only useful with high-precision timing.
 */
function collectRapidSamples(count = 20): number[][] {
  const samples: number[][] = [];

  for (let i = 0; i < count; i++) {
    samples.push([performance.now(), Date.now()]);
  }

  return samples;
}

/**
 * High-precision timer using SharedArrayBuffer.
 * Only works when crossOriginIsolated is true.
 *
 * Creates a worker that increments a counter as fast as possible,
 * giving sub-millisecond resolution.
 */
async function getHighPrecisionTime(): Promise<number | null> {
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    try {
      // Create shared buffer for counter
      const sab = new SharedArrayBuffer(8);
      const counter = new BigInt64Array(sab);

      // Worker code that increments counter continuously
      const workerCode = `
        const counter = new BigInt64Array(self.sab);
        while (true) {
          Atomics.add(counter, 0, 1n);
        }
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));

      // @ts-expect-error - Passing SAB to worker
      worker.postMessage({ sab });

      // Let worker run briefly then read counter
      setTimeout(() => {
        const count = Number(Atomics.load(counter, 0));
        worker.terminate();
        resolve(count);
      }, 10);
    } catch {
      expectFailure(
        'getHighPrecisionTime',
        'SharedArrayBuffer/Atomics worker failed',
      );
      resolve(null);
    }
  });
}

/**
 * Main entry point: Collects timing fingerprint data.
 *
 * This data is meant for server-side analysis:
 * 1. Server compares start/end timestamps with its own clock
 * 2. Over multiple visits, server builds drift profile
 * 3. Drift profile is unique to device's crystal oscillator
 */
export default async function getTimingFingerprint(): Promise<
  TimingFingerprint | undefined
> {
  try {
    const timer = createTimer();
    timer.start();

    const highPrecision =
      typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;

    // Take start sample
    const start = takeSample();

    // Measure resolution
    const resolution = measureResolution();

    // Collect rapid samples if high precision available
    const samples = highPrecision ? collectRapidSamples() : undefined;

    // Small delay to measure drift
    await new Promise((r) => setTimeout(r, 50));

    // Take end sample
    const end = takeSample();

    // Calculate elapsed times from different sources
    const perfElapsed = end.perfNow - start.perfNow;
    const dateElapsed = end.dateNow - start.dateNow;
    const drift = Math.abs(perfElapsed - dateElapsed);

    // Collect resource timing metrics
    const resourceTiming = collectResourceTiming();

    const result: TimingFingerprint = {
      highPrecision,
      start,
      end,
      perfElapsed: Math.round(perfElapsed * 1000) / 1000,
      dateElapsed,
      drift: Math.round(drift * 1000) / 1000,
      timeOrigin: performance.timeOrigin,
      samples,
      resolution,
      resourceTiming,
      $hash: hashMini({
        resolution,
        drift,
        highPrecision,
      }),
    };

    logTestResult({ time: timer.stop(), test: 'timing', passed: true });
    return result;
  } catch (error) {
    logTestResult({ test: 'timing', passed: false });
    captureError(error);
    return undefined;
  }
}

export { getHighPrecisionTime, measureResolution, takeSample };
