/**
 * Telemetry API functions
 * Submit fingerprint data and poll for results
 */

import type {
  TelemetryConfig,
  TelemetrySubmission,
  TelemetryResult,
  MatchResult,
  SessionResponseV2,
} from './types';
import { buildPayloadV2 } from './payload';
import {
  detectApiBaseFromHostname,
  generateSessionId,
  supportsGzipCompression,
  gzipCompress,
} from './helpers';

/** AR-188: Schema version for v2 payload format */
export const SCHEMA_VERSION = '2.0.0';

/**
 * Submit fingerprint data to the Argus API and optionally poll for match results.
 */
export async function submitTelemetry(
  data: TelemetrySubmission,
  config: TelemetryConfig,
): Promise<TelemetryResult> {
  const startTime = performance.now();
  const sessionId = generateSessionId();

  const {
    baseDomain,
    timeout = 10000,
    pollForResults = true,
    maxPollAttempts = 3,
    pollDelayMs = 200,
  } = config;

  const apiBase = detectApiBaseFromHostname(baseDomain);

  const result: TelemetryResult = {
    sessionId,
    submitted: false,
    timing: {
      submitMs: 0,
      totalMs: 0,
    },
  };

  try {
    // AR-187: Build v2 format submission payload
    const submission = buildPayloadV2(data, sessionId);

    // Submit to API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let response: Response;

      // AR-91: Send binary gzip if browser supports CompressionStream
      if (supportsGzipCompression()) {
        const jsonString = JSON.stringify(submission);
        const gzippedBytes = await gzipCompress(jsonString);

        response = await fetch(`${apiBase}/v1/collect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'gzip',
            'X-Argus-Schema-Version': SCHEMA_VERSION,
          },
          body: gzippedBytes,
          signal: controller.signal,
        });
      } else {
        // Fallback: send uncompressed JSON
        response = await fetch(`${apiBase}/v1/collect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Argus-Schema-Version': SCHEMA_VERSION,
          },
          body: JSON.stringify(submission),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (response.status !== 204 && !response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
      }

      result.submitted = true;
      result.timing.submitMs = performance.now() - startTime;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }

    // Poll for match results
    if (pollForResults) {
      const pollStart = performance.now();
      const pollResult = await pollSessionResult(
        apiBase,
        sessionId,
        maxPollAttempts,
        pollDelayMs,
        timeout,
      );
      if (pollResult) {
        result.matchResult = pollResult.matchResult;
        result.apiResponse = pollResult.apiResponse;
      }
      result.timing.pollMs = performance.now() - pollStart;
    }
  } catch (err: any) {
    result.error = err.message || String(err);
  }

  result.timing.totalMs = performance.now() - startTime;
  return result;
}

interface PollResult {
  matchResult: MatchResult;
  apiResponse: SessionResponseV2;
}

/**
 * Poll for session match results
 */
async function pollSessionResult(
  apiBase: string,
  sessionId: string,
  maxAttempts: number,
  delayMs: number,
  timeout: number,
): Promise<PollResult | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    // Don't wait on first attempt
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${apiBase}/v1/session/${sessionId}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        continue; // Not ready yet
      }

      if (response.ok) {
        const result = await response.json();
        // AR-189: Handle both v1 and v2 response formats
        // v2 has analysis.status, v1 has status at root
        if (result.analysis) {
          // V2 format
          if (result.analysis.status === 'pending') {
            continue;
          }
          const apiResponse = result as SessionResponseV2;
          return {
            matchResult: parseSessionResponseV2(apiResponse),
            apiResponse,
          };
        } else {
          // V1 format (backward compat) - wrap in v2 structure
          if (result.status === 'pending') {
            continue;
          }
          const matchResult = result as MatchResult;
          return {
            matchResult,
            apiResponse: {
              identifiers: {
                session_id: sessionId,
                device_id: matchResult.device_id,
              },
              analysis: {
                status: matchResult.status as 'complete',
                confidence: matchResult.confidence,
                match_tier: matchResult.match_tier,
                risk_score: matchResult.risk_score,
                flags: matchResult.flags,
                evidence_codes: matchResult.evidence_codes,
              },
            },
          };
        }
      }
    } catch (err) {
      // Retry on error
    }
  }

  return undefined;
}

/**
 * AR-189: Parse v2 session response into v1 MatchResult format
 * This allows the demo site to continue using the existing v1 interface
 */
export function parseSessionResponseV2(
  v2Response: SessionResponseV2,
): MatchResult {
  return {
    device_id: v2Response.identifiers.device_id ?? '',
    confidence: v2Response.analysis.confidence ?? 0,
    match_tier: v2Response.analysis.match_tier ?? -1,
    risk_score: v2Response.analysis.risk_score ?? 0,
    status: v2Response.analysis.status,
    flags: v2Response.analysis.flags,
    evidence_codes: v2Response.analysis.evidence_codes,
    simhash_details: v2Response.analysis.simhash_details,
    fuzzy_match_info: v2Response.analysis.fuzzy_match_info,
  };
}

/**
 * Get match result label for display
 */
export function getMatchTierLabel(tier: number): string {
  const labels: Record<string, string> = {
    '-1': 'New Device',
    '0': 'Cache Hit',
    '0.5': 'Tier 0.5 (Evercookie/PublicKey)',
    '1': 'Tier 1 (Hash Match)',
    '1.5': 'Tier 1.5 (SimHash Match)',
    '2': 'Tier 2 (Bucket Match)',
    '3': 'Tier 3 (Soft Match)',
  };
  return labels[String(tier)] || `Tier ${tier}`;
}
