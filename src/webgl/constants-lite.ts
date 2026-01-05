/**
 * WebGL Fingerprinting Constants (Lite Version)
 *
 * This module loads WebGL data from external JSON files.
 * No inline data - requires external data files to be served.
 */

import {
  loadWebglGpuCapabilities,
  loadWebglCapabilities,
} from '../utils/data-loader';

// Re-export non-data constants from main file
export {
  WEBGL_PARAMS,
  VERSION_PARAMS,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  TRIANGLE_VERTICES,
} from './constants';

/** Cached GPU brand capabilities */
let _gpuBrandCapabilities: string[] | null = null;

/** Cached capabilities */
let _capabilities: number[] | null = null;

/**
 * Get known GPU brand capabilities from external data.
 * @throws Error if external data cannot be loaded
 */
export async function getKnownGpuBrandCapabilities(): Promise<string[]> {
  if (_gpuBrandCapabilities) return _gpuBrandCapabilities;

  _gpuBrandCapabilities = await loadWebglGpuCapabilities();
  return _gpuBrandCapabilities;
}

/**
 * Get known capabilities from external data.
 * @throws Error if external data cannot be loaded
 */
export async function getKnownCapabilities(): Promise<number[]> {
  if (_capabilities) return _capabilities;

  _capabilities = await loadWebglCapabilities();
  return _capabilities;
}

/**
 * Placeholder for backwards compatibility - always empty in lite build.
 */
export const KNOWN_GPU_BRAND_CAPABILITIES: readonly string[] = [];
export const KNOWN_CAPABILITIES: readonly number[] = [];
