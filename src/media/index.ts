/**
 * Media Fingerprinting Module
 *
 * Detects supported media codecs for fingerprinting.
 * Media codec support provides unique fingerprint signals because:
 *
 * 1. **Browser Differences**: Each browser supports different codecs.
 *    Chrome and Firefox support VP8/VP9, Safari prefers H.264/AAC.
 *
 * 2. **Platform Differences**: Hardware codec support varies by OS.
 *    Hardware-accelerated codecs depend on the GPU/platform.
 *
 * 3. **Version Detection**: New codecs are added with browser updates.
 *    VP9/AV1 support indicates newer browser versions.
 *
 * 4. **API Consistency**: Tests multiple APIs (canPlayType, MediaSource,
 *    MediaRecorder) which should be consistent but may not be when spoofed.
 *
 * @see https://privacycheck.sec.lrz.de/active/fp_cpt/fp_can_play_type.html
 * @see https://arkenfox.github.io/TZP
 * @module media
 */

import { captureError } from '../errors';
import { createTimer, logTestResult } from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';
import { MIME_TYPE_TEST_LIST } from './constants';
import type { MimeTypeSupport, MediaFingerprint } from './types';

/**
 * Tests MIME type support across multiple media APIs.
 *
 * For each MIME type, tests:
 * - Audio canPlayType() - HTML5 audio element support
 * - Video canPlayType() - HTML5 video element support
 * - MediaSource.isTypeSupported() - MSE/streaming support
 * - MediaRecorder.isTypeSupported() - Recording support
 *
 * Different APIs may have different support levels, which helps
 * identify the browser and detect inconsistencies.
 *
 * @returns Array of MIME types with their support status
 */
function getMimeTypes(): MimeTypeSupport[] | undefined {
  try {
    // Create test elements
    const videoEl = document.createElement('video');
    const audioEl = new Audio();
    const isMediaRecorderSupported = 'MediaRecorder' in window;

    // Sort for consistent ordering
    const sortedMimeTypes = [...MIME_TYPE_TEST_LIST].sort();

    // Test each MIME type
    const types = sortedMimeTypes.reduce(
      (acc: MimeTypeSupport[], type: string) => {
        const data: MimeTypeSupport = {
          mimeType: type,
          audioPlayType: audioEl.canPlayType(type),
          videoPlayType: videoEl.canPlayType(type),
          mediaSource: MediaSource.isTypeSupported(type),
          mediaRecorder: isMediaRecorderSupported
            ? MediaRecorder.isTypeSupported(type)
            : false,
        };

        // Only include if at least one API supports this type
        if (
          data.audioPlayType ||
          data.videoPlayType ||
          data.mediaSource ||
          data.mediaRecorder
        ) {
          acc.push(data);
        }

        return acc;
      },
      [],
    );

    return types;
  } catch {
    expectFailure('testMimeTypes', 'MIME type testing failed');
    return undefined;
  }
}

/**
 * Collects media fingerprint data.
 *
 * Tests codec support across multiple APIs to build a fingerprint
 * of the browser's media capabilities.
 *
 * @returns Media fingerprint data or undefined on error
 */
export default async function getMedia(): Promise<
  MediaFingerprint | undefined
> {
  try {
    const timer = createTimer();
    timer.start();

    const mimeTypes = getMimeTypes();

    logTestResult({ time: timer.stop(), test: 'media', passed: true });
    return { mimeTypes };
  } catch (error) {
    logTestResult({ test: 'media', passed: false });
    captureError(error as Error);
    return undefined;
  }
}
