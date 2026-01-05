import { getWasm, detectSimd } from '../loader'

const DEFAULT_SIMD_ITERATIONS = 50_000_000

/**
 * Calculate SIMD vs scalar performance ratio
 * Returns null if SIMD is not supported
 * A ratio > 1 means SIMD is faster
 */
export function simdRatio(iterations = DEFAULT_SIMD_ITERATIONS): number | null {
  if (!detectSimd()) return null

  const wasm = getWasm()

  // Check if SIMD benchmark is available
  if (!wasm.simd_benchmark) return null

  // Measure scalar (CPU) performance
  const scalarStart = performance.now()
  wasm.cpu_stress_test(iterations)
  const scalarTime = performance.now() - scalarStart

  // Measure SIMD performance
  const simdStart = performance.now()
  wasm.simd_benchmark(iterations)
  const simdTime = performance.now() - simdStart

  // Return ratio (higher = SIMD faster)
  return scalarTime / simdTime
}
