/**
 * CSS Fingerprinting Module
 *
 * Extracts CSS properties and system styles for fingerprinting.
 * CSS data provides unique fingerprinting signals because:
 *
 * 1. **Browser Differences**: Each browser supports different CSS properties.
 *    The number and names of properties vary between Chrome, Firefox, Safari.
 *
 * 2. **Version Detection**: New CSS properties are added with browser updates.
 *    The property list reveals the browser version range.
 *
 * 3. **System Colors**: OS-defined colors (ButtonFace, Highlight, etc.) vary
 *    by platform, theme, and accessibility settings.
 *
 * 4. **System Fonts**: System font keywords (menu, caption, etc.) resolve to
 *    platform-specific fonts and sizes.
 *
 * @module css
 */

import { captureError } from '../errors';
import { PARENT_PHANTOM } from '../lies';
import { createTimer, logTestResult } from '../utils/helpers';
import {
  SYSTEM_COLORS,
  SYSTEM_FONTS,
  NAMED_CSS_COLORS,
  CSS_VAR_REGEX,
  CAPS_REGEX,
} from './constants';
import type {
  ComputedStyleResult,
  SystemStyles,
  CSSFingerprint,
} from './types';

/**
 * Capitalizes the first character of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Lowercases the first character of a string.
 */
function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Removes the first character from a string.
 */
function removeFirstChar(str: string): string {
  return str.slice(1);
}

/**
 * Computes CSS style properties from a style declaration.
 *
 * This function extracts all CSS property names from a CSSStyleDeclaration.
 * Different browsers expose properties differently:
 * - Chrome includes both named (background-color) and alias (backgroundColor) forms
 * - Firefox may only include one form
 * - The prototype chain also contains properties in some browsers
 *
 * @param type - Which style declaration to use
 * @returns Object containing keys and interface name
 */
function computeStyle(type: string): ComputedStyleResult | undefined {
  try {
    // Get CSSStyleDeclaration based on type
    const cssStyleDeclaration =
      type === 'getComputedStyle'
        ? getComputedStyle(document.body)
        : type === 'HTMLElement.style'
          ? document.body.style
          : type === 'CSSRuleList.style'
            ? (document.styleSheets[0]?.cssRules[0] as CSSStyleRule | null)
                ?.style
            : undefined;

    if (!cssStyleDeclaration) {
      throw new TypeError('invalid argument string');
    }

    // Get properties from prototype
    const proto = Object.getPrototypeOf(cssStyleDeclaration);
    const prototypeProperties = Object.getOwnPropertyNames(proto);

    // Get own enumerable properties (numeric indices map to property names)
    const ownEnumerablePropertyNames: string[] = [];

    /** Filters enumerable properties, separating numeric-indexed values from named keys. */
    Object.keys(cssStyleDeclaration).forEach((key) => {
      const numericKey = !isNaN(+key);
      const value = (cssStyleDeclaration as unknown as Record<string, string>)[
        key
      ];
      const customPropKey = CSS_VAR_REGEX.test(key);
      const customPropValue = CSS_VAR_REGEX.test(value);

      if (numericKey && !customPropValue) {
        ownEnumerablePropertyNames.push(value);
      } else if (!numericKey && !customPropKey) {
        ownEnumerablePropertyNames.push(key);
      }
    });

    // Find counterpart properties in prototype chain
    // Chrome exposes both kebab-case and camelCase versions
    const propertiesInPrototypeChain: Record<string, boolean> = {};

    /** Finds counterpart properties (kebab-case vs camelCase) in the prototype chain. */
    ownEnumerablePropertyNames.forEach((key) => {
      if (propertiesInPrototypeChain[key]) return;

      const isNamedAttribute = key.indexOf('-') > -1;
      const isAliasAttribute = CAPS_REGEX.test(key);

      // Normalize key for lookup
      const firstChar = key.charAt(0);
      const isPrefixedName = isNamedAttribute && firstChar === '-';
      const isCapitalizedAlias =
        isAliasAttribute && firstChar === firstChar.toUpperCase();

      const normalizedKey = isPrefixedName
        ? removeFirstChar(key)
        : isCapitalizedAlias
          ? uncapitalize(key)
          : key;

      // Find counterpart
      if (isNamedAttribute) {
        // Convert kebab-case to camelCase
        const aliasAttribute = normalizedKey
          .split('-')
          .map((word, index) => (index === 0 ? word : capitalize(word)))
          .join('');

        if (aliasAttribute in cssStyleDeclaration) {
          propertiesInPrototypeChain[aliasAttribute] = true;
        } else if (capitalize(aliasAttribute) in cssStyleDeclaration) {
          propertiesInPrototypeChain[capitalize(aliasAttribute)] = true;
        }
      } else if (isAliasAttribute) {
        // Convert camelCase to kebab-case
        const namedAttribute = normalizedKey.replace(
          CAPS_REGEX,
          (char) => '-' + char.toLowerCase(),
        );

        if (namedAttribute in cssStyleDeclaration) {
          propertiesInPrototypeChain[namedAttribute] = true;
        } else if (`-${namedAttribute}` in cssStyleDeclaration) {
          propertiesInPrototypeChain[`-${namedAttribute}`] = true;
        }
      }
    });

    // Combine all property sources
    const keys = [
      ...new Set([
        ...prototypeProperties,
        ...ownEnumerablePropertyNames,
        ...Object.keys(propertiesInPrototypeChain),
      ]),
    ];

    // Extract interface name from prototype toString
    // @ts-expect-error - Extracting name from [object Name] format
    const interfaceName = ('' + proto).match(/\[object (.+)\]/)[1];

    return { keys, interfaceName };
  } catch (error) {
    captureError(error as Error);
    return undefined;
  }
}

/**
 * Gets system colors and fonts.
 *
 * System colors are OS-defined colors that vary by:
 * - Operating system (Windows, macOS, Linux)
 * - Theme (light/dark mode)
 * - Accessibility settings (high contrast)
 *
 * System fonts resolve to platform-specific fonts with sizes
 * determined by OS settings.
 *
 * @param el - Optional element to use for measurements
 * @returns System colors and fonts
 */
function getSystemStyles(el?: HTMLElement | null): SystemStyles | undefined {
  try {
    /** Extracts computed system colors and fonts from the given element. */
    const getStyles = (element: HTMLElement) => ({
      colors: SYSTEM_COLORS.map((color) => {
        element.setAttribute('style', `background-color: ${color} !important`);
        return {
          [color]: getComputedStyle(element).backgroundColor,
        };
      }),
      fonts: SYSTEM_FONTS.map((font) => {
        element.setAttribute('style', `font: ${font} !important`);
        const computedStyle = getComputedStyle(element);
        return {
          [font]: `${computedStyle.fontSize} ${computedStyle.fontFamily}`,
        };
      }),
    });

    // Create temporary element if none provided
    if (!el) {
      const tempEl = document.createElement('div');
      document.body.append(tempEl);
      const systemStyles = getStyles(tempEl);
      tempEl.parentNode?.removeChild(tempEl);
      return systemStyles;
    }

    return getStyles(el);
  } catch (error) {
    captureError(error as Error);
    return undefined;
  }
}

/**
 * Resolves named CSS colors to their computed RGB values.
 *
 * Different browsers and color profiles may compute slightly different
 * RGB values for the same named color keyword.
 *
 * @param el - Optional element to use for measurements
 * @returns Map of color name → computed RGB string
 */
function getNamedColorResolution(
  el?: HTMLElement | null,
): Record<string, string> | undefined {
  try {
    const resolve = (element: HTMLElement): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const color of NAMED_CSS_COLORS) {
        element.style.color = color;
        result[color] = getComputedStyle(element).color;
      }
      return result;
    };

    if (el) {
      return resolve(el);
    }

    const tempEl = document.createElement('div');
    document.body.appendChild(tempEl);
    const result = resolve(tempEl);
    tempEl.parentNode?.removeChild(tempEl);
    return result;
  } catch (error) {
    captureError(error as Error);
    return undefined;
  }
}

/**
 * Collects CSS fingerprint data.
 *
 * Gathers three types of CSS-based fingerprinting data:
 * 1. Computed style properties - The list of CSS properties
 * 2. System styles - OS-defined colors and fonts
 * 3. Named color resolution - Computed RGB values for named CSS colors
 *
 * @returns CSS fingerprint data or undefined on error
 */
export default function getCSS(): CSSFingerprint | undefined {
  try {
    const timer = createTimer();
    timer.start();

    // Get computed style properties
    const computedStyle = computeStyle('getComputedStyle');

    // Get system colors and fonts (use phantom element for isolation)
    const system = getSystemStyles(PARENT_PHANTOM as HTMLElement | null);

    // Get named CSS color resolution
    const namedColors = getNamedColorResolution(
      PARENT_PHANTOM as HTMLElement | null,
    );

    logTestResult({ time: timer.stop(), test: 'computed style', passed: true });

    return {
      computedStyle,
      system,
      namedColors,
    };
  } catch (error) {
    logTestResult({ test: 'computed style', passed: false });
    captureError(error as Error);
    return undefined;
  }
}
