/**
 * Telemetry module - Submits fingerprint data to the Argus API
 *
 * Automatically submits collected fingerprint data and retrieves match results.
 * AR-187: Updated for v2 payload structure
 * AR-188: Added schema version header and dev-time Zod validation
 */

import type { FingerprintResult } from '../fingerprint'
import type { SigintData } from '../utils/sigint'
import type { CryptoKeys } from '../utils/get-crypto-id'
import type { EvercookieData } from '../utils/evercookie'

// ============================================================================
// Constants
// ============================================================================

/** AR-188: Schema version for v2 payload format */
export const SCHEMA_VERSION = '2.0.0'

// ============================================================================
// V2 Payload Types (AR-187)
// ============================================================================

export interface IdentifiersV2 {
	session_id: string
	evercookie_id?: string
	public_key?: string
}

export interface DeviceHashesV2 {
	stable: string
	fuzzy: string
	canvas?: string
	webgl?: string
	audio?: string
	fonts?: string
}

export interface BrowserInfoV2 {
	user_agent?: string
	language?: string
}

export interface ScreenInfoV2 {
	width: number
	height: number
	color_depth?: number
	pixel_ratio?: number
}

export interface HardwareInfoV2 {
	concurrency?: number
	memory?: number
	gpu?: string
}

export interface DeviceV2 {
	hashes: DeviceHashesV2
	browser?: BrowserInfoV2
	screen?: ScreenInfoV2
	hardware?: HardwareInfoV2
	timezone?: string
}

export interface NetworkV2 {
	ip?: string
	ja4?: string
	ja3?: string
	tcp_rtt_us?: number
	proxy_score?: number
	vpn_score?: number
}

export interface PayloadV2 {
	identifiers: IdentifiersV2
	device: DeviceV2
	network?: NetworkV2
}

/**
 * AR-187: Build v2 format payload from telemetry submission data
 */
export function buildPayloadV2(data: TelemetrySubmission, sessionId: string): PayloadV2 {
	const loose = data.fingerprint.loose || {}

	// Build identifiers section
	const identifiers: IdentifiersV2 = {
		session_id: sessionId,
		evercookie_id: data.evercookie?.id,
		public_key: data.cryptoId?.publicKey,
	}

	// Build device.hashes section
	const hashes: DeviceHashesV2 = {
		stable: data.fingerprint.hashes?.stable || '',
		fuzzy: data.fingerprint.hashes?.fuzzy || '',
		canvas: loose.canvas2d?.$hash,
		webgl: loose.canvasWebgl?.$hash,
		audio: loose.offlineAudioContext?.$hash,
		fonts: loose.fonts?.$hash,
	}

	// Build device.browser section
	const browser: BrowserInfoV2 | undefined = {
		user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
		language: typeof navigator !== 'undefined' ? navigator.language : undefined,
	}

	// Build device.screen section
	const screen: ScreenInfoV2 | undefined = loose.screen
		? {
				width: loose.screen.width,
				height: loose.screen.height,
				color_depth: loose.screen.colorDepth,
				pixel_ratio: loose.screen.pixelRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : undefined),
			}
		: undefined

	// Build device.hardware section
	const hardware: HardwareInfoV2 | undefined = {
		concurrency: loose.navigator?.hardwareConcurrency || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined),
		memory: loose.navigator?.deviceMemory || (typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined),
		gpu: loose.canvasWebgl?.gpu?.compressedGPU || loose.workerScope?.webglRenderer,
	}

	// Build device section
	const device: DeviceV2 = {
		hashes,
		browser,
		screen,
		hardware,
		timezone: loose.timezone?.location || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined),
	}

	// Build network section (from sigint data)
	let network: NetworkV2 | undefined
	if (data.sigint) {
		network = {
			ip: data.sigint.tlsFingerprint?.ip,
			ja4: data.sigint.tlsFingerprint?.ja4,
			ja3: data.sigint.tlsFingerprint?.ja3,
			tcp_rtt_us: data.sigint.tcpProbe?.rtt_fingerprint?.tcp_rtt_us,
			proxy_score: data.sigint.tcpProbe?.rtt_fingerprint?.proxy_score,
			vpn_score: data.sigint.tcpProbe?.rtt_fingerprint?.vpn_score,
		}
	}

	return {
		identifiers,
		device,
		network,
	}
}

// ============================================================================
// V1 Types (Legacy - deprecated)
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

export interface FuzzyMatchInfo {
	incoming_hash: string
	stored_hash: string
	hamming_distance: number
	similarity: number
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
	fuzzy_match_info?: FuzzyMatchInfo
}

export interface TelemetryResult {
	sessionId: string
	submitted: boolean
	matchResult?: MatchResult
	/** Full API response from GET /v1/session/{session_id} */
	apiResponse?: SessionResponseV2
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
		// Strip static- or demo- prefix to get the stage name
		if (stage.startsWith('static-')) {
			stage = stage.replace('static-', '')
		} else if (stage.startsWith('demo-')) {
			stage = stage.replace('demo-', '')
		} else if (stage === 'static' || stage === 'demo') {
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
		// AR-187: Build v2 format submission payload
		const submission = buildPayloadV2(data, sessionId)

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
						'X-Argus-Schema-Version': SCHEMA_VERSION,
					},
					body: gzippedBytes, // Raw Uint8Array - browser sends as binary
					signal: controller.signal,
				})
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
			const pollResult = await pollSessionResult(apiBase, sessionId, maxPollAttempts, pollDelayMs, timeout)
			if (pollResult) {
				result.matchResult = pollResult.matchResult
				result.apiResponse = pollResult.apiResponse
			}
			result.timing.pollMs = performance.now() - pollStart
		}

	} catch (err: any) {
		result.error = err.message || String(err)
	}

	result.timing.totalMs = performance.now() - startTime
	return result
}

interface PollResult {
	matchResult: MatchResult
	apiResponse: SessionResponseV2
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
): Promise<PollResult | undefined> {
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
				// AR-189: Handle both v1 and v2 response formats
				// v2 has analysis.status, v1 has status at root
				if (result.analysis) {
					// V2 format
					if (result.analysis.status === 'pending') {
						continue
					}
					const apiResponse = result as SessionResponseV2
					return {
						matchResult: parseSessionResponseV2(apiResponse),
						apiResponse,
					}
				} else {
					// V1 format (backward compat) - wrap in v2 structure
					if (result.status === 'pending') {
						continue
					}
					const matchResult = result as MatchResult
					return {
						matchResult,
						apiResponse: {
							identifiers: { session_id: sessionId, device_id: matchResult.device_id },
							analysis: {
								status: matchResult.status as 'complete',
								confidence: matchResult.confidence,
								match_tier: matchResult.match_tier,
								risk_score: matchResult.risk_score,
								flags: matchResult.flags,
								evidence_codes: matchResult.evidence_codes,
							},
						},
					}
				}
			}
		} catch (err) {
			// Retry on error
		}
	}

	return undefined
}

/**
 * AR-189: V2 Session Response type (from API)
 * This is the full API response from GET /v1/session/{session_id}
 */
export interface SessionResponseV2 {
	identifiers: {
		session_id: string
		device_id?: string
		evercookie_id?: string
		public_key?: string
	}
	device?: {
		hashes?: {
			stable?: string
			fuzzy?: string
			canvas?: string
			webgl?: string
			audio?: string
			fonts?: string
		}
		user_agent?: string
		platform?: string
		language?: string
		languages?: string[]
		hardware_concurrency?: number
		device_memory?: number
		max_touch_points?: number
		screen_width?: number
		screen_height?: number
		color_depth?: number
		pixel_ratio?: number
		gpu_vendor?: string
		gpu_renderer?: string
		timezone_offset?: number
		timezone_name?: string
		webdriver?: boolean
		headless_signals?: string[]
	}
	network?: {
		ip?: string
		geo?: {
			country?: string
			city?: string
			asn?: string
		}
		is_proxy?: boolean
		is_vpn?: boolean
		ja3?: string
		ja4?: string
		headers?: Record<string, string>
		webrtc_local_ip?: string
		webrtc_public_ip?: string
	}
	analysis: {
		status: 'pending' | 'complete' | 'degraded'
		confidence?: number
		match_tier?: number
		risk_score?: number
		flags?: string[]
		evidence_codes?: string[]
		simhash_details?: SimHashDetails
		fuzzy_match_info?: FuzzyMatchInfo
	}
}

/**
 * AR-189: Parse v2 session response into v1 MatchResult format
 * This allows the demo site to continue using the existing v1 interface
 */
export function parseSessionResponseV2(v2Response: SessionResponseV2): MatchResult {
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
	}
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
