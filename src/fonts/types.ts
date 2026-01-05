/**
 * Font Fingerprinting Types
 *
 * Type definitions for font-based fingerprinting.
 */

/**
 * Emoji dimension measurement result.
 */
export interface EmojiDimensions {
  width: string;
  height: string;
}

/**
 * Pixel emoji analysis result.
 *
 * Emoji rendering varies by OS and version, providing a fingerprint signal.
 */
export interface PixelEmojiResult {
  /** Unique emojis based on distinct dimension patterns */
  emojiSet: string[];
  /** Sum of all unique dimension values (for fingerprinting) */
  pixelSizeSystemSum: number;
}

/**
 * Complete font fingerprint result.
 */
export interface FontFingerprint {
  /** Fonts detected via FontFace.load() API */
  fontFaceLoadFonts: string[];

  /** Detected OS/version based on fonts (e.g., "Windows 11", "macOS Ventura") */
  platformVersion: string | undefined;

  /** Detected desktop applications based on their fonts */
  apps: string[];

  /** Unique emojis from dimension analysis */
  emojiSet: string[];

  /** Emoji pixel size fingerprint */
  pixelSizeSystemSum: number;

  /** Whether tampering was detected */
  lied: string[] | false;
}
