/**
 * V3 Payload builder
 * AR-187: Build v3 format payload from telemetry submission data
 * Updated from V2: "network" renamed to "sigint"
 */

import type { TelemetrySubmission, PayloadV3, IdentifiersV3 } from './types';

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
 * Build v3 format payload from telemetry submission data
 * V3 uses "sigint" instead of "network"
 */
export function buildPayloadV3(
  data: TelemetrySubmission,
  sessionId: string,
): PayloadV3 {
  const loose = data.fingerprint.loose || {};

  // Build identifiers section
  const identifiers: IdentifiersV3 = {
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

  // Build payload (V3: uses "sigint" instead of "network")
  const payload: PayloadV3 = {
    identifiers,
    hashes,
    device: { ...loose },
    sigint: data.sigint ? { ...data.sigint } : undefined,
  };

  // Log what we're sending (before gzip)
  console.log('[Argus] Payload to server:', payload);

  return payload;
}
