/**
 * Telemetry module types
 */

import type { FingerprintResult } from '../fingerprint';
import type { SigintData } from '../utils/sigint';
import type { CryptoKeys } from '../utils/get-crypto-id';
import type { EvercookieData } from '../utils/evercookie';

// ============================================================================
// Payload Types
// ============================================================================

export interface PayloadIdentifiers {
  session_id: string;
  evercookie_id?: string;
  public_key?: string;
}

/**
 * Hashes section - stable, fuzzy, plus all module hashes from loose
 */
export interface PayloadHashes {
  stable: string;
  fuzzy: string;
  [moduleKey: string]: string; // Dynamic module hashes (canvas2d, canvasWebgl, etc.)
}

/**
 * Device section - full loose fingerprint data
 */
export type PayloadDevice = Record<string, unknown>;

/**
 * Sigint section - network intelligence data
 */
export type PayloadSigint = Record<string, unknown>;

export interface ArgusPayload {
  identifiers: PayloadIdentifiers;
  hashes: PayloadHashes;
  device: PayloadDevice;
  deltaReport?: Record<string, string[]>;
  sigint?: PayloadSigint;
  buildId?: string;
}

// ============================================================================
// Config & Submission Types
// ============================================================================

export interface TelemetryConfig {
  /** Base domain for API (e.g., "argus.pw") */
  baseDomain: string;
  /** Stage prefix (e.g., "dev-jw-", "qa-", "" for prod) */
  stagePrefix?: string;
  /** Tenant ID for multi-tenant deployments */
  tenantId?: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

export interface TelemetrySubmission {
  fingerprint: FingerprintResult;
  sigint?: SigintData;
  evercookie?: EvercookieData;
  cryptoId?: CryptoKeys;
}

// ============================================================================
// Result Types
// ============================================================================

export interface TelemetryResult {
  /** Session ID to use for fetching results from GET /v1/session/{sessionId} */
  sessionId: string;
  /** Whether the fingerprint was successfully submitted */
  submitted: boolean;
  /** Error message if submission failed */
  error?: string;
  /** Timing information */
  timing: {
    submitMs: number;
    totalMs: number;
  };
}
