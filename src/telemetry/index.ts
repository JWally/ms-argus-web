/**
 * Telemetry module - Submits fingerprint data to the Argus API
 */

// Types
export type {
  PayloadIdentifiers,
  PayloadHashes,
  PayloadDevice,
  PayloadSigint,
  ArgusPayload,
  TelemetryConfig,
  TelemetrySubmission,
  SimHashDetails,
  FuzzyMatchInfo,
  MatchResult,
  TelemetryResult,
  SessionResponse,
} from './types';

// Payload builder
export { buildPayload } from './payload';

// API functions
export {
  SCHEMA_VERSION,
  submitTelemetry,
  parseSessionResponse,
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
