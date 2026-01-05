/**
 * Speech Synthesis Fingerprinting Constants
 *
 * Configuration for voice detection.
 */

/**
 * Initial delay before querying voices.
 *
 * Voice services may not be immediately available.
 * A short delay helps ensure voices are loaded.
 */
export const VOICE_LOAD_DELAY_MS = 50;

/**
 * Timeout for voice loading.
 *
 * If voices don't load within this time, give up.
 */
export const VOICE_TIMEOUT_MS = 200;
