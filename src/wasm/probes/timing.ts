import { getWasm } from '../loader'

// Reduced iterations for speed - fingerprint value is in relative timing, not absolute
// Original values were 10-100x higher causing ~3s collection time
const DEFAULT_CPU_ITERATIONS = 10_000_000 // Was 200M
const DEFAULT_RAM_ITERATIONS = 2 // Was 5
const DEFAULT_FPU_ITERATIONS = 2_000_000 // Was 10M
const DEFAULT_BRANCH_ITERATIONS = 10_000_000 // Was 100M
const DEFAULT_JIT_ITERATIONS = 5 // Was 10
const JIT_WORK_PER_CALL = 1_000_000 // Was 5M

/**
 * Measure function execution time
 */
function measure(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

/**
 * CPU (integer ALU) benchmark
 */
export function cpu(iterations = DEFAULT_CPU_ITERATIONS): number {
  const wasm = getWasm()
  return measure(() => wasm.cpu_stress_test(iterations))
}

/**
 * RAM bandwidth benchmark
 */
export function ram(iterations = DEFAULT_RAM_ITERATIONS): number {
  const wasm = getWasm()
  return measure(() => wasm.ram_stress_test(iterations))
}

/**
 * Floating point benchmark
 */
export function fpu(iterations = DEFAULT_FPU_ITERATIONS): number {
  const wasm = getWasm()
  return measure(() => wasm.float_stress_test(iterations))
}

/**
 * Branch prediction stress test
 */
export function branch(iterations = DEFAULT_BRANCH_ITERATIONS): number {
  const wasm = getWasm()
  return measure(() => wasm.branch_stress_test(iterations))
}

/**
 * JIT warmup curve - returns array of execution times
 * Pattern reveals JIT optimization behavior
 */
export function jitCurve(runs = DEFAULT_JIT_ITERATIONS): number[] {
  const wasm = getWasm()
  const times: number[] = []

  for (let i = 0; i < runs; i++) {
    times.push(measure(() => wasm.jit_warmup_test(JIT_WORK_PER_CALL)))
  }

  return times
}

/**
 * Calculate JIT speedup percentage from curve
 */
export function jitSpeedup(curve: number[]): number {
  if (curve.length < 2) return 0
  const first = curve[0]
  const last = curve[curve.length - 1]
  const speedup = ((first - last) / first) * 100
  return Math.max(0, speedup)
}

/**
 * i64/BigInt performance benchmark
 */
export function i64Performance(iterations = 5_000_000): number { // Was 50M
  const wasm = getWasm()
  return measure(() => wasm.i64_benchmark(iterations))
}
