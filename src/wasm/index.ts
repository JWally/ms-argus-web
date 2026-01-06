/**
 * WASM Fingerprint Module
 *
 * Collects hardware and runtime fingerprint signals using WebAssembly probes.
 * Measures CPU, memory, JIT behavior, SIMD support, and more.
 */

import { loadWasm, detectSimd } from './loader';
import * as probes from './probes';
import { captureError } from '../errors';
import { createTimer, logTestResult } from '../utils/helpers';
import type { WasmFingerprint, WasmCollectOptions } from './types';

export type { WasmFingerprint, WasmCollectOptions } from './types';

// Default options - reduced for speed (~100ms target vs ~3s before)
const DEFAULT_OPTIONS: Required<WasmCollectOptions> = {
  fast: false,
  jitIterations: 5, // Was 10
  cpuIterations: 10_000_000, // Was 200M
  ramIterations: 2, // Was 5
};

/**
 * Collect WASM fingerprint signals
 *
 * @returns Promise<WasmFingerprint | undefined> - The WASM fingerprint data
 */
export default async function getWasmFingerprint(
  options: WasmCollectOptions = {},
): Promise<WasmFingerprint | undefined> {
  const timer = createTimer();
  timer.start();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Load WASM module (measures compile/instantiate time)
    await loadWasm();

    // Run JIT warmup first to get curve
    const jitCurve = probes.jitCurve(opts.jitIterations);
    const jitSpeedup = probes.jitSpeedup(jitCurve);

    // Core timing probes
    const cpu = probes.cpu(opts.cpuIterations);
    const fpu = probes.fpu();
    const branch = probes.branch();

    // Heavy probes (skip in fast mode)
    const ram = opts.fast ? 0 : probes.ram(opts.ramIterations);

    // Memory probes
    const memCeiling = probes.memCeiling();
    const memGrowPattern = probes.memGrowPattern();

    // WASM-specific probes
    const simdSupported = detectSimd();
    const simdRatio = probes.simdRatio();
    const boundaryOverhead = probes.boundaryOverhead();
    const i64Performance = probes.i64Performance();
    const compileTime = probes.compileTime();
    const instantiateTime = probes.instantiateTime();

    // Environment probes
    const sharedArrayBuffer = probes.sharedArrayBuffer();
    const workerAvailable = probes.workerAvailable();

    // Worker ratio (skip in fast mode, uses smaller iteration count for speed)
    // Uses 1/10th of CPU iterations since we just need a ratio, not absolute accuracy
    const workerIterations = Math.floor(opts.cpuIterations / 10);
    const workerRatio = opts.fast
      ? null
      : await probes.workerRatio(cpu, workerIterations);

    logTestResult({
      time: timer.stop(),
      test: 'wasm fingerprint',
      passed: true,
    });

    return {
      cpu,
      ram,
      fpu,
      branch,
      jitCurve,
      jitSpeedup,
      memCeiling,
      memGrowPattern,
      simdSupported,
      simdRatio,
      boundaryOverhead,
      i64Performance,
      compileTime,
      instantiateTime,
      sharedArrayBuffer,
      workerAvailable,
      workerRatio,
      lied: false,
    };
  } catch (error) {
    logTestResult({
      time: timer.stop(),
      test: 'wasm fingerprint',
      passed: false,
    });
    captureError(error, 'WASM fingerprint collection failed');
    return undefined;
  }
}

// Export individual probes for granular use
export { probes };

// Export loader utilities
export {
  loadWasm,
  detectSimd,
  isLoaded,
  getWasm,
  getWasmBytes,
} from './loader';
