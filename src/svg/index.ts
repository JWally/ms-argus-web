/**
 * SVG Fingerprinting Module
 *
 * Extracts SVG text metrics for fingerprinting.
 * SVG measurements provide unique fingerprint signals because:
 *
 * 1. **Text Rendering**: SVG text length calculations (getComputedTextLength,
 *    getSubStringLength, getExtentOfChar) vary by font rendering engine.
 *
 * 2. **Bounding Box**: SVG getBBox() returns floating-point dimensions that
 *    differ based on browser implementation.
 *
 * 3. **Emoji Support**: Emoji rendering in SVG varies significantly by OS
 *    and browser, creating distinctive patterns.
 *
 * 4. **Tampering Detection**: Shift calculations detect fingerprint
 *    randomizers that add inconsistent noise.
 *
 * @module svg
 */

import { captureError } from '../errors';
import { documentLie, lieProps, PHANTOM_DARKNESS } from '../lies';
import {
  createTimer,
  queueEvent,
  CSS_FONT_FAMILY,
  EMOJIS,
  logTestResult,
} from '../utils/helpers';
import { SVG_CONTAINER_STYLES } from './constants';
import type { SVGFingerprint } from './types';

/**
 * Reduces an SVG native object to a plain object of numeric properties.
 *
 * SVGRect and similar objects have prototype-based properties.
 * This extracts all numeric values.
 */
function reduceToObject(nativeObj: SVGRect): Record<string, number> {
  const keys = Object.keys(Object.getPrototypeOf(nativeObj));
  return keys.reduce(
    (acc, key) => {
      const val = (nativeObj as Record<string, unknown>)[key];
      const isMethod = typeof val === 'function';
      return isMethod ? acc : { ...acc, [key]: val as number };
    },
    {} as Record<string, number>,
  );
}

/**
 * Sums all numeric properties of an SVG native object.
 */
function reduceToSum(nativeObj: SVGRect): number {
  const keys = Object.keys(Object.getPrototypeOf(nativeObj));
  return keys.reduce((acc, key) => {
    const val = (nativeObj as Record<string, unknown>)[key] as number;
    return isNaN(val) ? acc : acc + val;
  }, 0);
}

/**
 * Sums absolute values of all object properties.
 */
function getObjectSum(obj: Record<string, number> | undefined): number {
  if (!obj) return 0;
  return Object.keys(obj).reduce((acc, key) => acc + Math.abs(obj[key]), 0);
}

/**
 * Creates the SVG measurement container with emoji text elements.
 */
function createSVGContainer(doc: Document): void {
  const container = doc.createElement('div');
  container.id = 'svg-container';

  container.innerHTML = `
    <style>
    ${SVG_CONTAINER_STYLES}
    .svgrect-emoji {
      font-family: ${CSS_FONT_FAMILY};
      font-size: 200px !important;
      height: auto;
      position: absolute !important;
      transform: scale(1.000999);
    }
    </style>
    <svg>
      <g id="svgBox">
        ${EMOJIS.map((emoji) => `<text x="32" y="32" class="svgrect-emoji">${emoji}</text>`).join('')}
      </g>
    </svg>
  `;

  doc.body.appendChild(container);
}

/**
 * Measures emoji text lengths and builds unique set.
 */
function measureEmojiTextLengths(svgElems: SVGTextContentElement[]): {
  emojiSet: string[];
  svgrectSystemSum: number;
} {
  const pattern = new Set<string>();
  const emojiSet = new Set<string>();

  svgElems.forEach((el, i) => {
    const dimensions = '' + el.getComputedTextLength();
    if (!pattern.has(dimensions)) {
      pattern.add(dimensions);
      emojiSet.add(EMOJIS[i]);
    }
  });

  // Calculate fingerprint sum
  const svgrectSystemSum =
    0.00001 *
    [...pattern]
      .map((x) => x.split(',').reduce((acc, v) => acc + (+v || 0), 0))
      .reduce((acc, x) => acc + x, 0);

  return { emojiSet: [...emojiSet], svgrectSystemSum };
}

/**
 * Detects shift calculation tampering.
 *
 * Applies and removes a CSS transform, checking if text length
 * calculations remain consistent.
 */
function detectShiftLie(el: SVGTextContentElement): boolean {
  const initial = el.getComputedTextLength();
  el.classList.add('shift-svg');
  const shifted = el.getComputedTextLength();
  el.classList.remove('shift-svg');
  const unshifted = el.getComputedTextLength();

  return initial - shifted !== unshifted - shifted;
}

/**
 * Checks for lie detection on SVG-related APIs.
 */
function detectSVGLies(): boolean {
  return !!(
    lieProps['SVGRect.height'] ||
    lieProps['SVGRect.width'] ||
    lieProps['SVGRect.x'] ||
    lieProps['SVGRect.y'] ||
    lieProps['String.fromCodePoint'] ||
    lieProps['SVGRectElement.getBBox'] ||
    lieProps['SVGTextContentElement.getExtentOfChar'] ||
    lieProps['SVGTextContentElement.getSubStringLength'] ||
    lieProps['SVGTextContentElement.getComputedTextLength']
  );
}

/**
 * Collects SVG fingerprint data.
 *
 * Creates SVG text elements and measures their dimensions using
 * various SVG text content APIs. The floating-point differences
 * between browsers create a unique fingerprint.
 *
 * @returns SVG fingerprint data or undefined on error
 */
export default async function getSVG(): Promise<SVGFingerprint | undefined> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    let lied = detectSVGLies();

    // Use phantom iframe for isolation
    const doc = PHANTOM_DARKNESS?.document?.body
      ? PHANTOM_DARKNESS.document
      : document;

    // Create measurement container
    createSVGContainer(doc);

    // Get SVG elements
    const svgBox = doc.getElementById('svgBox') as SVGGraphicsElement;
    const bBox = reduceToObject(svgBox.getBBox());

    // Get emoji text elements
    const svgElems = [
      ...svgBox.getElementsByClassName('svgrect-emoji'),
    ] as SVGTextContentElement[];

    await queueEvent(timer);

    // Measure emoji text lengths
    const { emojiSet, svgrectSystemSum } = measureEmojiTextLengths(svgElems);

    // Detect shift calculation tampering
    if (detectShiftLie(svgElems[0])) {
      lied = true;
      documentLie(
        'SVGTextContentElement.getComputedTextLength',
        'failed unshift calculation',
      );
    }

    // Collect measurements
    const data: SVGFingerprint = {
      bBox: getObjectSum(bBox),
      extentOfChar: reduceToSum(svgElems[0].getExtentOfChar(EMOJIS[0])),
      subStringLength: svgElems[0].getSubStringLength(0, 10),
      computedTextLength: svgElems[0].getComputedTextLength(),
      emojiSet,
      svgrectSystemSum,
      lied,
    };

    // Cleanup
    const container = doc.getElementById('svg-container');
    if (container) doc.body.removeChild(container);

    logTestResult({ time: timer.stop(), test: 'svg', passed: true });
    return data;
  } catch (error) {
    logTestResult({ test: 'svg', passed: false });
    captureError(error);
    return undefined;
  }
}
