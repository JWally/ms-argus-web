/**
 * JavaScript Engine Error Fingerprinting Module
 *
 * Fingerprints browsers by triggering JavaScript errors and comparing
 * error message text. This technique works because:
 *
 * 1. **Engine-Specific Messages**: V8 (Chrome), SpiderMonkey (Firefox), and
 *    JavaScriptCore (Safari) each produce unique error message formats.
 *
 * 2. **Version Detection**: Error message wording changes between browser
 *    versions as engines improve their error reporting.
 *
 * 3. **Localization**: Some browsers localize error messages, revealing the
 *    system locale even if other locale APIs are spoofed.
 *
 * 4. **Tampering Detection**: Custom error handlers or proxy-based API
 *    interception may alter error behavior, indicating modification.
 *
 * ## Example Error Message Differences
 *
 * For `null.bar` (property access on null):
 * - Chrome: "Cannot read properties of null (reading 'bar')"
 * - Firefox: "null has no properties"
 * - Safari: "null is not an object (evaluating 'null.bar')"
 *
 * @module engine
 */

import { captureError } from '../errors';
import { createTimer, logTestResult } from '../utils/helpers';
import type { ConsoleErrorsFingerprint } from './types';

/**
 * Test functions that trigger specific JavaScript errors.
 *
 * Each function is designed to trigger a specific type of error with
 * predictable behavior across browser engines.
 */
const ERROR_TRIGGERS: Array<() => void> = [
  // SyntaxError: Unterminated string literal
  // V8: "Invalid or unexpected token"
  // SpiderMonkey: "unterminated string literal"
  () => new Function('alert(")')(),

  // TypeError: Property access on undefined
  // V8: "Cannot read properties of undefined"
  // SpiderMonkey: "foo is undefined"
  () => new Function('const foo;foo.bar')(),

  // TypeError: Property access on null
  // V8: "Cannot read properties of null"
  // SpiderMonkey: "null has no properties"
  () => new Function('null.bar')(),

  // ReferenceError: Undefined variable
  // V8: "abc is not defined"
  // SpiderMonkey: "abc is not defined"
  () => new Function('abc.xyz = 123')(),

  // TypeError: Property access on undefined (duplicate for consistency)
  () => new Function('const foo;foo.bar')(),

  // RangeError: Invalid radix for toString
  // V8: "toString() radix must be between 2 and 36"
  // SpiderMonkey: "radix must be an integer at least 2 and no greater than 36"
  () => new Function('(1).toString(1000)')(),

  // TypeError: Spread of undefined
  // V8: "undefined is not iterable"
  // SpiderMonkey: "undefined is not iterable"
  () => new Function('[...undefined].length')(),

  // RangeError: Invalid array length
  // V8: "Invalid array length"
  // SpiderMonkey: "invalid array length"
  () => new Function('var x = new Array(-1)')(),

  // SyntaxError: Duplicate const declaration
  // V8: "Identifier 'a' has already been declared"
  // SpiderMonkey: "redeclaration of const a"
  () => new Function('const a=1; const a=2;')(),
];

/**
 * Executes error-triggering functions and collects error messages.
 *
 * Each function is executed in a try-catch to capture the error message.
 * The message text (not the stack trace) is what provides fingerprint value.
 *
 * @param errorFunctions - Array of functions that throw errors
 * @returns Array of error message strings
 */
function collectErrorMessages(errorFunctions: Array<() => void>): string[] {
  const messages: string[] = [];

  for (const fn of errorFunctions) {
    try {
      fn();
    } catch (err) {
      messages.push((err as Error).message);
    }
  }

  return messages;
}

/**
 * Collects JavaScript engine error fingerprint.
 *
 * Triggers a set of known JavaScript errors and captures their error
 * messages. The exact wording of these messages varies by browser engine
 * and version, providing a fingerprint signal.
 *
 * @returns Console errors fingerprint data or undefined on error
 */
export default function getConsoleErrors():
  | ConsoleErrorsFingerprint
  | undefined {
  try {
    const timer = createTimer();
    timer.start();

    const errors = collectErrorMessages(ERROR_TRIGGERS);

    logTestResult({ time: timer.stop(), test: 'console errors', passed: true });
    return { errors };
  } catch (error) {
    logTestResult({ test: 'console errors', passed: false });
    captureError(error);
    return undefined;
  }
}
