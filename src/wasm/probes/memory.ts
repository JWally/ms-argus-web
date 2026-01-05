import { getWasm } from '../loader'

const MEMORY_TEST_SIZES = [100, 500, 1000, 2000, 4000]
// Progressive allocation sizes in MB for timing pattern
const GROW_PATTERN_SIZES = [1, 2, 4, 8, 16, 32, 64, 128]

/**
 * Find maximum allocatable memory in MB
 */
export function memCeiling(): number {
  const wasm = getWasm()
  let maxMb = 0

  for (const mb of MEMORY_TEST_SIZES) {
    try {
      if (wasm.memory_pressure_test(mb)) {
        maxMb = mb
      } else {
        break
      }
    } catch {
      break
    }
  }

  return maxMb
}

/**
 * Memory grow timing pattern - measures time to allocate progressively larger chunks.
 * Returns array of execution times showing allocation timing curve.
 * The pattern reveals memory subsystem characteristics.
 */
export function memGrowPattern(): number[] {
  const wasm = getWasm()
  const times: number[] = []

  for (const mb of GROW_PATTERN_SIZES) {
    try {
      const start = performance.now()
      wasm.memory_grow_test(mb)
      const elapsed = performance.now() - start
      times.push(elapsed)
    } catch {
      // Hit memory limit, stop
      break
    }
  }

  return times
}
