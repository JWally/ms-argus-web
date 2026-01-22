/**
 * Schema validation tests
 * AR-188: Tests for Zod schema validation (updated for V3)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PayloadV3Schema } from './schema';
import { buildPayloadV3 } from './payload';
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

describe('PayloadV3Schema', () => {
  it('should be exported from schema module', () => {
    expect(PayloadV3Schema).toBeDefined();
    expect(typeof PayloadV3Schema.parse).toBe('function');
  });

  it('should validate valid v3 payload', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = {
      fingerprint,
      evercookie: { id: 'test-id' },
    };

    const payload = buildPayloadV3(submission, 'test-session-id');
    const result = PayloadV3Schema.safeParse(payload);

    expect(result.success).toBe(true);
  });

  it('should reject payload missing required identifiers.session_id', () => {
    const invalidPayload = {
      identifiers: {},
      hashes: { stable: 'hash1', fuzzy: 'hash2' },
      device: {},
    };

    const result = PayloadV3Schema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject payload missing required hashes', () => {
    const invalidPayload = {
      identifiers: { session_id: 'test' },
      device: {},
    };

    const result = PayloadV3Schema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should accept payload with optional sigint section (V3 uses sigint instead of network)', () => {
    const payload = {
      identifiers: { session_id: 'test-session' },
      hashes: { stable: 'stable-hash', fuzzy: 'fuzzy-hash' },
      device: {},
      sigint: {
        tlsFingerprint: { ip: '192.168.1.1' },
      },
    };

    const result = PayloadV3Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept payload without sigint section', () => {
    const payload = {
      identifiers: { session_id: 'test-session' },
      hashes: { stable: 'stable-hash', fuzzy: 'fuzzy-hash' },
      device: {},
    };

    const result = PayloadV3Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
