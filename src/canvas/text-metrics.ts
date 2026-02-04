/**
 * TextMetrics Analysis
 *
 * Functions for analyzing canvas TextMetrics to detect tampering and
 * create fingerprints based on font rendering differences across platforms.
 *
 * @module canvas/text-metrics
 */

import { CSS_FONT_FAMILY, EMOJIS } from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';

/**
 * Test strings for comprehensive text metrics fingerprinting.
 * Includes Latin, CJK, Arabic, and special characters that
 * render differently across font stacks.
 */
export const TEXT_METRICS_TEST_STRINGS = [
  'Sphinx of black quartz, judge my vow!', // Latin pangram
  'fjord', // Ligatures: fi, fj
  'WAVE', // Kerning: WA, AV, VE
  'Illegal1l|', // Ambiguous characters
  '日本語テスト', // Japanese
  'العربية', // Arabic (RTL)
  '🎨🔥💻', // Emojis (multi-codepoint)
  'ﬁﬂﬀ', // Ligature characters
];

/**
 * Font configurations to test for rendering differences.
 * Variable fonts and system fonts behave differently across OSes.
 */
export const TEXT_METRICS_FONTS = [
  '16px sans-serif',
  '16px serif',
  '16px monospace',
  '24px system-ui', // Modern system font
  'italic 16px sans-serif',
  'bold 16px sans-serif',
  '16px "Segoe UI", sans-serif', // Windows
  '16px "-apple-system", sans-serif', // macOS/iOS
];

/**
 * Extracts all available TextMetrics properties.
 * Different browsers/OSes return different values for baselines.
 *
 * @param metrics - TextMetrics object from measureText
 * @returns Array of numeric metric values
 */
export function extractAllMetrics(metrics: TextMetrics): number[] {
  // Standard properties (well-supported)
  const standard = [
    metrics.width,
    metrics.actualBoundingBoxAscent,
    metrics.actualBoundingBoxDescent,
    metrics.actualBoundingBoxLeft,
    metrics.actualBoundingBoxRight,
    metrics.fontBoundingBoxAscent,
    metrics.fontBoundingBoxDescent,
  ];

  // Extended baseline properties (newer, vary by OS font rendering)
  // These properties are in newer TypeScript lib types but may not exist in older browsers
  const m = metrics as unknown as Record<string, number | undefined>;
  const alphabeticBaseline = m.alphabeticBaseline ?? 0;
  const hangingBaseline = m.hangingBaseline ?? 0;
  const ideographicBaseline = m.ideographicBaseline ?? 0;
  const emHeightAscent = m.emHeightAscent ?? 0;
  const emHeightDescent = m.emHeightDescent ?? 0;

  return [
    ...standard,
    alphabeticBaseline,
    hangingBaseline,
    ideographicBaseline,
    emHeightAscent,
    emHeightDescent,
  ].map((v) => v || 0);
}

/**
 * Detects if TextMetrics values contain suspicious floating-point noise.
 *
 * Legitimate TextMetrics values should be integers or clean floats.
 * Some privacy tools add small random decimals to these values.
 * For example, width might be 45.00001234 instead of 45.
 *
 * @param context - Canvas 2D context to test
 * @returns true if suspicious float values detected
 */
export function getTextMetricsFloatLie(
  context: CanvasRenderingContext2D,
): boolean {
  /** Checks whether a number has a fractional component. */
  const isFloat = (n: number) => n % 1 !== 0;

  const metrics = context.measureText('') || {};
  const {
    actualBoundingBoxAscent: abba,
    actualBoundingBoxDescent: abbd,
    actualBoundingBoxLeft: abbl,
    actualBoundingBoxRight: abbr,
    fontBoundingBoxAscent: fbba,
    fontBoundingBoxDescent: fbbd,
  } = metrics;

  // Check if any bounding box value is an unexpected float
  // Note: width is excluded as it can legitimately be a float
  const lied = [abba, abbd, abbl, abbr, fbba, fbbd].find((x) =>
    isFloat(x || 0),
  );

  return !!lied;
}

/**
 * Extended TextMetrics fingerprint data.
 */
export interface TextMetricsExtended {
  /** Whether newer baseline properties (alphabeticBaseline, etc.) are supported */
  baselineSupport: boolean;
  /** Fingerprint of font metrics across multiple fonts and test strings */
  fontFingerprint: string;
  /** XOR hash of all collected metrics */
  metricsHash: string;
}

/**
 * Result from emoji metrics collection.
 */
export interface EmojiMetricsResult {
  /** Unique emoji glyphs based on distinct rendering metrics */
  emojiSet: Set<string>;
  /** Sum of text metrics for fingerprinting */
  textMetricsSystemSum: number;
  /** Extended metrics fingerprint data */
  textMetricsExtended: TextMetricsExtended;
}

/**
 * Collects unique emoji rendering patterns via TextMetrics.
 *
 * Different platforms render emojis at different sizes. By measuring
 * the bounding boxes of various emojis, we can:
 * 1. Identify the platform (Windows, macOS, iOS, Android)
 * 2. Detect emoji font availability
 * 3. Create a stable fingerprint based on text rendering
 *
 * @param context - Canvas 2D context to measure with
 * @returns Object containing unique emoji set and metrics sum
 */
export function collectEmojiMetrics(
  context: CanvasRenderingContext2D,
): EmojiMetricsResult {
  context.font = `10px ${CSS_FONT_FAMILY.replace(/!important/gm, '')}`;

  const pattern = new Set<string>();
  const emojiSet = new Set<string>();

  // Measure each emoji and collect unique dimension patterns
  for (const emoji of EMOJIS) {
    const metrics = context.measureText(emoji) || {};
    const {
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      fontBoundingBoxAscent,
      fontBoundingBoxDescent,
      width,
    } = metrics;

    const dimensions = [
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      fontBoundingBoxAscent,
      fontBoundingBoxDescent,
      width,
    ].join(',');

    // Only keep one emoji per unique dimension pattern
    if (!pattern.has(dimensions)) {
      pattern.add(dimensions);
      emojiSet.add(emoji);
    }
  }

  // Calculate a sum of all metric values for fingerprinting
  // Multiplied by small number to keep value manageable
  const textMetricsSystemSum =
    0.00001 *
    [...pattern]
      .map((x) => x.split(',').reduce((acc, val) => acc + (+val || 0), 0))
      .reduce((acc, x) => acc + x, 0);

  // Extended TextMetrics collection
  // Test baseline support (newer browsers)
  const testMetrics = context.measureText('test') as unknown as Record<
    string,
    unknown
  >;
  const baselineSupport = typeof testMetrics.alphabeticBaseline === 'number';

  // Collect comprehensive font metrics across fonts and strings
  const allMetrics: number[] = [];

  for (const font of TEXT_METRICS_FONTS) {
    try {
      context.font = font;
    } catch {
      expectFailure('collectEmojiMetrics', `Font not available: ${font}`);
      continue;
    }

    for (const str of TEXT_METRICS_TEST_STRINGS) {
      try {
        const metrics = context.measureText(str);
        allMetrics.push(...extractAllMetrics(metrics));
      } catch {
        expectFailure(
          'collectEmojiMetrics',
          `Text measurement failed for: ${str.slice(0, 10)}`,
        );
      }
    }
  }

  // Create fingerprints from collected metrics
  const fontFingerprint = allMetrics
    .map((v) => Math.round(v * 100))
    .slice(0, 50) // Take first 50 values for stability
    .join(',');

  // XOR hash of all metrics
  let metricsXor = 0;
  for (const v of allMetrics) {
    metricsXor ^= Math.round(v * 1000);
  }

  return {
    emojiSet,
    textMetricsSystemSum,
    textMetricsExtended: {
      baselineSupport,
      fontFingerprint,
      metricsHash: metricsXor.toString(16),
    },
  };
}
