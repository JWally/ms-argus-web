import { getWasm, resetBoundaryCounter } from '../loader'

const DEFAULT_BOUNDARY_ITERATIONS = 100_000

/**
 * Measure WASM<->JS boundary call overhead
 * Returns microseconds per call
 */
export function boundaryOverhead(iterations = DEFAULT_BOUNDARY_ITERATIONS): number {
  const wasm = getWasm()

  resetBoundaryCounter()
  const start = performance.now()
  wasm.boundary_test(iterations)
  const elapsed = performance.now() - start

  // Convert to microseconds per call
  return (elapsed * 1000) / iterations
}
