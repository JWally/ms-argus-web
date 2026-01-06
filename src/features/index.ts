/**
 * Engine Features Fingerprinting Module (Simplified)
 *
 * Collects browser feature lists for fingerprinting and server-side version detection.
 *
 * The client collects raw feature lists:
 * - CSS property names (from computed style)
 * - Window property names (from window object)
 * - JavaScript core features (from built-in objects)
 *
 * The server compares these against MDN Browser Compatibility Data to:
 * 1. Detect the actual browser version based on features
 * 2. Flag version spoofing if reported UA doesn't match features
 *
 * This approach:
 * - Reduces client bundle by ~100KB (no inline engine maps)
 * - Allows server to update detection without client redeploys
 * - Uses MDN BCD as authoritative source (auto-updated via scripts/update-features-mdn.ts)
 *
 * @module features
 */

import { captureError } from '../errors';
import { PHANTOM_DARKNESS } from '../lies';
import { hashMini } from '../utils/crypto';
import {
  IS_BLINK,
  IS_GECKO,
  createTimer,
  queueEvent,
  logTestResult,
} from '../utils/helpers';
import type { EngineFeaturesFingerprint } from './types';

/**
 * Global objects to enumerate for JavaScript feature detection.
 *
 * Each object's properties are enumerated to build a feature fingerprint.
 * Different browser versions expose different properties on these objects.
 */
const JS_GLOBAL_OBJECTS = [
  'Object',
  'Function',
  'Boolean',
  'Symbol',
  'Error',
  'Number',
  'BigInt',
  'Math',
  'Date',
  'String',
  'RegExp',
  'Array',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Atomics',
  'JSON',
  'Promise',
  'Reflect',
  'Proxy',
  'Intl',
  'WebAssembly',
  'Document',
  'Element',
] as const;

/**
 * Properties to ignore when enumerating JavaScript objects.
 * These are standard properties that don't vary between versions.
 */
const JS_IGNORE_PROPERTIES = new Set([
  'name',
  'length',
  'constructor',
  'prototype',
  'arguments',
  'caller',
]);

/**
 * Collects JavaScript core features by enumerating built-in objects.
 *
 * For each global object (Object, Array, Promise, etc.), this enumerates
 * both static properties and prototype properties, creating a list like:
 * ["Array.from", "Array.isArray", "Array.of", "Array.at", ...]
 *
 * Different browser versions have different sets of these properties,
 * making this a reliable version fingerprint.
 *
 * @param win - Window object to enumerate
 * @returns Array of feature names in "Object.property" format
 */
function getJSCoreFeatures(win: Window & typeof globalThis): string[] {
  try {
    const features: string[] = [];

    for (const name of JS_GLOBAL_OBJECTS) {
      const obj = (win as unknown as Record<string, unknown>)[name];
      if (!obj) continue;

      // Get static properties (e.g., Array.from, Object.keys)
      const staticKeys = Object.keys(Object.getOwnPropertyDescriptors(obj));

      // Get prototype properties (e.g., Array.prototype.map)
      const protoKeys = Object.keys(
        Object.getOwnPropertyDescriptors(
          (obj as { prototype?: object }).prototype || {},
        ),
      );

      // Combine, dedupe, and filter ignored properties
      const allKeys = [...new Set([...staticKeys, ...protoKeys])].filter(
        (key) => !JS_IGNORE_PROPERTIES.has(key),
      );

      // Add with object prefix
      for (const key of allKeys) {
        features.push(`${name}.${key}`);
      }
    }

    return features.sort();
  } catch (error) {
    captureError(error);
    return [];
  }
}

/**
 * Collects browser feature lists for fingerprinting.
 *
 * Returns raw feature arrays that can be:
 * 1. Hashed for stable fingerprinting
 * 2. Sent to server for version detection and lie analysis
 *
 * @param cssComputed - Computed CSS data from css module
 * @param windowFeaturesComputed - Window features from window module
 * @returns Feature fingerprint with raw key lists
 */
export default async function getEngineFeatures({
  cssComputed,
  windowFeaturesComputed,
}: {
  cssComputed?: { computedStyle?: { keys?: string[] } };
  windowFeaturesComputed?: { keys?: string[] };
}): Promise<EngineFeaturesFingerprint | undefined> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    const win = PHANTOM_DARKNESS || window;

    if (!cssComputed || !windowFeaturesComputed) {
      logTestResult({ test: 'features', passed: false });
      return undefined;
    }

    // Collect raw feature lists
    const cssKeys = cssComputed.computedStyle?.keys || [];
    const windowKeys = windowFeaturesComputed.keys || [];
    const jsKeys = getJSCoreFeatures(win);

    // Determine engine for reference (server will verify)
    const engine = IS_BLINK ? 'Blink' : IS_GECKO ? 'Gecko' : 'Unknown';

    logTestResult({ time: timer.stop(), test: 'features', passed: true });

    return {
      // Raw feature lists for server-side version detection
      cssKeys,
      windowKeys,
      jsKeys,

      // Engine hint (server verifies from features)
      engine,

      // Hashes for fingerprinting (stable across sessions)
      cssKeysHash: hashMini(cssKeys),
      windowKeysHash: hashMini(windowKeys),
      jsKeysHash: hashMini(jsKeys),
    };
  } catch (error) {
    logTestResult({ test: 'features', passed: false });
    captureError(error);
    return undefined;
  }
}

/**
 * Legacy export for backwards compatibility.
 * Version lie detection is now done server-side.
 *
 * @deprecated Use server-side analysis instead
 */
export function getFeaturesLie(): null {
  // Version lie detection moved to server-side
  // See TODO-server-side-analysis.md
  return null;
}
