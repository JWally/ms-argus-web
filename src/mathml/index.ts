/**
 * MathML Layout Fingerprinting Module
 *
 * Measures MathML element layout dimensions to fingerprint the rendering engine.
 * MathML rendering varies significantly across layout engines:
 *
 * - **Blink/WebKit**: Native MathML support with engine-specific layout
 * - **Gecko**: Mature MathML implementation with distinct metrics
 * - **Unsupported**: Falls back to inline rendering, producing flat dimensions
 *
 * @module mathml
 */

import { captureError } from '../errors';
import { createTimer, logTestResult } from '../utils/helpers';
import { MATHML_TEST_ELEMENTS } from './constants';
import type { MathMLFingerprint, MathMLRect } from './types';

/**
 * Collects MathML layout fingerprint data.
 *
 * Creates a hidden container, renders each MathML test element,
 * and measures the bounding client rect. Produces a dimension sum
 * for quick comparison and per-element rects for detailed analysis.
 *
 * @returns MathML fingerprint data or undefined on error
 */
export default function getMathML(): MathMLFingerprint | undefined {
  try {
    const timer = createTimer();
    timer.start();

    // Create hidden container
    const container = document.createElement('div');
    container.style.cssText =
      'position:absolute;top:-10000px;left:-10000px;visibility:hidden;';
    document.body.appendChild(container);

    // Check MathML support by rendering a simple element
    const probe = document.createElement('div');
    probe.innerHTML = '<math><mrow><mn>1</mn></mrow></math>';
    container.appendChild(probe);
    const probeRect = probe.querySelector('math')?.getBoundingClientRect();
    const supported = !!(probeRect && probeRect.height > 0);

    if (!supported) {
      container.parentNode?.removeChild(container);
      logTestResult({ time: timer.stop(), test: 'mathml', passed: true });
      return { supported: false, rects: {}, dimensionSum: 0, lied: false };
    }

    // Measure each test element
    const rects: Record<string, MathMLRect> = {};
    let dimensionSum = 0;

    for (const [name, markup] of MATHML_TEST_ELEMENTS) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `<math>${markup}</math>`;
      container.appendChild(wrapper);

      const mathEl = wrapper.querySelector('math');
      if (mathEl) {
        const rect = mathEl.getBoundingClientRect();
        const width = Math.round(rect.width * 1000) / 1000;
        const height = Math.round(rect.height * 1000) / 1000;
        rects[name] = { width, height };
        dimensionSum += width + height;
      }
    }

    dimensionSum = Math.round(dimensionSum * 1000) / 1000;

    // Cleanup
    container.parentNode?.removeChild(container);

    logTestResult({ time: timer.stop(), test: 'mathml', passed: true });
    return { supported, rects, dimensionSum, lied: false };
  } catch (error) {
    logTestResult({ test: 'mathml', passed: false });
    captureError(error as Error);
    return undefined;
  }
}
