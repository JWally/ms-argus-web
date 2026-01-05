/**
 * Audio Fingerprinting Constants
 *
 * Configuration for Web Audio API fingerprinting.
 */

/**
 * Audio context configuration constants
 */
export const AUDIO_CONFIG = {
  /** Number of samples to render for fingerprinting */
  BUFFER_LENGTH: 5000,

  /** Sample rate for audio context (standard CD quality) */
  SAMPLE_RATE: 44100,

  /** Range of samples to extract for comparison (start index) */
  SAMPLE_RANGE_START: 4500,

  /** Range of samples to extract for comparison (end index) */
  SAMPLE_RANGE_END: 4600,

  /** Oscillator frequency for fingerprint generation */
  OSCILLATOR_FREQUENCY: 10000,

  /** Dynamics compressor threshold */
  COMPRESSOR_THRESHOLD: -50,

  /** Dynamics compressor knee */
  COMPRESSOR_KNEE: 40,
} as const;

/**
 * Random trap value used to detect audio buffer modifications.
 * This value is written to specific positions in the audio buffer
 * and checked later - if it's been altered, tampering is detected.
 */
export const AUDIO_TRAP = Math.random();
