/**
 * Telemetry API tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTelemetry } from './api';
import type { TelemetrySubmission, TelemetryConfig } from './types';
import type { FingerprintResult } from '../fingerprint';

const createMockFingerprint = (): FingerprintResult => ({
  loose: {
    canvas2d: { $hash: 'canvas-hash' },
    screen: { $hash: 'screen-hash', width: 1920, height: 1080 },
  },
  stable: {},
  hashes: {
    stable: 'stable-hash',
    fuzzy: 'fuzzy-hash',
    loose: 'loose-hash',
    deviceOfTimezone: 'tz-hash',
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
  deltaReport: {
    canvas2d: [],
    canvasWebgl: [],
    offlineAudioContext: [],
    css: [],
    cssMedia: [],
    screen: [],
    fonts: [],
    media: [],
    timezone: [],
    mathml: [],
    adblock: [],
  },
  meta: { timestamp: Date.now(), durationMs: 100, version: '1.0.0' },
});

const telemetryConfig: TelemetryConfig = {
  baseDomain: 'argus.pw',
  timeout: 5000,
};

describe('submitTelemetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use provided sessionId instead of generating one', async () => {
    const capturedBodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        if (
          init.body instanceof Uint8Array ||
          init.body instanceof ArrayBuffer
        ) {
          // gzip compressed — skip body parse
        } else if (typeof init.body === 'string') {
          capturedBodies.push(init.body);
        }
        return new Response(null, { status: 204 });
      }),
    );

    const submission: TelemetrySubmission = {
      fingerprint: createMockFingerprint(),
      sessionId: 'my-explicit-session-id',
    };

    const result = await submitTelemetry(submission, telemetryConfig);

    expect(result.sessionId).toBe('my-explicit-session-id');
    expect(result.submitted).toBe(true);
  });

  it('should generate a sessionId when none is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    const submission: TelemetrySubmission = {
      fingerprint: createMockFingerprint(),
    };

    const result = await submitTelemetry(submission, telemetryConfig);

    expect(result.sessionId).toMatch(/^demo-\d+-[a-z0-9]+$/);
    expect(result.submitted).toBe(true);
  });

  it('should return error on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const submission: TelemetrySubmission = {
      fingerprint: createMockFingerprint(),
      sessionId: 'test-session',
    };

    const result = await submitTelemetry(submission, telemetryConfig);

    expect(result.sessionId).toBe('test-session');
    expect(result.submitted).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should return error on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Bad Request', {
          status: 400,
          statusText: 'Bad Request',
        }),
      ),
    );

    const submission: TelemetrySubmission = {
      fingerprint: createMockFingerprint(),
      sessionId: 'test-session',
    };

    const result = await submitTelemetry(submission, telemetryConfig);

    expect(result.submitted).toBe(false);
    expect(result.error).toContain('400');
  });
});
