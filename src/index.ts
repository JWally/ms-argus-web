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
