/**
 * DOMRect Fingerprinting Module
 *
 * Extracts bounding rectangle data for fingerprinting.
 * Client rectangle measurements provide unique fingerprint signals because:
 *
 * 1. **Sub-Pixel Precision**: getClientRects() returns floating-point values
 *    that vary based on rendering engine implementation.
 *
 * 2. **Transform Calculations**: CSS transforms (rotate, skew, matrix, perspective)
 *    are computed differently by each browser engine.
 *
 * 3. **Font Rendering**: Text dimensions (especially emojis) vary by OS and font.
 *
 * 4. **Tampering Detection**: Math verification (right-left=width) catches
 *    fingerprint randomizers that add noise.
 *
 * @see https://privacycheck.sec.lrz.de/active/fp_gcr/fp_getclientrects.html
 * @see https://privacycheck.sec.lrz.de/active/fp_e/fp_emoji.html
 * @module domrect
 */

import { captureError } from '../errors';
import { lieProps, PHANTOM_DARKNESS, documentLie } from '../lies';
import { instanceId, hashMini } from '../utils/crypto';
import {
  createTimer,
  queueEvent,
  EMOJIS,
  CSS_FONT_FAMILY,
  IS_BLINK,
  IS_GECKO,
  logTestResult,
} from '../utils/helpers';
import {
  BLINK_ROTATE_HASHES,
  GECKO_ROTATE_HASHES,
  RECT_STYLES,
} from './constants';
import type { NativeRect, DOMRectFingerprint } from './types';

/**
 * Converts a DOMRect to a plain object.
 *
 * DOMRect is a special interface that doesn't spread well.
 * This extracts all 8 properties into a serializable object.
 */
function toNativeObject(domRect: DOMRect): NativeRect {
  return {
    bottom: domRect.bottom,
    height: domRect.height,
    left: domRect.left,
    right: domRect.right,
    width: domRect.width,
    top: domRect.top,
    x: domRect.x,
    y: domRect.y,
  };
}

/**
 * Calculates a checksum from rect dimensions.
 *
 * Used for comparing rect fingerprints.
 */
function getRectSum(rect: NativeRect): number {
  return Object.values(rect).reduce((acc, val) => acc + val, 0) / 100_000_000;
}

/**
 * Gets the best available rect method based on lie detection.
 *
 * Falls back to non-tampered APIs when available.
 */
function getBestRect(el: Element, doc: Document): DOMRect {
  if (!lieProps['Element.getClientRects']) {
    return el.getClientRects()[0];
  }
  if (!lieProps['Element.getBoundingClientRect']) {
    return el.getBoundingClientRect();
  }
  if (!lieProps['Range.getClientRects']) {
    const range = doc.createRange();
    range.selectNode(el);
    return range.getClientRects()[0];
  }
  const range = doc.createRange();
  range.selectNode(el);
  return range.getBoundingClientRect();
}

/**
 * Creates the measurement container with test elements.
 */
function createMeasurementContainer(doc: Document, containerId: string): void {
  const container = doc.createElement('div');
  container.id = containerId;

  // Build HTML content
  container.innerHTML = `
    <style>${RECT_STYLES}</style>
    <div class="rect-known"></div>
    <div class="rect-ghost"></div>
    <div style="perspective:100px;width:1000.099%;" id="rect-container">
      <div id="cRect1" class="rects"></div>
      <div id="cRect2" class="rects"></div>
      <div id="cRect3" class="rects"></div>
      <div id="cRect4" class="rects absolute"></div>
      <div id="cRect5" class="rects"></div>
      <div id="cRect6" class="rects"></div>
      <div id="cRect7" class="rects absolute"></div>
      <div id="cRect8" class="rects absolute"></div>
      <div id="cRect9" class="rects absolute"></div>
      <div id="cRect10" class="rects absolute"></div>
      <div id="cRect11" class="rects"></div>
      <div id="cRect12" class="rects"></div>
    </div>
    <div id="emoji-container">
      <style>
      .domrect-emoji {
        font-family: ${CSS_FONT_FAMILY};
        font-size: 200px !important;
        height: auto;
        position: absolute !important;
        transform: scale(1.000999);
      }
      </style>
      ${EMOJIS.map((emoji) => `<div class="domrect-emoji">${emoji}</div>`).join('')}
    </div>
  `;

  doc.body.appendChild(container);
}

/**
 * Measures emoji dimensions for fingerprinting.
 *
 * Different rendering engines produce different bounding boxes for emojis.
 */
function measureEmojis(doc: Document): {
  emojiSet: string[];
  domrectSystemSum: number;
} {
  const pattern = new Set<string>();
  const emojiSet = new Set<string>();
  const emojiElems = doc.getElementsByClassName('domrect-emoji');

  for (let i = 0; i < emojiElems.length; i++) {
    const el = emojiElems[i];
    const rect = getBestRect(el, doc);
    const dimensions = `${rect.width},${rect.height}`;

    if (!pattern.has(dimensions)) {
      pattern.add(dimensions);
      emojiSet.add(EMOJIS[i]);
    }
  }

  // Calculate fingerprint sum
  const domrectSystemSum =
    0.00001 *
    [...pattern]
      .map((x) => x.split(',').reduce((acc, v) => acc + (+v || 0), 0))
      .reduce((acc, x) => acc + x, 0);

  return { emojiSet: [...emojiSet], domrectSystemSum };
}

/**
 * Detects shift calculation tampering.
 *
 * Some fingerprint randomizers fail to maintain consistent offsets
 * when CSS classes are toggled.
 */
function detectShiftLie(rect4: Element, initialTop: number): boolean {
  rect4.classList.add('shift-dom-rect');
  const shiftedTop = rect4.getClientRects()[0].top;
  rect4.classList.remove('shift-dom-rect');
  const unshiftedTop = rect4.getClientRects()[0].top;

  const diff = initialTop - shiftedTop;
  return diff !== unshiftedTop - shiftedTop;
}

/**
 * Detects math calculation lies.
 *
 * Verifies that right-left=width and bottom-top=height.
 * Fingerprint randomizers that add noise often break these invariants.
 */
function detectMathLie(rects: NativeRect[]): boolean {
  return rects.some((rect) => {
    const { right, left, width, bottom, top, height, x, y } = rect;
    return (
      right - left !== width ||
      bottom - top !== height ||
      right - x !== width ||
      bottom - y !== height
    );
  });
}

/**
 * Collects DOMRect fingerprint data.
 *
 * Creates test elements with complex CSS transforms and measures their
 * bounding rectangles. The floating-point precision differences between
 * browsers create a unique fingerprint.
 *
 * @returns DOMRect fingerprint data or undefined on error
 */
export default async function getClientRects(): Promise<
  DOMRectFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Check for API tampering
    let lied = !!(
      lieProps['Element.getClientRects'] ||
      lieProps['Element.getBoundingClientRect'] ||
      lieProps['Range.getClientRects'] ||
      lieProps['Range.getBoundingClientRect'] ||
      lieProps['String.fromCodePoint']
    );

    // Use phantom iframe for isolation
    const DOC = PHANTOM_DARKNESS?.document?.body
      ? PHANTOM_DARKNESS.document
      : document;

    // Create measurement container
    const containerId = `${instanceId}-client-rects-div`;
    createMeasurementContainer(DOC, containerId);

    // Measure emojis
    await queueEvent(timer);
    const { emojiSet, domrectSystemSum } = measureEmojis(DOC);

    // Get rect elements
    const rectElems = [...DOC.getElementsByClassName('rects')];
    const range = document.createRange();

    // Collect rects from all APIs
    const elementClientRects = rectElems.map((el) =>
      toNativeObject(el.getClientRects()[0]),
    );

    const elementBoundingClientRect = rectElems.map((el) =>
      toNativeObject(el.getBoundingClientRect()),
    );

    const rangeClientRects = rectElems.map((el) => {
      range.selectNode(el);
      return toNativeObject(range.getClientRects()[0]);
    });

    const rangeBoundingClientRect = rectElems.map((el) => {
      range.selectNode(el);
      return toNativeObject(el.getBoundingClientRect());
    });

    // Detect shift calculation lie
    if (detectShiftLie(rectElems[3], elementClientRects[3].top)) {
      lied = true;
      documentLie('Element.getClientRects', 'failed unshift calculation');
    }

    // Detect math calculation lie
    if (detectMathLie(elementClientRects)) {
      lied = true;
      documentLie('Element.getClientRects', 'failed math calculation');
    }

    // Detect equal elements mismatch
    const { right: right1, left: left1 } = elementClientRects[10];
    const { right: right2, left: left2 } = elementClientRects[11];
    if (right1 !== right2 || left1 !== left2) {
      lied = true;
      documentLie('Element.getClientRects', 'equal elements mismatch');
    }

    // Detect unknown rotate dimensions
    const knownEl = DOC.getElementsByClassName('rect-known')[0];
    const knownDimensions = toNativeObject(knownEl.getClientRects()[0]);
    const knownHash = hashMini(knownDimensions);

    if (IS_BLINK && !BLINK_ROTATE_HASHES[knownHash]) {
      lied = true;
      documentLie('Element.getClientRects', 'unknown rotate dimensions');
    } else if (IS_GECKO && !GECKO_ROTATE_HASHES[knownHash]) {
      lied = true;
      documentLie('Element.getClientRects', 'unknown rotate dimensions');
    }

    // Detect ghost dimensions (0x0 element with non-zero rect)
    const ghostEl = DOC.getElementsByClassName('rect-ghost')[0];
    const ghostDimensions = toNativeObject(ghostEl.getClientRects()[0]);
    const hasGhostDimensions = Object.values(ghostDimensions).some(
      (v) => v !== 0,
    );

    if (hasGhostDimensions) {
      lied = true;
      documentLie('Element.getClientRects', 'unknown ghost dimensions');
    }

    // Cleanup
    const container = DOC.getElementById(containerId);
    if (container) DOC.body.removeChild(container);

    logTestResult({ time: timer.stop(), test: 'rects', passed: true });

    return {
      elementClientRects,
      elementBoundingClientRect,
      rangeClientRects,
      rangeBoundingClientRect,
      emojiSet,
      domrectSystemSum,
      lied,
    };
  } catch (error) {
    logTestResult({ test: 'rects', passed: false });
    captureError(error);
    return undefined;
  }
}
