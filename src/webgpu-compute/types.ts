/**
 * WebGPU Compute Fingerprint Types
 *
 * Types for GPU compute shader timing fingerprinting.
 */

/**
 * Timing statistics for a compute shader test.
 */
export interface TimingStats {
  /** Mean execution time in milliseconds */
  mean: number;
  /** Variance of execution times */
  variance: number;
  /** Minimum execution time */
  min: number;
  /** Maximum execution time */
  max: number;
}

/**
 * Timing ratios between different compute tests.
 * Ratios are more stable than absolute times across browser versions.
 */
export interface TimingRatios {
  /** Contention test time / Arithmetic test time */
  contentionToArithmetic: number;
  /** Memory test time / Arithmetic test time */
  memoryToArithmetic: number;
  /** Contention test time / Memory test time */
  contentionToMemory: number;
}

/**
 * WebGPU compute shader fingerprint result.
 *
 * Contains timing signatures from multiple compute shader tests
 * that stress different GPU subsystems (ALU, shared memory, cache).
 */
export interface WebGpuComputeFingerprint {
  /** Whether WebGPU compute is supported */
  supported: boolean;

  /**
   * Hash of contention test results.
   * Tests shared memory contention between GPU threads.
   * Only present when supported=true.
   */
  contentionHash?: string;

  /**
   * Hash of arithmetic test results.
   * Tests ALU throughput with heavy floating-point operations.
   * Only present when supported=true.
   */
  arithmeticHash?: string;

  /**
   * Hash of memory test results.
   * Tests memory bandwidth with strided access patterns.
   * Only present when supported=true.
   */
  memoryHash?: string;

  /**
   * Timing statistics for each test.
   * Reflects GPU execution speed for different workloads.
   * Only present when supported=true.
   */
  timings?: {
    contention: TimingStats;
    arithmetic: TimingStats;
    memory: TimingStats;
  };

  /**
   * Timing ratios between tests.
   * More stable than absolute times across browser versions.
   * Only present when supported=true.
   */
  ratios?: TimingRatios;

  /** Combined fingerprint hash */
  $hash: string;
}
