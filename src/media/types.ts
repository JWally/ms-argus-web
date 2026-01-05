/**
 * Media Fingerprinting Types
 *
 * Type definitions for media codec detection.
 */

/**
 * Support result for a single MIME type.
 */
export interface MimeTypeSupport {
  /** The MIME type tested */
  mimeType: string;
  /** canPlayType() result for audio element */
  audioPlayType: '' | 'maybe' | 'probably';
  /** canPlayType() result for video element */
  videoPlayType: '' | 'maybe' | 'probably';
  /** MediaSource.isTypeSupported() result */
  mediaSource: boolean;
  /** MediaRecorder.isTypeSupported() result */
  mediaRecorder: boolean;
}

/**
 * Media fingerprint result.
 */
export interface MediaFingerprint {
  /** MIME types with their support status */
  mimeTypes: MimeTypeSupport[] | undefined;
}
