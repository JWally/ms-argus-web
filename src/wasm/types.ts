/**
 * Complete WASM fingerprint result
 */
export interface WasmFingerprint {
  // Core timing metrics (ms)
  cpu: number;
  ram: number;
  fpu: number;
  branch: number;

  // JIT behavior
  jitCurve: number[];
  jitSpeedup: number;

  // Memory characteristics
  memCeiling: number;
  memGrowPattern: number[];

  // WASM-specific signals
  simdSupported: boolean;
  simdRatio: number | null;
  boundaryOverhead: number;
  i64Performance: number;
  compileTime: number;
  instantiateTime: number;

  // Environment detection
  sharedArrayBuffer: boolean;
  workerAvailable: boolean;
  workerRatio: number | null;

  // Lie detection
  lied: boolean;
}

/**
 * Options for WASM fingerprint collection
 */
export interface WasmCollectOptions {
  /** Skip heavy probes (RAM, worker) for faster collection */
  fast?: boolean;
  /** Number of JIT warmup iterations (default: 10) */
  jitIterations?: number;
  /** CPU benchmark iterations (default: 200_000_000) */
  cpuIterations?: number;
  /** RAM benchmark iterations (default: 5) */
  ramIterations?: number;
}

/**
 * WASM module exports interface
 */
export interface WasmExports {
  cpu_stress_test(iterations: number): number;
  ram_stress_test(iterations: number): number;
  branch_stress_test(iterations: number): number;
  float_stress_test(iterations: number): number;
  jit_warmup_test(iterations: number): number;
  memory_pressure_test(mb: number): boolean;
  memory_grow_test(count: number): number;
  boundary_test(iterations: number): number;
  i64_benchmark(iterations: number): bigint;
  // SIMD (only in SIMD build)
  simd_benchmark?(iterations: number): number;
  simd_float_benchmark?(iterations: number): number;
}
