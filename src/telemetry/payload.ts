/**
 * Payload builder - constructs the submission payload from telemetry data
 */

import type {
  TelemetrySubmission,
  ArgusPayload,
  PayloadIdentifiers,
} from './types';

/**
 * Extract all $hash values from loose fingerprint modules
 */
function extractHashes(loose: Record<string, any>): Record<string, string> {
  const hashes: Record<string, string> = {};

  for (const [key, value] of Object.entries(loose)) {
    if (value && typeof value === 'object' && '$hash' in value) {
      hashes[key] = value.$hash;
    }
  }

  return hashes;
}

/**
 * Build submission payload from telemetry data
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

  const payload: ArgusPayload = {
    identifiers,
    hashes,
    device: { ...loose },
    sigint: data.sigint ? { ...data.sigint } : undefined,
  };

  return payload;
}
