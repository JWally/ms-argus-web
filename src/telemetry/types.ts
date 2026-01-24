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
  sigint?: PayloadSigint;
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
  /** Whether to poll for match results after submission (default: true) */
  pollForResults?: boolean;
  /** Max poll attempts for results (default: 3) */
  maxPollAttempts?: number;
  /** Delay between poll attempts in ms (default: 200) */
  pollDelayMs?: number;
}

export interface TelemetrySubmission {
  fingerprint: FingerprintResult;
  sigint?: SigintData;
  evercookie?: EvercookieData;
  cryptoId?: CryptoKeys;
}

// ============================================================================
// Match Result Types
// ============================================================================

export interface SimHashDetails {
  incoming_hash: string;
  matched_hash: string;
  hamming_distance: number;
  similarity: number;
  bands_matched: number;
}

export interface FuzzyMatchInfo {
  incoming_hash: string;
  stored_hash: string;
  hamming_distance: number;
  similarity: number;
}

export interface MatchResult {
  device_id: string;
  confidence: number;
  match_tier: number;
  risk_score: number;
  status: string;
  flags?: string[];
  evidence_codes?: string[];
  simhash_details?: SimHashDetails;
  fuzzy_match_info?: FuzzyMatchInfo;
}

export interface TelemetryResult {
  sessionId: string;
  submitted: boolean;
  matchResult?: MatchResult;
  /** Full API response from GET /v1/session/{session_id} */
  apiResponse?: SessionResponse;
  error?: string;
  timing: {
    submitMs: number;
    pollMs?: number;
    totalMs: number;
  };
}

// ============================================================================
// Session Response Types
// ============================================================================

export interface SessionResponse {
  identifiers: {
    session_id: string;
    device_id?: string;
    evercookie_id?: string;
    public_key?: string;
  };
  hashes?: PayloadHashes;
  device?: PayloadDevice;
  sigint?: PayloadSigint;
  analysis: {
    status: 'pending' | 'complete' | 'degraded';
    confidence?: number;
    match_tier?: number;
    risk_score?: number;
    flags?: string[];
    evidence_codes?: string[];
    simhash_details?: SimHashDetails;
    fuzzy_match_info?: FuzzyMatchInfo;
  };
}
