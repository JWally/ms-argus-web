/**
 * Telemetry module tests
 * AR-187: Tests for v2 payload structure
 * AR-188: Tests for schema validation and version header
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPayloadV2, type TelemetrySubmission } from './index'
import type { FingerprintResult } from '../fingerprint'

// Mock fingerprint data for testing
const createMockFingerprintResult = (overrides: Partial<FingerprintResult> = {}): FingerprintResult => ({
	loose: {
		canvas2d: { $hash: 'canvas-hash-123' },
		canvasWebgl: {
			$hash: 'webgl-hash-456',
			gpu: { compressedGPU: 'ANGLE (Intel, UHD Graphics 620)' }
		},
		offlineAudioContext: { $hash: 'audio-hash-789' },
		screen: { width: 1920, height: 1080 },
		timezone: { location: 'America/New_York' },
		navigator: { hardwareConcurrency: 8, deviceMemory: 16 },
		resistance: { privacy: undefined },
		incognito: { isPrivate: false },
		maths: { $hash: 'maths-hash' },
		windowFeatures: { $hash: 'window-hash' },
		htmlElementVersion: { $hash: 'html-hash' },
		css: { $hash: 'css-hash' },
		svg: { $hash: 'svg-hash' },
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
})

describe('AR-187: v2 payload structure', () => {
	describe('buildPayloadV2', () => {
		it('should create payload with identifiers section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = {
				fingerprint,
				evercookie: { id: 'evercookie-id-123' },
				cryptoId: { publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...' },
			}

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.identifiers).toBeDefined()
			expect(payload.identifiers.session_id).toBe('test-session-id')
			expect(payload.identifiers.evercookie_id).toBe('evercookie-id-123')
			expect(payload.identifiers.public_key).toBe('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...')
		})

		it('should create payload with device.hashes section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.device).toBeDefined()
			expect(payload.device.hashes).toBeDefined()
			expect(payload.device.hashes.stable).toBe('stable-hash-abc123')
			expect(payload.device.hashes.fuzzy).toBe('0123456789abcdef')
			expect(payload.device.hashes.canvas).toBe('canvas-hash-123')
			expect(payload.device.hashes.webgl).toBe('webgl-hash-456')
			expect(payload.device.hashes.audio).toBe('audio-hash-789')
		})

		it('should include browser info in device section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.device.browser).toBeDefined()
			expect(typeof payload.device.browser?.user_agent).toBe('string')
		})

		it('should include screen info in device section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.device.screen).toBeDefined()
			expect(payload.device.screen?.width).toBe(1920)
			expect(payload.device.screen?.height).toBe(1080)
		})

		it('should include hardware info in device section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.device.hardware).toBeDefined()
			expect(payload.device.hardware?.concurrency).toBe(8)
			expect(payload.device.hardware?.memory).toBe(16)
			expect(payload.device.hardware?.gpu).toBe('ANGLE (Intel, UHD Graphics 620)')
		})

		it('should include timezone in device section', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.device.timezone).toBe('America/New_York')
		})

		it('should create network section with sigint data', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = {
				fingerprint,
				sigint: {
					tlsFingerprint: {
						ip: '192.168.1.1',
						ja4: 't13d1516h2_8daaf6152771_e5627efa2ab1',
						ja3: '771,4865-4866-4867',
					},
					tcpProbe: {
						rtt_fingerprint: {
							tcp_rtt_us: 15000,
							proxy_score: 0.1,
							vpn_score: 0.05,
						},
					},
				},
			}

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.network).toBeDefined()
			expect(payload.network?.ip).toBe('192.168.1.1')
			expect(payload.network?.ja4).toBe('t13d1516h2_8daaf6152771_e5627efa2ab1')
			expect(payload.network?.ja3).toBe('771,4865-4866-4867')
		})

		it('should handle missing optional fields gracefully', () => {
			const fingerprint = createMockFingerprintResult({
				loose: {},
				hashes: {
					stable: 'stable-only',
					fuzzy: 'fuzzy-only',
					loose: '',
					deviceOfTimezone: '',
				},
			})
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect(payload.identifiers.session_id).toBe('test-session-id')
			expect(payload.device.hashes.stable).toBe('stable-only')
			expect(payload.device.hashes.fuzzy).toBe('fuzzy-only')
			// Optional fields should be undefined, not null
			expect(payload.identifiers.evercookie_id).toBeUndefined()
			expect(payload.device.hashes.canvas).toBeUndefined()
		})

		it('should NOT include tenant_id (deprecated in v2)', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			expect((payload as any).tenant_id).toBeUndefined()
		})

		it('should NOT include flat fingerprint structure (v1 format)', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = { fingerprint }

			const payload = buildPayloadV2(submission, 'test-session-id')

			// v1 format had these at root or in fingerprint object
			expect((payload as any).session_id).toBeUndefined() // moved to identifiers
			expect((payload as any).fingerprint).toBeUndefined() // replaced with device
			expect((payload as any).stable_hash).toBeUndefined() // moved to device.hashes
		})
	})
})

describe('AR-189: v2 session response parsing', () => {
	it('should export parseSessionResponseV2 to convert v2 response to v1 MatchResult', async () => {
		const { parseSessionResponseV2 } = await import('./index')
		expect(parseSessionResponseV2).toBeDefined()
		expect(typeof parseSessionResponseV2).toBe('function')
	})

	it('should convert v2 session response to v1 MatchResult format', async () => {
		const { parseSessionResponseV2 } = await import('./index')
		const v2Response = {
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
		}

		const matchResult = parseSessionResponseV2(v2Response)

		expect(matchResult.device_id).toBe('device-123')
		expect(matchResult.confidence).toBe(0.95)
		expect(matchResult.match_tier).toBe(1)
		expect(matchResult.risk_score).toBe(0.1)
		expect(matchResult.status).toBe('complete')
		expect(matchResult.flags).toEqual(['RETURNING_DEVICE'])
		expect(matchResult.evidence_codes).toEqual(['STABLE_HASH_MATCH'])
	})

	it('should handle v2 response with optional fields missing', async () => {
		const { parseSessionResponseV2 } = await import('./index')
		const v2Response = {
			identifiers: {
				session_id: 'test-session',
			},
			analysis: {
				status: 'complete',
				confidence: 0.85,
				match_tier: -1,
				risk_score: 0,
			},
		}

		const matchResult = parseSessionResponseV2(v2Response)

		expect(matchResult.status).toBe('complete')
		expect(matchResult.device_id).toBe('') // Empty string when not present
		expect(matchResult.flags).toBeUndefined()
	})
})

describe('AR-188: schema validation and version header', () => {
	describe('X-Argus-Schema-Version header', () => {
		it('should include schema version header constant', async () => {
			const { SCHEMA_VERSION } = await import('./index')
			expect(SCHEMA_VERSION).toBe('2.0.0')
		})
	})

	describe('v2 payload structure validation', () => {
		it('should match expected v2 structure shape', () => {
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = {
				fingerprint,
				evercookie: { id: 'test-id' },
			}

			const payload = buildPayloadV2(submission, 'test-session-id')

			// Top-level structure
			expect(Object.keys(payload).sort()).toEqual(
				expect.arrayContaining(['identifiers', 'device'])
			)

			// Identifiers structure
			expect(typeof payload.identifiers.session_id).toBe('string')

			// Device structure
			expect(typeof payload.device.hashes).toBe('object')
			expect(typeof payload.device.hashes.stable).toBe('string')
			expect(typeof payload.device.hashes.fuzzy).toBe('string')
		})
	})

	describe('Zod schema validation (dev-time)', () => {
		it('should export PayloadV2Schema for dev validation', async () => {
			const { PayloadV2Schema } = await import('./schema')
			expect(PayloadV2Schema).toBeDefined()
			expect(typeof PayloadV2Schema.parse).toBe('function')
		})

		it('should validate valid v2 payload', async () => {
			const { PayloadV2Schema } = await import('./schema')
			const { buildPayloadV2 } = await import('./index')
			const fingerprint = createMockFingerprintResult()
			const submission: TelemetrySubmission = {
				fingerprint,
				evercookie: { id: 'test-id' },
			}

			const payload = buildPayloadV2(submission, 'test-session-id')
			const result = PayloadV2Schema.safeParse(payload)

			expect(result.success).toBe(true)
		})

		it('should reject payload missing required identifiers.session_id', async () => {
			const { PayloadV2Schema } = await import('./schema')
			const invalidPayload = {
				identifiers: {},
				device: {
					hashes: { stable: 'hash1', fuzzy: 'hash2' }
				}
			}

			const result = PayloadV2Schema.safeParse(invalidPayload)
			expect(result.success).toBe(false)
		})

		it('should reject payload missing required device.hashes', async () => {
			const { PayloadV2Schema } = await import('./schema')
			const invalidPayload = {
				identifiers: { session_id: 'test' },
				device: {}
			}

			const result = PayloadV2Schema.safeParse(invalidPayload)
			expect(result.success).toBe(false)
		})
	})
})
