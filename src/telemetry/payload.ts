/**
 * V2 Payload builder
 * AR-187: Build v2 format payload from telemetry submission data
 */

import type { TelemetrySubmission, PayloadV2, IdentifiersV2 } from './types';

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
 * Build v2 format payload from telemetry submission data
 */
export function buildPayloadV2(
  data: TelemetrySubmission,
  sessionId: string,
): PayloadV2 {
  const loose = data.fingerprint.loose || {};

  // Build identifiers section
  const identifiers: IdentifiersV2 = {
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

  // Build payload
  const payload: PayloadV2 = {
    identifiers,
    hashes,
    device: { ...loose },
    network: data.sigint ? { ...data.sigint } : undefined,
  };

  // Log what we're sending (before gzip)
  console.log('[Argus] Payload to server:', payload);

  return payload;
}
