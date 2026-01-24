/**
 * Payload builder tests
 */
import { describe, it, expect } from 'vitest';
import { buildPayload } from './payload';
import type { TelemetrySubmission } from './types';
import type { FingerprintResult } from '../fingerprint';

// Mock fingerprint data for testing
const createMockFingerprintResult = (
  overrides: Partial<FingerprintResult> = {},
): FingerprintResult => ({
  loose: {
    canvas2d: {
      $hash: 'canvas-hash-123',
      dataURI: 'data:image/png;base64,...',
    },
    canvasWebgl: {
      $hash: 'webgl-hash-456',
      gpu: { compressedGPU: 'ANGLE (Intel, UHD Graphics 620)' },
      parameters: { MAX_TEXTURE_SIZE: 16384 },
    },
    offlineAudioContext: {
      $hash: 'audio-hash-789',
      binFrequencies: [0.1, 0.2],
    },
    screen: { $hash: 'screen-hash', width: 1920, height: 1080 },
    timezone: { $hash: 'tz-hash', location: 'America/New_York' },
    navigator: { $hash: 'nav-hash', hardwareConcurrency: 8, deviceMemory: 16 },
    maths: { $hash: 'maths-hash' },
    windowFeatures: { $hash: 'window-hash' },
    fonts: { $hash: 'fonts-hash', fontFaceLoadFonts: ['Arial', 'Helvetica'] },
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

describe('buildPayload', () => {
  it('should create payload with identifiers section', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = {
      fingerprint,
      evercookie: { id: 'evercookie-id-123' },
      cryptoId: { publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...' },
    };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.identifiers).toBeDefined();
    expect(payload.identifiers.session_id).toBe('test-session-id');
    expect(payload.identifiers.evercookie_id).toBe('evercookie-id-123');
    expect(payload.identifiers.public_key).toBe(
      'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
    );
  });

  it('should create hashes section with stable, fuzzy, and all module hashes', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = { fingerprint };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.hashes).toBeDefined();
    expect(payload.hashes.stable).toBe('stable-hash-abc123');
    expect(payload.hashes.fuzzy).toBe('0123456789abcdef');
    // Module hashes extracted from loose
    expect(payload.hashes.canvas2d).toBe('canvas-hash-123');
    expect(payload.hashes.canvasWebgl).toBe('webgl-hash-456');
    expect(payload.hashes.offlineAudioContext).toBe('audio-hash-789');
    expect(payload.hashes.screen).toBe('screen-hash');
    expect(payload.hashes.timezone).toBe('tz-hash');
    expect(payload.hashes.navigator).toBe('nav-hash');
    expect(payload.hashes.maths).toBe('maths-hash');
    expect(payload.hashes.windowFeatures).toBe('window-hash');
    expect(payload.hashes.fonts).toBe('fonts-hash');
  });

  it('should spread full loose fingerprint into device section', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = { fingerprint };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.device).toBeDefined();
    // Full loose data should be spread
    expect(payload.device.canvas2d).toBeDefined();
    expect((payload.device.canvas2d as any).$hash).toBe('canvas-hash-123');
    expect((payload.device.canvas2d as any).dataURI).toBe(
      'data:image/png;base64,...',
    );
    expect(payload.device.canvasWebgl).toBeDefined();
    expect((payload.device.canvasWebgl as any).gpu.compressedGPU).toBe(
      'ANGLE (Intel, UHD Graphics 620)',
    );
    expect(payload.device.screen).toBeDefined();
    expect((payload.device.screen as any).width).toBe(1920);
    expect((payload.device.screen as any).height).toBe(1080);
    expect(payload.device.navigator).toBeDefined();
    expect((payload.device.navigator as any).hardwareConcurrency).toBe(8);
  });

  it('should spread full sigint into sigint section', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = {
      fingerprint,
      sigint: {
        tlsFingerprint: {
          ip: '192.168.1.1',
          ja4: 't13d1516h2_8daaf6152771_e5627efa2ab1',
          ja3: '771,4865-4866-4867',
          asn: 'AS12345',
        },
        tcpProbe: {
          rtt_fingerprint: {
            tcp_rtt_us: 15000,
            proxy_score: 0.1,
            vpn_score: 0.05,
          },
        },
        stunProbe: {
          localIp: '10.0.0.1',
          publicIp: '192.168.1.1',
        },
      },
    };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.sigint).toBeDefined();
    // Full sigint data should be spread
    expect((payload.sigint as any).tlsFingerprint.ip).toBe('192.168.1.1');
    expect((payload.sigint as any).tlsFingerprint.ja4).toBe(
      't13d1516h2_8daaf6152771_e5627efa2ab1',
    );
    expect((payload.sigint as any).tlsFingerprint.asn).toBe('AS12345');
    expect((payload.sigint as any).tcpProbe.rtt_fingerprint.tcp_rtt_us).toBe(
      15000,
    );
    expect((payload.sigint as any).stunProbe.localIp).toBe('10.0.0.1');
  });

  it('should handle missing sigint gracefully', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = { fingerprint };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.sigint).toBeUndefined();
  });

  it('should handle missing optional identifiers', () => {
    const fingerprint = createMockFingerprintResult();
    const submission: TelemetrySubmission = { fingerprint };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.identifiers.session_id).toBe('test-session-id');
    expect(payload.identifiers.evercookie_id).toBeUndefined();
    expect(payload.identifiers.public_key).toBeUndefined();
  });

  it('should handle empty loose fingerprint', () => {
    const fingerprint = createMockFingerprintResult({
      loose: {},
      hashes: {
        stable: 'stable-only',
        fuzzy: 'fuzzy-only',
        loose: '',
        deviceOfTimezone: '',
      },
    });
    const submission: TelemetrySubmission = { fingerprint };

    const payload = buildPayload(submission, 'test-session-id');

    expect(payload.hashes.stable).toBe('stable-only');
    expect(payload.hashes.fuzzy).toBe('fuzzy-only');
    expect(Object.keys(payload.device)).toHaveLength(0);
  });
});
