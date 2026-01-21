/**
 * AR-188: Zod Schemas for dev-time validation
 * This file is only imported in tests, not bundled into the browser build
 */

import { z } from 'zod';

/** Identifiers section schema */
const IdentifiersV2Schema = z.object({
  session_id: z.string(),
  evercookie_id: z.string().optional(),
  public_key: z.string().optional(),
});

/** Hashes section schema - stable, fuzzy, plus dynamic module hashes */
const HashesV2Schema = z
  .object({
    stable: z.string(),
    fuzzy: z.string(),
  })
  .catchall(z.string()); // Allow additional module hashes

/** Device section schema - full loose fingerprint (any structure) */
const DeviceV2Schema = z.record(z.unknown());

/** Network section schema - full sigint (any structure) */
const NetworkV2Schema = z.record(z.unknown()).optional();

/** AR-188: Complete v2 payload schema for dev-time validation */
export const PayloadV2Schema = z.object({
  identifiers: IdentifiersV2Schema,
  hashes: HashesV2Schema,
  device: DeviceV2Schema,
  network: NetworkV2Schema,
});
