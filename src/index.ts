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

// Sigint integration - server-side fingerprinting (JA3/JA4, TCP RTT, STUN)
export {
	collectSigintData,
	fetchTlsFingerprint,
	fetchTcpProbe,
	performStunBinding,
	parseSigintConfigFromUrl,
	getTlsFingerprintEndpoint,
	getTcpProbeEndpoint,
	getStunServerUri,
	getProxyScore,
	getTlsHash,
	getThirdPartyCookieId,
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
