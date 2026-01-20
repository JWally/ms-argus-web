/**
 * Telemetry module - Submits fingerprint data to the Argus API
 *
 * Automatically submits collected fingerprint data and retrieves match results.
 */

import type { FingerprintResult } from '../fingerprint'
import type { SigintData } from '../utils/sigint'
import type { CryptoKeys } from '../utils/get-crypto-id'
import type { EvercookieData } from '../utils/evercookie'

// ============================================================================
// Types
// ============================================================================

export interface TelemetryConfig {
	/** Base domain for API (e.g., "argus.pw") */
	baseDomain: string
	/** Stage prefix (e.g., "dev-jw-", "qa-", "" for prod) */
	stagePrefix?: string
	/** Tenant ID for multi-tenant deployments */
	tenantId?: string
	/** Request timeout in milliseconds (default: 10000) */
	timeout?: number
	/** Whether to poll for match results after submission (default: true) */
	pollForResults?: boolean
	/** Max poll attempts for results (default: 3) */
	maxPollAttempts?: number
	/** Delay between poll attempts in ms (default: 200) */
	pollDelayMs?: number
}

export interface TelemetrySubmission {
	fingerprint: FingerprintResult
	sigint?: SigintData
	evercookie?: EvercookieData
	cryptoId?: CryptoKeys
}

export interface SimHashDetails {
	incoming_hash: string
	matched_hash: string
	hamming_distance: number
	similarity: number
	bands_matched: number
}

export interface MatchResult {
	device_id: string
	confidence: number
	match_tier: number
	risk_score: number
	status: string
	flags?: string[]
	evidence_codes?: string[]
	simhash_details?: SimHashDetails
}

export interface TelemetryResult {
	sessionId: string
	submitted: boolean
	matchResult?: MatchResult
	error?: string
	timing: {
		submitMs: number
		pollMs?: number
		totalMs: number
	}
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Build API base URL from config
 */
function buildApiBase(config: TelemetryConfig): string {
	const { baseDomain, stagePrefix = '' } = config
	const stage = stagePrefix.replace(/-$/, '')
	return stage
		? `https://api-${stage}.${baseDomain}`
		: `https://api.${baseDomain}`
}

/**
 * Auto-detect stage from current hostname
 * static-dev-jw.argus.pw -> 'dev-jw-'
 * static.argus.pw -> '' (prod)
 */
function detectStageFromHostname(): string {
	if (typeof window === 'undefined') return ''
	const hostname = window.location?.hostname || ''
	const match = hostname.match(/^static-([^.]+)\./)
	if (match) return match[1] + '-'
	if (hostname.startsWith('static.')) return ''
	return 'dev-jw-' // Default to dev
}

/**
 * Auto-detect API base from hostname
 */
function detectApiBaseFromHostname(baseDomain: string): string {
	if (typeof window === 'undefined') {
		return `https://api.${baseDomain}`
	}

	const hostname = window.location?.hostname || ''

	// If on argus.pw subdomain, derive API base from hostname
	if (hostname.includes('argus.pw')) {
		const hostParts = hostname.split('.')
		let stage = hostParts.length > 2 ? hostParts[0] : ''
		if (stage.startsWith('static-')) {
			stage = stage.replace('static-', '')
		} else if (stage === 'static') {
			stage = ''
		}
		return stage ? `https://api-${stage}.argus.pw` : `https://api.argus.pw`
	}

	// Otherwise use config
	const stagePrefix = detectStageFromHostname()
	const stage = stagePrefix.replace(/-$/, '')
	return stage
		? `https://api-${stage}.${baseDomain}`
		: `https://api.${baseDomain}`
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
	return 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11)
}

/**
 * AR-91: Check if browser supports CompressionStream API for gzip
 * Chrome 80+, Firefox 113+, Safari 16.4+
 */
function supportsGzipCompression(): boolean {
	return typeof CompressionStream !== 'undefined'
}

/**
 * AR-91: Gzip compress a string and return as Uint8Array (raw binary)
 * Uses browser's CompressionStream API
 */
async function gzipCompress(data: string): Promise<Uint8Array> {
	const encoder = new TextEncoder()
	const inputBytes = encoder.encode(data)

	const compressionStream = new CompressionStream('gzip')
	const writer = compressionStream.writable.getWriter()
	writer.write(inputBytes)
	writer.close()

	const compressedStream = compressionStream.readable
	const reader = compressedStream.getReader()
	const chunks: Uint8Array[] = []

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		chunks.push(value)
	}

	// Combine chunks into single Uint8Array
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
	const combined = new Uint8Array(totalLength)
	let offset = 0
	for (const chunk of chunks) {
		combined.set(chunk, offset)
		offset += chunk.length
	}

	return combined
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Submit fingerprint data to the Argus API and optionally poll for match results.
 */
export async function submitTelemetry(
	data: TelemetrySubmission,
	config: TelemetryConfig
): Promise<TelemetryResult> {
	const startTime = performance.now()
	const sessionId = generateSessionId()

	const {
		baseDomain,
		tenantId = 'demo',
		timeout = 10000,
		pollForResults = true,
		maxPollAttempts = 3,
		pollDelayMs = 200,
	} = config

	const apiBase = detectApiBaseFromHostname(baseDomain)

	const result: TelemetryResult = {
		sessionId,
		submitted: false,
		timing: {
			submitMs: 0,
			totalMs: 0,
		},
	}

	try {
		// Build submission payload
		const loose = data.fingerprint.loose || {}

		const submission = {
			session_id: sessionId,
			tenant_id: tenantId,
			fingerprint: {
				// AR-147: Include full raw fingerprint data for training/analysis
				loose: data.fingerprint.loose,

				// Primary hashes
				stable_hash: data.fingerprint.hashes?.stable,
				fuzzy_hash: data.fingerprint.hashes?.fuzzy,

				// Component hashes
				canvas_hash: loose.canvas2d?.$hash,
				webgl_hash: loose.canvasWebgl?.$hash,
				audio_hash: loose.offlineAudioContext?.$hash,

				// Persistent identifiers
				evercookie_id: data.evercookie?.id,
				public_key: data.cryptoId?.publicKey,

				// Hardware/display signals
				user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
				gpu_renderer: loose.canvasWebgl?.gpu?.compressedGPU || loose.workerScope?.webglRenderer,
				screen_dims: loose.screen ? `${loose.screen.width}x${loose.screen.height}` : undefined,
				timezone: loose.timezone?.location || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined),
				hardware_concurrency: loose.navigator?.hardwareConcurrency || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined),
				device_memory: loose.navigator?.deviceMemory || (typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined),

				// Privacy browser and bot signals
				privacy_browser: loose.resistance?.privacy,
				is_private_browsing: loose.incognito?.isPrivate,
				bot_hash: data.fingerprint.hashes?.bot,
				lie_count: data.fingerprint.botSignals?.lieCount,
				is_headless: data.fingerprint.botSignals?.isHeadless,

				// Structural hashes for privacy browser matching
				maths_hash: loose.maths?.$hash,
				window_features_hash: loose.windowFeatures?.$hash,
				html_element_hash: loose.htmlElementVersion?.$hash,
				css_hash: loose.css?.$hash,
				svg_hash: loose.svg?.$hash,
				webgl_extensions_count: loose.canvasWebgl?.parameters?.supportedExtensions?.length,

				// Network signals from sigint
				ip_address: data.sigint?.tlsFingerprint?.ip,
				ja4: data.sigint?.tlsFingerprint?.ja4,
				ja3: data.sigint?.tlsFingerprint?.ja3,
				tcp_rtt_us: data.sigint?.tcpProbe?.rtt_fingerprint?.tcp_rtt_us,
				proxy_score: data.sigint?.tcpProbe?.rtt_fingerprint?.proxy_score,
				vpn_score: data.sigint?.tcpProbe?.rtt_fingerprint?.vpn_score,
			},
		}

		// Submit to API
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		try {
			let response: Response

			// AR-91: Send binary gzip if browser supports CompressionStream
			if (supportsGzipCompression()) {
				const jsonString = JSON.stringify(submission)
				const gzippedBytes = await gzipCompress(jsonString)

				response = await fetch(`${apiBase}/v1/collect`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Encoding': 'gzip',
					},
					body: gzippedBytes, // Raw Uint8Array - browser sends as binary
					signal: controller.signal,
				})
			} else {
				// Fallback: send uncompressed JSON
				response = await fetch(`${apiBase}/v1/collect`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(submission),
					signal: controller.signal,
				})
			}

			clearTimeout(timeoutId)

			if (response.status !== 204 && !response.ok) {
				throw new Error(`API returned ${response.status}: ${response.statusText}`)
			}

			result.submitted = true
			result.timing.submitMs = performance.now() - startTime
		} catch (err: any) {
			clearTimeout(timeoutId)
			if (err.name === 'AbortError') {
				throw new Error('Request timeout')
			}
			throw err
		}

		// Poll for match results
		if (pollForResults) {
			const pollStart = performance.now()
			result.matchResult = await pollSessionResult(apiBase, sessionId, maxPollAttempts, pollDelayMs, timeout)
			result.timing.pollMs = performance.now() - pollStart
		}

	} catch (err: any) {
		result.error = err.message || String(err)
	}

	result.timing.totalMs = performance.now() - startTime
	return result
}

/**
 * Poll for session match results
 */
async function pollSessionResult(
	apiBase: string,
	sessionId: string,
	maxAttempts: number,
	delayMs: number,
	timeout: number
): Promise<MatchResult | undefined> {
	for (let i = 0; i < maxAttempts; i++) {
		// Don't wait on first attempt
		if (i > 0) {
			await new Promise(resolve => setTimeout(resolve, delayMs))
		}

		try {
			const controller = new AbortController()
			const timeoutId = setTimeout(() => controller.abort(), timeout)

			const response = await fetch(`${apiBase}/v1/session/${sessionId}`, {
				signal: controller.signal,
			})

			clearTimeout(timeoutId)

			if (response.status === 404) {
				continue // Not ready yet
			}

			if (response.ok) {
				const result = await response.json()
				if (result.status === 'pending') {
					continue
				}
				return result as MatchResult
			}
		} catch (err) {
			// Retry on error
		}
	}

	return undefined
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
	}
	return labels[String(tier)] || `Tier ${tier}`
}
