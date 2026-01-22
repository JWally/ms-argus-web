/**
 * AR-188: Zod Schemas for dev-time validation
 * This file is only imported in tests, not bundled into the browser build
 * Updated to V3 format (sigint instead of network)
 */

import { z } from 'zod';

/** Identifiers section schema */
const IdentifiersV3Schema = z.object({
  session_id: z.string(),
  evercookie_id: z.string().optional(),
  public_key: z.string().optional(),
});

/** Hashes section schema - stable, fuzzy, plus dynamic module hashes */
const HashesV3Schema = z
  .object({
    stable: z.string(),
    fuzzy: z.string(),
  })
  .catchall(z.string()); // Allow additional module hashes

/** Device section schema - full loose fingerprint (any structure) */
const DeviceV3Schema = z.record(z.unknown());

/** Sigint section schema - full sigint (renamed from network in V2) */
const SigintV3Schema = z.record(z.unknown()).optional();

/** AR-188: Complete v3 payload schema for dev-time validation */
export const PayloadV3Schema = z.object({
  identifiers: IdentifiersV3Schema,
  hashes: HashesV3Schema,
  device: DeviceV3Schema,
  sigint: SigintV3Schema,
});

// Keep V2 alias for backward compatibility
export const PayloadV2Schema = PayloadV3Schema;
