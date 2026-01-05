/**
 * Speech Synthesis Fingerprinting Types
 *
 * Type definitions for voice enumeration fingerprinting.
 */

/**
 * Speech synthesis fingerprint result.
 */
export interface SpeechFingerprint {
  /** Local (offline) voice names */
  local: string[];
  /** Remote (online) voice names */
  remote: string[];
  /** Unique language codes from all voices */
  languages: string[];
  /** Default local voice name */
  defaultVoiceName: string;
  /** Default local voice language */
  defaultVoiceLang: string;
  /** Whether tampering was detected */
  lied: boolean;
}
