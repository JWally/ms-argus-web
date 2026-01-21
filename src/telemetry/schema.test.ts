/**
 * Schema validation tests
 * AR-188: Tests for Zod schema validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayloadV2Schema } from './schema';
import { buildPayloadV2 } from './payload';
import type { TelemetrySubmission } from './types';
import type { FingerprintResult } from '../fingerprint';

// Mock fingerprint data for testing
const createMockFingerprintResult = (
  overrides: Partial<FingerprintResult> = {},
): FingerprintResult => ({
  loose: {
    canvas2d: { $hash: 'canvas-hash-123' },
    canvasWebgl: {
      $hash: 'webgl-hash-456',
      gpu: { compressedGPU: 'ANGLE (Intel, UHD Graphics 620)' },
    },
    offlineAudioContext: { $hash: 'audio-hash-789' },
    screen: { $hash: 'screen-hash', width: 1920, height: 1080 },
    timezone: { $hash: 'tz-hash', location: 'America/New_York' },
    navigator: { $hash: 'nav-hash', hardwareConcurrency: 8, deviceMemory: 16 },
  },
  stable: {},
  hashes: {
    stable: 'stable-hash-abc123',
    fuzzy: '0123456789abcdef',
    loose: 'loose-hash-xyz',
    deviceOfTimezone: 'tz-hash',
    bot: 'bot-hash',
  },
  botSignals: {
    isHeadless: false,
    hasLies: false,
    lieCount: 0,
    isPrivate: false,
    engineMismatch: false,
    badBot: undefined,
    stealthSignals: {},
    botHash: 'bot-hash',
    likelyResidentialProxy: false,
  },
  inconsistencies: [],
  meta: {
    timestamp: Date.now(),
    durationMs: 150,
    version: '1.0.0',
  },
  ...overrides,
});

// Suppress console.log during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PayloadV2Schema', () => {
  it('should be exported from schema module', () => {
    expect(PayloadV2Schema).toBeDefined();
    expect(typeof PayloadV2Schema.parse).toBe('function');
  });

  it('should validate valid v2 payload', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = {
      fingerprint,
      evercookie: { id: 'test-id' },
    };

    const payload = buildPayloadV2(submission, 'test-session-id');
    const result = PayloadV2Schema.safeParse(payload);

    expect(result.success).toBe(true);
  });

  it('should reject payload missing required identifiers.session_id', () => {
    const invalidPayload = {
      identifiers: {},
      hashes: { stable: 'hash1', fuzzy: 'hash2' },
      device: {},
    };

    const result = PayloadV2Schema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject payload missing required hashes', () => {
    const invalidPayload = {
      identifiers: { session_id: 'test' },
      device: {},
    };

    const result = PayloadV2Schema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should accept payload with optional network section', () => {
    const payload = {
      identifiers: { session_id: 'test-session' },
      hashes: { stable: 'stable-hash', fuzzy: 'fuzzy-hash' },
      device: {},
      network: {
        tlsFingerprint: { ip: '192.168.1.1' },
      },
    };

    const result = PayloadV2Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept payload without network section', () => {
    const payload = {
      identifiers: { session_id: 'test-session' },
      hashes: { stable: 'stable-hash', fuzzy: 'fuzzy-hash' },
      device: {},
    };

    const result = PayloadV2Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
