/**
 * Session response parsing tests
 */
import { describe, it, expect } from 'vitest';
import { parseSessionResponse, SCHEMA_VERSION } from './api';
import type { SessionResponse } from './types';

describe('parseSessionResponse', () => {
  it('should convert session response to MatchResult format', () => {
    const response: SessionResponse = {
      identifiers: {
        session_id: 'test-session',
        device_id: 'device-123',
      },
      analysis: {
        status: 'complete',
        confidence: 0.95,
        match_tier: 1,
        risk_score: 0.1,
        flags: ['RETURNING_DEVICE'],
        evidence_codes: ['STABLE_HASH_MATCH'],
      },
    };

    const matchResult = parseSessionResponse(response);

    expect(matchResult.device_id).toBe('device-123');
    expect(matchResult.confidence).toBe(0.95);
    expect(matchResult.match_tier).toBe(1);
    expect(matchResult.risk_score).toBe(0.1);
    expect(matchResult.status).toBe('complete');
    expect(matchResult.flags).toEqual(['RETURNING_DEVICE']);
    expect(matchResult.evidence_codes).toEqual(['STABLE_HASH_MATCH']);
  });

  it('should handle response with optional fields missing', () => {
    const response: SessionResponse = {
      identifiers: {
        session_id: 'test-session',
      },
      analysis: {
        status: 'complete',
        confidence: 0.85,
        match_tier: -1,
        risk_score: 0,
      },
    };

    const matchResult = parseSessionResponse(response);

    expect(matchResult.status).toBe('complete');
    expect(matchResult.device_id).toBe('');
    expect(matchResult.flags).toBeUndefined();
  });

  it('should include simhash_details when present', () => {
    const response: SessionResponse = {
      identifiers: {
        session_id: 'test-session',
        device_id: 'device-456',
      },
      analysis: {
        status: 'complete',
        confidence: 0.88,
        match_tier: 1.5,
        risk_score: 0.2,
        simhash_details: {
          incoming_hash: 'abc123',
          matched_hash: 'abc124',
          hamming_distance: 2,
          similarity: 0.96,
          bands_matched: 4,
        },
      },
    };

    const matchResult = parseSessionResponse(response);

    expect(matchResult.simhash_details).toBeDefined();
    expect(matchResult.simhash_details?.hamming_distance).toBe(2);
    expect(matchResult.simhash_details?.similarity).toBe(0.96);
  });

  it('should include fuzzy_match_info when present', () => {
    const response: SessionResponse = {
      identifiers: {
        session_id: 'test-session',
        device_id: 'device-789',
      },
      analysis: {
        status: 'complete',
        confidence: 0.92,
        match_tier: 1,
        risk_score: 0.15,
        fuzzy_match_info: {
          incoming_hash: 'def456',
          stored_hash: 'def457',
          hamming_distance: 1,
          similarity: 0.98,
        },
      },
    };

    const matchResult = parseSessionResponse(response);

    expect(matchResult.fuzzy_match_info).toBeDefined();
    expect(matchResult.fuzzy_match_info?.hamming_distance).toBe(1);
    expect(matchResult.fuzzy_match_info?.similarity).toBe(0.98);
  });
});

describe('SCHEMA_VERSION', () => {
  it('should be 3.0.0', () => {
    expect(SCHEMA_VERSION).toBe('3.0.0');
  });
});
