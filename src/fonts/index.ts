/**
 * Font Fingerprinting Module
 *
 * Detects installed fonts to fingerprint the user and identify their OS.
 * Font fingerprinting is effective because:
 *
 * 1. **OS Detection**: Each operating system ships with unique fonts.
 *    Windows has Segoe UI, macOS has SF Pro, Linux has Ubuntu fonts.
 *
 * 2. **Version Detection**: New OS versions add new fonts, allowing us
 *    to determine not just the OS but its specific version.
 *
 * 3. **Application Detection**: Desktop apps like Office, Adobe products,
 *    and LibreOffice install their own fonts.
 *
 * 4. **Emoji Rendering**: Emoji dimensions vary by OS and version due to
 *    different emoji fonts and rendering engines.
 *
 * The module uses the FontFace API to probe for installed fonts without
 * the old "fallback font" technique that was easily detectable.
 *
 * @see https://www.lalit.org/lab/javascript-css-font-detect/ - Original technique
 * @module fonts
 */

import { captureError } from '../errors';
import { PHANTOM_DARKNESS, lieProps, getRandomValues } from '../lies';
import { sendToTrash } from '../trash';
import {
  CSS_FONT_FAMILY,
  createTimer,
  queueEvent,
  EMOJIS,
  logTestResult,
  USER_AGENT_OS,
  LowerEntropy,
  Analysis,
} from '../utils/helpers';
import { PlatformClassifier } from '../utils/types';

import {
  FONT_LIST,
  WINDOWS_FONTS_BY_VERSION,
  MACOS_FONTS_BY_VERSION,
  DESKTOP_APP_FONTS,
  WINDOWS_VERSION_MAP,
  MACOS_VERSION_MAP,
  WINDOWS_INDICATOR_FONTS,
  APPLE_INDICATOR_FONTS,
  LINUX_INDICATOR_FONTS,
} from './constants';
import type { FontFingerprint, PixelEmojiResult } from './types';

/**
 * Checks if detected fonts don't match the reported OS.
 *
 * This cross-validation detects UA spoofing. For example, if a user
 * claims to be on Windows but has macOS-specific fonts installed,
 * that's a strong indicator of spoofing.
 *
 * @param userAgentOS - OS detected from user agent
 * @param fonts - List of detected fonts
 * @returns True if fonts don't match the claimed OS
 */
export function isFontOSBad(userAgentOS: string, fonts: string[]): boolean {
  if (!userAgentOS || !fonts || !fonts.length) return false;

  // Create a lookup set for O(1) font checking
  const fontSet = new Set(fonts);

  const isLikeWindows = WINDOWS_INDICATOR_FONTS.some((f) => fontSet.has(f));
  const isLikeApple = APPLE_INDICATOR_FONTS.some((f) => fontSet.has(f));
  const isLikeLinux = LINUX_INDICATOR_FONTS.some((f) => fontSet.has(f));

  if (isLikeWindows && userAgentOS !== PlatformClassifier.WINDOWS) {
    return true;
  }
  if (isLikeApple && userAgentOS !== PlatformClassifier.APPLE) {
    return true;
  }
  if (isLikeLinux && userAgentOS !== PlatformClassifier.LINUX) {
    return true;
  }

  return false;
}

/**
 * Measures emoji dimensions for fingerprinting.
 *
 * Different OSes render emojis with different dimensions due to:
 * - Different emoji fonts (Apple Color Emoji, Noto Color Emoji, Segoe UI Emoji)
 * - Different rendering engines
 * - Different font metrics
 *
 * By measuring emoji dimensions, we can fingerprint the emoji font and OS.
 *
 * @param doc - Document to use for measurements
 * @param emojis - Array of emoji characters to measure
 * @returns Unique emoji set and dimension sum
 */
function measurePixelEmojis(doc: Document, emojis: string[]): PixelEmojiResult {
  try {
    // Create measurement container
    const container = doc.createElement('div');
    container.id = 'pixel-emoji-container';
    container.style.cssText = 'position:absolute;visibility:hidden;';

    // Create emoji elements
    emojis.forEach((emoji) => {
      const el = doc.createElement('div');
      el.className = 'pixel-emoji';
      el.style.cssText = `font-family:${CSS_FONT_FAMILY};font-size:200px!important;height:auto;position:absolute!important;transform:scale(1.000999);`;
      el.textContent = emoji;
      container.appendChild(el);
    });

    doc.body.appendChild(container);

    // Measure unique dimension patterns
    const pattern = new Set<string>();
    const emojiSet = new Set<string>();
    const emojiElems = container.getElementsByClassName('pixel-emoji');

    for (let i = 0; i < emojiElems.length; i++) {
      const style = getComputedStyle(emojiElems[i]);
      const dimensions = `${style.inlineSize},${style.blockSize}`;

      if (!pattern.has(dimensions)) {
        pattern.add(dimensions);
        emojiSet.add(emojis[i]);
      }
    }

    // Calculate fingerprint sum from unique dimensions
    const pixelToNumber = (px: string): number => +px.replace('px', '') || 0;
    const pixelSizeSystemSum =
      0.00001 *
      [...pattern]
        .map((dim) =>
          dim
            .split(',')
            .map(pixelToNumber)
            .reduce((a, b) => a + b, 0),
        )
        .reduce((a, b) => a + b, 0);

    // Cleanup
    doc.body.removeChild(container);

    return {
      emojiSet: [...emojiSet],
      pixelSizeSystemSum,
    };
  } catch (error) {
    console.error(error);
    return { emojiSet: [], pixelSizeSystemSum: 0 };
  }
}

/**
 * Detects installed fonts using the FontFace API.
 *
 * This technique:
 * 1. Uses document.fonts.check() for quick checks
 * 2. Uses FontFace.load() with local() source for verification
 *
 * FontFace.load() with local() returns fulfilled if the font exists
 * locally, or rejected if it doesn't. This is more reliable than
 * the old technique of measuring text width with fallback fonts.
 *
 * @param fontList - List of font names to check
 * @returns Array of installed font names
 */
async function detectFontsViaFontFace(fontList: string[]): Promise<string[]> {
  try {
    let fontsChecked: string[] = [];

    // Quick check using document.fonts.check()
    // First verify the API works by checking a random (non-existent) font
    if (!document.fonts.check(`0px "${getRandomValues()}"`)) {
      fontsChecked = fontList.filter((font) =>
        document.fonts.check(`0px "${font}"`),
      );
    }

    // Deeper check using FontFace.load() with local() source
    const fontFaceList = fontList.map(
      (font) => new FontFace(font, `local("${font}")`),
    );

    const results = await Promise.allSettled(
      fontFaceList.map((font) => font.load()),
    );

    const fontsLoaded = results
      .filter(
        (result): result is PromiseFulfilledResult<FontFace> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value.family);

    // Combine and dedupe results
    return [...new Set([...fontsChecked, ...fontsLoaded])].sort();
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * Detects OS version from installed fonts.
 *
 * Each Windows/macOS version introduces new fonts. By checking which
 * version-specific fonts are present, we can determine the OS version.
 *
 * @param fonts - List of installed fonts
 * @returns OS version string (e.g., "Windows 11", "macOS Ventura")
 */
function detectPlatformVersion(fonts: string[]): string | undefined {
  const fontSet = new Set(fonts);

  // Check Windows versions
  const windowsVersions: Record<string, boolean | string | undefined> = {};
  for (const [version, versionFonts] of Object.entries(
    WINDOWS_FONTS_BY_VERSION,
  )) {
    if (version === '7') {
      // Windows 7 requires ALL fonts to be present
      windowsVersions[version] = versionFonts.every((f) => fontSet.has(f));
    } else {
      // Other versions just need one font
      windowsVersions[version] = versionFonts.find((f) => fontSet.has(f));
    }
  }

  const windowsHash = Object.keys(windowsVersions)
    .sort()
    .filter((key) => !!windowsVersions[key])
    .join(',');

  if (WINDOWS_VERSION_MAP[windowsHash]) {
    return `Windows ${WINDOWS_VERSION_MAP[windowsHash]}`;
  }

  // Check macOS versions
  const macVersions: Record<string, boolean | string | undefined> = {};
  for (const [version, versionFonts] of Object.entries(
    MACOS_FONTS_BY_VERSION,
  )) {
    if (version === '10.9') {
      // Mavericks requires ALL fonts
      macVersions[version] = versionFonts.every((f) => fontSet.has(f));
    } else {
      macVersions[version] = versionFonts.find((f) => fontSet.has(f));
    }
  }

  const macHash = Object.keys(macVersions)
    .sort()
    .filter((key) => !!macVersions[key])
    .join(',');

  if (MACOS_VERSION_MAP[macHash]) {
    return `macOS ${MACOS_VERSION_MAP[macHash]}`;
  }

  return undefined;
}

/**
 * Detects installed desktop applications from their fonts.
 *
 * Some applications install custom fonts. Detecting these fonts
 * reveals which applications the user has installed.
 *
 * @param fonts - List of installed fonts
 * @returns Array of detected application names
 */
function detectDesktopApps(fonts: string[]): string[] {
  const fontSet = new Set(fonts);

  return Object.entries(DESKTOP_APP_FONTS)
    .filter(([, appFonts]) => appFonts.every((f) => fontSet.has(f)))
    .map(([appName]) => appName);
}

/**
 * Checks for lie detection on font-related APIs.
 *
 * @returns Lie array or false if no tampering detected
 */
function detectFontLies(): string[] | false {
  return (
    lieProps['FontFace.load'] ||
    lieProps['FontFace.family'] ||
    lieProps['FontFace.status'] ||
    lieProps['String.fromCodePoint'] ||
    lieProps['CSSStyleDeclaration.setProperty'] ||
    lieProps['CSS2Properties.setProperty'] ||
    false
  );
}

/**
 * Collects font fingerprint data.
 *
 * This is the main entry point for font fingerprinting. It:
 * 1. Measures emoji dimensions for system fingerprinting
 * 2. Detects installed fonts via FontFace API
 * 3. Determines OS version from fonts
 * 4. Detects installed desktop applications
 * 5. Cross-validates fonts against reported OS
 *
 * @returns Font fingerprint data or undefined on error
 */
export default async function getFonts(): Promise<FontFingerprint | undefined> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Use phantom iframe for measurements if available
    const doc = PHANTOM_DARKNESS?.document?.body
      ? PHANTOM_DARKNESS.document
      : document;

    // Measure emoji dimensions
    const { emojiSet, pixelSizeSystemSum } = measurePixelEmojis(doc, EMOJIS);

    // Detect installed fonts
    const fontFaceLoadFonts = await detectFontsViaFontFace(FONT_LIST);

    // Determine OS version and apps from fonts
    const platformVersion = detectPlatformVersion(fontFaceLoadFonts);
    const apps = detectDesktopApps(fontFaceLoadFonts);

    // Check for API tampering
    const lied = detectFontLies();

    // Cross-validate fonts against reported OS
    if (isFontOSBad(USER_AGENT_OS, fontFaceLoadFonts)) {
      LowerEntropy.FONTS = true;
      Analysis.FontOsIsBad = true;
      sendToTrash('platform', `${USER_AGENT_OS} system and fonts are uncommon`);
    }

    logTestResult({ time: timer.stop(), test: 'fonts', passed: true });

    return {
      fontFaceLoadFonts,
      platformVersion,
      apps,
      emojiSet,
      pixelSizeSystemSum,
      lied,
    };
  } catch (error) {
    logTestResult({ test: 'fonts', passed: false });
    captureError(error);
    return undefined;
  }
}
