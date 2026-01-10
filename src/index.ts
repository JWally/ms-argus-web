/**
 * CreepJS - Browser Fingerprinting Library
 *
 * Enterprise-ready fingerprint collection for fraud and bot detection.
 * No UI rendering - pure JSON output.
 */

// Main orchestrator
export {
	collectFingerprint,
	// Types
	type FingerprintResult,
	type FingerprintMeta,
	type FingerprintHashes,
	type BotSignals,
	// Individual collectors for modular use
	getOfflineAudioContext,
	getCanvas2d,
	getCSS,
	getCSSMedia,
	getHTMLElementVersion,
	getClientRects,
	getConsoleErrors,
	getEngineFeatures,
	getFonts,
	getHeadlessFeatures,
	getIntl,
	getLies,
	getMaths,
	getMedia,
	getNavigator,
	getResistance,
	getScreen,
	getVoices,
	getStatus,
	getSVG,
	getTimezone,
	getTrash,
	getCanvasWebgl,
	getWebRTCData,
	getWebRTCDevices,
	getWindowFeatures,
	getBestWorkerScope,
	// Utilities
	hashify,
	hashMini,
	getBotHash,
	getFuzzyHash,
} from './fingerprint'

// Default export for convenience
export { collectFingerprint as default } from './fingerprint'

// Crypto ID - persistent ECDSA key pair for device identity
export {
	getCryptoId,
	signWithCryptoId,
	resetCryptoIdMemo,
	clearStoredKeys,
	type CryptoKeys,
} from './utils/get-crypto-id'

// Evercookie - multi-storage persistent device identifier
export {
	getEvercookieId,
	getEvercookieIdSync,
	refreshEvercookieId,
	clearEvercookieId,
	getEvercookieDiagnostics,
	forceRespawn,
	type EvercookieData,
	type StorageMechanism,
} from './utils/evercookie'

// Favicon cache - additional persistence using browser favicon cache
export {
	getFaviconCacheId,
	getFaviconCacheIdSync,
	refreshFaviconCacheId,
	clearFaviconCacheId,
	setFaviconCacheId,
	getFaviconCacheDiagnostics,
	type FaviconCacheData,
	type FaviconCacheConfig,
	SERVER_REFERENCE as FAVICON_SERVER_REFERENCE,
} from './utils/favicon-cache'

// Sigint integration - server-side fingerprinting (JA3/JA4, TCP RTT, STUN, Favicon Cache)
export {
	collectSigintData,
	fetchTlsFingerprint,
	fetchTcpProbe,
	performStunBinding,
	parseSigintConfigFromUrl,
	getTlsFingerprintEndpoint,
	getTcpProbeEndpoint,
	getStunServerUri,
	getFaviconCacheEndpoint,
	getFaviconCacheConfig,
	getProxyScore,
	getTlsHash,
	getThirdPartyCookieId,
	getFaviconCacheDeviceId,
	type SigintConfig,
	type SigintData,
	type TlsFingerprintResponse,
	type TcpProbeResponse,
	type TcpInfo,
	type RttFingerprint,
	type Http2Fingerprint,
	type ClientHints,
	type StunResult,
} from './utils/sigint'

// WebRTC STUN configuration
export {
	setCustomStunServers,
	clearCustomStunServers,
	getStunServers,
} from './webrtc/constants'

// ============================================================================
// Unified load() function for lite loader compatibility
// ============================================================================

import { collectFingerprint as _collectFingerprint } from './fingerprint'
import { collectSigintData as _collectSigintData, getStunServerUri as _getStunServerUri, type SigintConfig } from './utils/sigint'
import { setCustomStunServers as _setCustomStunServers } from './webrtc/constants'

export interface LoadOptions {
	enableSigint?: boolean
	sigint?: Partial<SigintConfig>
}

export interface LoadResult {
	fingerprint: Awaited<ReturnType<typeof _collectFingerprint>>
	sigint?: Awaited<ReturnType<typeof _collectSigintData>>
	timing: { start: number; end: number; duration: number }
}

/**
 * Unified load function - collects fingerprint and optionally sigint data.
 * Used by the lite loader to run fingerprinting inside an iframe.
 */
export async function load(opts: LoadOptions = {}): Promise<LoadResult> {
	const start = performance.now()

	// Configure STUN servers if sigint is enabled
	if (opts.enableSigint && opts.sigint?.baseDomain) {
		const stunUri = _getStunServerUri(opts.sigint as SigintConfig)
		_setCustomStunServers([stunUri])
	}

	// Run fingerprint and sigint in parallel
	const [fingerprint, sigint] = await Promise.all([
		_collectFingerprint(),
		opts.enableSigint ? _collectSigintData(opts.sigint || {}) : Promise.resolve(undefined),
	])

	const end = performance.now()

	return {
		fingerprint,
		sigint,
		timing: { start, end, duration: end - start },
	}
}
