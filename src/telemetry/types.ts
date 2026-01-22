/**
 * Telemetry module types
 * AR-187: V3 payload types (updated from V2)
 * AR-189: V3 session response types
 */

import type { FingerprintResult } from '../fingerprint';
import type { SigintData } from '../utils/sigint';
import type { CryptoKeys } from '../utils/get-crypto-id';
import type { EvercookieData } from '../utils/evercookie';

// ============================================================================
// V3 Payload Types (AR-187, updated from V2)
// ============================================================================

export interface IdentifiersV3 {
  session_id: string;
  evercookie_id?: string;
  public_key?: string;
}

/**
 * Hashes section - stable, fuzzy, plus all module hashes from loose
 */
export interface HashesV3 {
  stable: string;
  fuzzy: string;
  [moduleKey: string]: string; // Dynamic module hashes (canvas2d, canvasWebgl, etc.)
}

/**
 * Device section - full loose fingerprint data
 */
export type DeviceV3 = Record<string, unknown>;

/**
 * Sigint section - full sigint data (renamed from "network" in V2)
 */
export type SigintV3 = Record<string, unknown>;

export interface PayloadV3 {
  identifiers: IdentifiersV3;
  hashes: HashesV3;
  device: DeviceV3;
  sigint?: SigintV3;
}

// Keep V2 aliases for backward compatibility during transition
export type IdentifiersV2 = IdentifiersV3;
export type HashesV2 = HashesV3;
export type DeviceV2 = DeviceV3;
export type NetworkV2 = SigintV3;
export type PayloadV2 = PayloadV3;

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
  apiResponse?: SessionResponseV2;
  error?: string;
  timing: {
    submitMs: number;
    pollMs?: number;
    totalMs: number;
  };
}

// ============================================================================
// V2 Session Response Types (AR-189)
// ============================================================================

export interface SessionResponseV2 {
  identifiers: {
    session_id: string;
    device_id?: string;
    evercookie_id?: string;
    public_key?: string;
  };
  device?: {
    hashes?: {
      stable?: string;
      fuzzy?: string;
      canvas?: string;
      webgl?: string;
      audio?: string;
      fonts?: string;
    };
    user_agent?: string;
    platform?: string;
    language?: string;
    languages?: string[];
    hardware_concurrency?: number;
    device_memory?: number;
    max_touch_points?: number;
    screen_width?: number;
    screen_height?: number;
    color_depth?: number;
    pixel_ratio?: number;
    gpu_vendor?: string;
    gpu_renderer?: string;
    timezone_offset?: number;
    timezone_name?: string;
    webdriver?: boolean;
    headless_signals?: string[];
  };
  network?: {
    ip?: string;
    geo?: {
      country?: string;
      city?: string;
      asn?: string;
    };
    is_proxy?: boolean;
    is_vpn?: boolean;
    ja3?: string;
    ja4?: string;
    headers?: Record<string, string>;
    webrtc_local_ip?: string;
    webrtc_public_ip?: string;
  };
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
