/**
 * Telemetry module - Submits fingerprint data to the Argus API
 *
 * AR-187: V2 payload structure
 * AR-188: Schema version header and dev-time Zod validation
 * AR-189: V2 session response parsing
 */

// Types
export type {
  // V2 Payload types
  IdentifiersV2,
  HashesV2,
  DeviceV2,
  NetworkV2,
  PayloadV2,
  // Config types
  TelemetryConfig,
  TelemetrySubmission,
  // Result types
  SimHashDetails,
  FuzzyMatchInfo,
  MatchResult,
  TelemetryResult,
  SessionResponseV2,
} from './types';

// Payload builder
export { buildPayloadV2 } from './payload';

// API functions
export {
  SCHEMA_VERSION,
  submitTelemetry,
  parseSessionResponseV2,
  getMatchTierLabel,
} from './api';

// Helpers (exported for testing)
export {
  buildApiBase,
  detectStageFromHostname,
  detectApiBaseFromHostname,
  generateSessionId,
  supportsGzipCompression,
  gzipCompress,
} from './helpers';
