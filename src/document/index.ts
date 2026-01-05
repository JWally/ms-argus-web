/**
 * HTML Element Version Fingerprinting Module
 *
 * Enumerates properties on document.documentElement for fingerprinting.
 * This technique provides unique signals because:
 *
 * 1. **Browser Differences**: Different browsers expose different properties
 *    on the root HTML element. Chrome, Firefox, and Safari each have unique
 *    property sets based on their DOM implementations.
 *
 * 2. **Version Detection**: New browser versions add properties (e.g., new
 *    event handlers like `onformdata`, new attributes like `inert`). The
 *    presence/absence of these properties reveals browser version.
 *
 * 3. **Polyfill Detection**: Extensions or scripts that add polyfills will
 *    show additional properties not native to the browser.
 *
 * 4. **Prototype Pollution**: Tampered browsers may have extra properties
 *    from prototype pollution attacks or fingerprint randomizers.
 *
 * ## How It Works
 *
 * Uses `for...in` enumeration on `document.documentElement` to capture
 * all enumerable properties including inherited ones from the prototype
 * chain (HTMLHtmlElement -> HTMLElement -> Element -> Node -> EventTarget).
 *
 * @module document
 */

import { captureError } from '../errors';
import { createTimer, logTestResult } from '../utils/helpers';
import type { HTMLElementVersionFingerprint } from './types';

/**
 * Enumerates all properties on the root HTML element.
 *
 * Iterates `document.documentElement` (the `<html>` element) using `for...in`
 * which captures both own properties and inherited prototype properties.
 *
 * ## Property Categories Captured
 *
 * - **Event handlers**: onclick, onmouseover, ondrag, etc.
 * - **DOM attributes**: id, className, style, dataset, etc.
 * - **DOM methods**: appendChild, querySelector, getAttribute, etc.
 * - **Element-specific**: innerHTML, outerHTML, scrollTop, etc.
 * - **Browser-specific**: Non-standard properties vary by browser
 *
 * @returns Array of property names on document.documentElement
 */
function enumerateHTMLElementProperties(): string[] {
  const keys: string[] = [];

  // Use for...in to capture all enumerable properties including inherited
  // eslint-disable-next-line guard-for-in
  for (const key in document.documentElement) {
    keys.push(key);
  }

  return keys;
}

/**
 * Collects HTML element property fingerprint.
 *
 * Returns the complete set of enumerable properties on `document.documentElement`.
 * This list varies by browser, version, and installed extensions/polyfills.
 *
 * @returns HTML element fingerprint data or undefined on error
 */
export default function getHTMLElementVersion():
  | HTMLElementVersionFingerprint
  | undefined {
  try {
    const timer = createTimer();
    timer.start();

    const keys = enumerateHTMLElementProperties();

    logTestResult({ time: timer.stop(), test: 'html element', passed: true });
    return { keys };
  } catch (error) {
    logTestResult({ test: 'html element', passed: false });
    captureError(error);
    return undefined;
  }
}
