import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { submitTelemetry, type TelemetryConfig, type TelemetrySubmission } from './index'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock CompressionStream (not available in Node)
global.CompressionStream = undefined as any

describe('submitTelemetry', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetch.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	const mockConfig: TelemetryConfig = {
		baseDomain: 'argus.pw',
		stagePrefix: 'dev-jw-',
		tenantId: 'test-tenant',
		pollForResults: false, // Disable polling for unit tests
	}

	const mockLooseData = {
		maths: {
			$hash: 'maths-hash-123',
			data: { 'Math.acos(0.123)': 1.4470808451078687 },
		},
		offlineAudioContext: {
			$hash: 'audio-hash-456',
			binSum: 180.26343588058472,
			floatSum: 124.48727438644886,
		},
		canvas2d: {
			$hash: 'canvas-hash-789',
			dataURI: 'data:image/png;base64,abc123',
		},
		canvasWebgl: {
			$hash: 'webgl-hash-012',
			gpu: { compressedGPU: 'ANGLE (Intel, Intel UHD Graphics 620)' },
		},
		screen: { width: 1920, height: 1080 },
		timezone: { location: 'America/Chicago' },
		navigator: { hardwareConcurrency: 8, deviceMemory: 16 },
	}

	const mockFingerprint = {
		loose: mockLooseData,
		stable: { navigator: { hardwareConcurrency: 8 } },
		hashes: {
			stable: 'stable-hash-abc',
			fuzzy: 'fuzzy-hash-def',
			loose: 'loose-hash-ghi',
			deviceOfTimezone: 'device-tz-hash',
		},
		botSignals: {
			botHash: 'bot-hash',
			isHeadless: false,
			hasLies: false,
			lieCount: 0,
			stealthSignals: {},
			likelyResidentialProxy: false,
			engineMismatch: false,
			isPrivate: false,
			badBot: undefined,
		},
		meta: {
			timestamp: Date.now(),
			durationMs: 100,
			version: '1.0.0',
		},
	}

	const mockSubmission: TelemetrySubmission = {
		fingerprint: mockFingerprint,
		evercookie: { id: 'evercookie-123' },
		cryptoId: { publicKey: 'public-key-base64', privateKey: 'private-key' },
	}

	it('includes full loose object in submission payload', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		await submitTelemetry(mockSubmission, mockConfig)

		expect(mockFetch).toHaveBeenCalledTimes(1)

		const [url, options] = mockFetch.mock.calls[0]
		expect(url).toBe('https://api-dev-jw.argus.pw/v1/collect')
		expect(options.method).toBe('POST')

		const payload = JSON.parse(options.body)

		// AR-147: Verify loose object is included with raw data
		expect(payload.fingerprint.loose).toBeDefined()
		expect(payload.fingerprint.loose.maths).toBeDefined()
		expect(payload.fingerprint.loose.maths.data).toBeDefined()
		expect(payload.fingerprint.loose.maths.data['Math.acos(0.123)']).toBe(1.4470808451078687)
		expect(payload.fingerprint.loose.offlineAudioContext.binSum).toBe(180.26343588058472)
		expect(payload.fingerprint.loose.offlineAudioContext.floatSum).toBe(124.48727438644886)
	})

	it('still includes hash fields for backward compatibility', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		await submitTelemetry(mockSubmission, mockConfig)

		const [, options] = mockFetch.mock.calls[0]
		const payload = JSON.parse(options.body)

		// Verify hash fields are still present
		expect(payload.fingerprint.stable_hash).toBe('stable-hash-abc')
		expect(payload.fingerprint.fuzzy_hash).toBe('fuzzy-hash-def')
		expect(payload.fingerprint.canvas_hash).toBe('canvas-hash-789')
		expect(payload.fingerprint.webgl_hash).toBe('webgl-hash-012')
		expect(payload.fingerprint.audio_hash).toBe('audio-hash-456')
		expect(payload.fingerprint.maths_hash).toBe('maths-hash-123')
	})

	it('includes evercookie and crypto IDs', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		await submitTelemetry(mockSubmission, mockConfig)

		const [, options] = mockFetch.mock.calls[0]
		const payload = JSON.parse(options.body)

		expect(payload.fingerprint.evercookie_id).toBe('evercookie-123')
		expect(payload.fingerprint.public_key).toBe('public-key-base64')
	})

	it('includes tenant_id and session_id', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		await submitTelemetry(mockSubmission, mockConfig)

		const [, options] = mockFetch.mock.calls[0]
		const payload = JSON.parse(options.body)

		expect(payload.tenant_id).toBe('test-tenant')
		expect(payload.session_id).toMatch(/^demo-\d+-[a-z0-9]+$/)
	})

	it('handles missing loose object gracefully', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		const submissionWithoutLoose: TelemetrySubmission = {
			fingerprint: {
				...mockFingerprint,
				loose: undefined as any,
			},
		}

		await submitTelemetry(submissionWithoutLoose, mockConfig)

		const [, options] = mockFetch.mock.calls[0]
		const payload = JSON.parse(options.body)

		// Should include undefined loose and not crash
		expect(payload.fingerprint.loose).toBeUndefined()
		// Hash fields should still be extracted (but will be undefined)
		expect(payload.fingerprint.stable_hash).toBe('stable-hash-abc')
	})

	it('returns submitted: true on success', async () => {
		mockFetch.mockResolvedValueOnce({ status: 204, ok: true })

		const result = await submitTelemetry(mockSubmission, mockConfig)

		expect(result.submitted).toBe(true)
		expect(result.error).toBeUndefined()
		expect(result.sessionId).toMatch(/^demo-\d+-[a-z0-9]+$/)
	})

	it('returns error on fetch failure', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network error'))

		const result = await submitTelemetry(mockSubmission, mockConfig)

		expect(result.submitted).toBe(false)
		expect(result.error).toBe('Network error')
	})

	it('returns error on non-204 response', async () => {
		mockFetch.mockResolvedValueOnce({
			status: 500,
			ok: false,
			statusText: 'Internal Server Error',
		})

		const result = await submitTelemetry(mockSubmission, mockConfig)

		expect(result.submitted).toBe(false)
		expect(result.error).toContain('500')
	})
})

describe('getMatchTierLabel', () => {
	// Import the function
	it('returns correct labels for match tiers', async () => {
		const { getMatchTierLabel } = await import('./index')

		expect(getMatchTierLabel(-1)).toBe('New Device')
		expect(getMatchTierLabel(0)).toBe('Cache Hit')
		expect(getMatchTierLabel(0.5)).toBe('Tier 0.5 (Evercookie/PublicKey)')
		expect(getMatchTierLabel(1)).toBe('Tier 1 (Hash Match)')
		expect(getMatchTierLabel(2)).toBe('Tier 2 (Bucket Match)')
		expect(getMatchTierLabel(3)).toBe('Tier 3 (Soft Match)')
		expect(getMatchTierLabel(99)).toBe('Tier 99')
	})
})
