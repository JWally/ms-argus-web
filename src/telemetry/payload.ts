/**
 * Payload Builder
 *
 * Constructs the submission payload from telemetry data for API transmission.
 *
 * @module telemetry/payload
 */

declare const __BUILD_ID__: string;

import type {
  TelemetrySubmission,
  ArgusPayload,
  PayloadIdentifiers,
} from './types';
import { compactFingerprint } from '../utils/crypto';

/**
 * Extract all $hash and $fuzzy values from loose fingerprint modules.
 *
 * @param loose - Loose fingerprint data object with module hashes
 * @returns Map of module name to hash value, with fuzzy hashes prefixed by underscore
 */
function extractHashes(loose: Record<string, any>): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const [key, value] of Object.entries(loose)) {
    if (value && typeof value === 'object') {
      if ('$hash' in value) {
        hashes[key] = value.$hash;
      }
      if ('$fuzzy' in value) {
        hashes[`_${key}`] = value.$fuzzy;
      }
    }
  }

  return hashes;
}

/**
 * Build submission payload from telemetry data.
 *
 * @param data - Telemetry submission data with fingerprint and identifiers
 * @param sessionId - Unique session identifier
 * @returns Formatted payload ready for API submission
 */
export function buildPayload(
  data: TelemetrySubmission,
  sessionId: string,
): ArgusPayload {
  const loose = data.fingerprint.loose || {};

  // Build identifiers section
  const identifiers: PayloadIdentifiers = {
    session_id: sessionId,
    evercookie_id: data.evercookie?.id,
    public_key: data.cryptoId?.publicKey,
  };

  // Build hashes section: stable, fuzzy, + all module hashes from loose
  const hashes = {
    stable: data.fingerprint.hashes?.stable || '',
    fuzzy: data.fingerprint.hashes?.fuzzy || '',
    ...extractHashes(loose),
  };

  // Include delta report: keys dropped as volatile between dual runs
  const deltaReport = data.fingerprint.deltaReport;
  const hasDroppedKeys =
    deltaReport && Object.values(deltaReport).some((keys) => keys.length > 0);

  // Compact large arrays/strings in device data to reduce payload size.
  // Arrays >50 elements and strings >500 chars become { $simhash, $len }.
  // This preserves similarity matching while dramatically reducing size.
  const compactedDevice = compactFingerprint(loose) as Record<string, unknown>;

  const payload: ArgusPayload = {
    identifiers,
    hashes,
    device: compactedDevice,
    deltaReport: hasDroppedKeys ? deltaReport : undefined,
    sigint: data.sigint ? { ...data.sigint } : undefined,
    buildId: __BUILD_ID__,
  };

  return payload;
}
