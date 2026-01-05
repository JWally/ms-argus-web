import { getLoadTiming, detectSimd } from '../loader'

/**
 * Check if SharedArrayBuffer is available
 * This is restricted in cross-origin-isolated contexts
 */
export function sharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Check if Workers are available
 */
export function workerAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Get WASM compile timing (ms)
 */
export function compileTime(): number {
  return getLoadTiming().compileTime
}

/**
 * Get WASM instantiate timing (ms)
 */
export function instantiateTime(): number {
  return getLoadTiming().instantiateTime
}

/**
 * Get SIMD support status
 */
export function simdSupported(): boolean {
  return detectSimd()
}
