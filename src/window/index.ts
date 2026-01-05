/**
 * Window Features Fingerprinting Module
 *
 * Enumerates global window properties for fingerprinting.
 * This technique provides unique signals because:
 *
 * 1. **Browser Engine Detection**: Different engines expose different globals:
 *    - Chrome/Blink: webkit-prefixed APIs (webkitRequestAnimationFrame)
 *    - Firefox/Gecko: moz-prefixed APIs (mozInnerScreenX)
 *    - Safari/WebKit: webkit + Apple-prefixed APIs (ApplePaySession)
 *
 * 2. **Version Detection**: New browser versions add new globals (e.g.,
 *    SharedArrayBuffer, Temporal). The presence/absence reveals version.
 *
 * 3. **Extension Detection**: Extensions inject globals into the page
 *    (e.g., __REACT_DEVTOOLS_GLOBAL_HOOK__, gtag, dataLayer).
 *
 * 4. **Privacy Mode Detection**: Firefox's resistFingerprinting (RFP) mode
 *    removes certain globals (PerformanceNavigationTiming, Performance).
 *
 * ## Why We Use PHANTOM_DARKNESS
 *
 * The window object may be modified by page scripts or extensions.
 * Using PHANTOM_DARKNESS (a nested iframe) provides access to a cleaner
 * window object isolated from page-level modifications.
 *
 * @module window
 */

import { captureError } from '../errors';
import { PHANTOM_DARKNESS } from '../lies';
import { createTimer, IS_GECKO, logTestResult } from '../utils/helpers';
import type { WindowFeaturesFingerprint } from './types';

/**
 * Properties to filter out as noise.
 *
 * DuckDuckGo Privacy Essentials adds numbered properties (_1234567890)
 * which would cause false fingerprint variations.
 */
const NOISE_PATTERN = /_|\d{3,}/;

/**
 * Firefox-specific key that moves position when DevTools inspector is used.
 * Moving it to the end ensures consistent ordering.
 */
const FIREFOX_INSPECTOR_KEY = 'Event';

/**
 * Keys that may be missing in Firefox's resistFingerprinting mode.
 * Excluding them ensures RFP doesn't cause false fingerprint variations.
 */
const RFP_MISSING_KEYS = ['PerformanceNavigationTiming', 'Performance'];

/**
 * Filters out noise from window property list.
 *
 * @param keys - Raw property names
 * @returns Filtered property names
 */
function filterNoiseProperties(keys: string[]): string[] {
  return keys.filter((key) => !NOISE_PATTERN.test(key));
}

/**
 * Normalizes Firefox key ordering for consistent fingerprints.
 *
 * Firefox moves 'Event' key when DevTools inspector is used, and RFP mode
 * removes certain performance APIs. This normalization ensures consistent
 * results regardless of DevTools state or RFP configuration.
 *
 * @param keys - Property names to normalize
 * @returns Normalized property names
 */
function normalizeFirefoxKeys(keys: string[]): string[] {
  let normalized = [...keys];

  // Move 'Event' to end for consistent ordering
  const eventIndex = normalized.indexOf(FIREFOX_INSPECTOR_KEY);
  if (eventIndex !== -1) {
    normalized.splice(eventIndex, 1);
    normalized.push(FIREFOX_INSPECTOR_KEY);
  }

  // Remove RFP-varying keys
  for (const key of RFP_MISSING_KEYS) {
    const index = normalized.indexOf(key);
    if (index !== -1) {
      normalized.splice(index, 1);
    }
  }

  return normalized;
}

/**
 * Counts vendor-prefixed properties.
 *
 * The ratio of vendor prefixes is a strong browser indicator:
 * - High webkit count: Chrome or Safari
 * - High moz count: Firefox
 * - Apple prefix: Safari specifically
 *
 * @param keys - Property names to analyze
 * @returns Counts of vendor-prefixed properties
 */
function countVendorPrefixes(keys: string[]): {
  apple: number;
  moz: number;
  webkit: number;
} {
  return {
    apple: keys.filter((key) => /apple/i.test(key)).length,
    moz: keys.filter((key) => /moz/i.test(key)).length,
    webkit: keys.filter((key) => /webkit/i.test(key)).length,
  };
}

/**
 * Collects window features fingerprint.
 *
 * Enumerates all properties on the window object (using PHANTOM_DARKNESS
 * for isolation when available) and counts vendor-specific prefixes.
 *
 * @returns Window features fingerprint or undefined on error
 */
export default function getWindowFeatures():
  | WindowFeaturesFingerprint
  | undefined {
  try {
    const timer = createTimer();
    timer.start();

    // Use phantom iframe for cleaner window object
    const win = PHANTOM_DARKNESS || window;

    // Get all property names
    let keys = Object.getOwnPropertyNames(win);

    // Filter noise properties (DuckDuckGo injects _123456789 style names)
    keys = filterNoiseProperties(keys);

    // Normalize Firefox-specific ordering issues
    if (IS_GECKO) {
      keys = normalizeFirefoxKeys(keys);
    }

    // Count vendor-prefixed properties
    const { apple, moz, webkit } = countVendorPrefixes(keys);

    logTestResult({ time: timer.stop(), test: 'window', passed: true });
    return { keys, apple, moz, webkit };
  } catch (error) {
    logTestResult({ test: 'window', passed: false });
    captureError(error);
    return undefined;
  }
}
