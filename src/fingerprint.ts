/**
 * CreepJS Fingerprint Orchestrator
 *
 * Clean, JSON-only fingerprint collection without DOM rendering.
 * For enterprise fraud/bot detection use cases.
 */

import getOfflineAudioContext from './audio'
import getCanvas2d from './canvas'
import getCSS from './css'
import getCSSMedia from './cssmedia'
import getHTMLElementVersion from './document'
import getClientRects from './domrect'
import getConsoleErrors from './engine'
import { timer, getCapturedErrors, caniuse } from './errors'
import getEngineFeatures, { getFeaturesLie } from './features'
import getFonts from './fonts'
import getHeadlessFeatures from './headless'
import getIntl from './intl'
import { getLies, PARENT_PHANTOM } from './lies'
import getMaths from './math'
import getMedia from './media'
import getNavigator from './navigator'
import getResistance from './resistance'
import getScreen from './screen'
import getVoices from './speech'
import { getStatus } from './status'
import getSVG from './svg'
import getTimezone from './timezone'
import { getTrash } from './trash'
import { getBotHash, getFuzzyHash, hashify } from './utils/crypto'
import { IS_BLINK, braveBrowser, getBraveMode, getBraveUnprotectedParameters, LowerEntropy, computeWindowsRelease } from './utils/helpers'
import getCanvasWebgl from './webgl'
import getWebRTCData, { getWebRTCDevices } from './webrtc'
import getWindowFeatures from './window'
import getBestWorkerScope, { Scope, spawnWorker } from './worker'
import getWasmFingerprint from './wasm'
import getWebGpuCompute from './webgpu-compute'
import getTimingFingerprint from './timing'
import { analyzeInconsistencies } from './inconsistencies'
import detectProxy from './proxy'

// Types for the fingerprint result
export interface FingerprintMeta {
	timestamp: number
	durationMs: number
	version: string
}

export interface BotSignals {
	botHash: string
	badBot: string | undefined
	isHeadless: boolean
	hasLies: boolean
	lieCount: number
	stealthSignals: Record<string, boolean>
	likelyResidentialProxy: boolean
	/** True if detected JS engine doesn't match User-Agent claim (e.g., Firefox claiming to be Chrome) */
	engineMismatch: boolean
}

export interface FingerprintHashes {
	loose: string
	stable: string
	fuzzy: string
	deviceOfTimezone: string
}

export interface FingerprintResult {
	loose: Record<string, any>
	stable: Record<string, any>
	hashes: FingerprintHashes
	botSignals: BotSignals
	meta: FingerprintMeta
}

/**
 * Collect a complete browser fingerprint
 *
 * @returns Promise<FingerprintResult> - The complete fingerprint with loose/stable data and bot signals
 */
export async function collectFingerprint(): Promise<FingerprintResult> {
	const startTime = timer()
	const fingerprintTimeStart = timer()

	// Initialize worker scope for lie detection
	const scope = await spawnWorker()

	if (scope === Scope.WORKER) {
		throw new Error('collectFingerprint should only be called from the main window context')
	}

	// Detect Brave browser mode
	const isBrave = IS_BLINK ? await braveBrowser() : false
	const braveMode = isBrave ? getBraveMode() : {}
	const braveFingerprintingBlocking = isBrave && (braveMode.standard || braveMode.strict)

	// Collect all fingerprint data in parallel
	// @ts-ignore
	const [
		workerScopeComputed,
		voicesComputed,
		offlineAudioContextComputed,
		canvasWebglComputed,
		canvas2dComputed,
		windowFeaturesComputed,
		htmlElementVersionComputed,
		cssComputed,
		cssMediaComputed,
		screenComputed,
		mathsComputed,
		consoleErrorsComputed,
		timezoneComputed,
		clientRectsComputed,
		fontsComputed,
		mediaComputed,
		svgComputed,
		resistanceComputed,
		intlComputed,
		webrtcComputed,
		wasmComputed,
		webgpuComputeComputed,
		timingComputed,
		proxyComputed,
	] = await Promise.all([
		getBestWorkerScope(),
		getVoices(),
		getOfflineAudioContext(),
		getCanvasWebgl(),
		getCanvas2d(),
		getWindowFeatures(),
		getHTMLElementVersion(),
		getCSS(),
		getCSSMedia(),
		getScreen(),
		getMaths(),
		getConsoleErrors(),
		getTimezone(),
		getClientRects(),
		getFonts(),
		getMedia(),
		getSVG(),
		getResistance(),
		getIntl(),
		getWebRTCData(),
		getWasmFingerprint({ fast: true }), // Use fast mode to avoid blocking too long
		getWebGpuCompute(),
		getTimingFingerprint(),
		detectProxy(),
	]).catch((error) => {
		console.error('Fingerprint collection error:', error.message)
		return []
	})

	// Navigator depends on worker scope
	const navigatorComputed = await getNavigator(workerScopeComputed).catch((error) => {
		console.error('Navigator error:', error.message)
		return null
	})

	// Headless and features depend on other computed values
	// @ts-ignore
	const [headlessComputed, featuresComputed] = await Promise.all([
		getHeadlessFeatures({
			webgl: canvasWebglComputed,
			workerScope: workerScopeComputed,
		}),
		getEngineFeatures({
			cssComputed,
			windowFeaturesComputed,
		}),
	]).catch((error) => {
		console.error('Features error:', error.message)
		return []
	})

	// Get lies, trash, and errors
	// @ts-ignore
	const [liesComputed, trashComputed, capturedErrorsComputed] = await Promise.all([
		getLies(),
		getTrash(),
		getCapturedErrors(),
	]).catch((error) => {
		console.error('Lies/trash error:', error.message)
		return []
	})

	const fingerprintTimeEnd = fingerprintTimeStart()

	// GPU Prediction handling
	const { parameters: gpuParameter } = canvasWebglComputed || {}
	const reducedGPUParameters = {
		...(braveFingerprintingBlocking
			? getBraveUnprotectedParameters(gpuParameter)
			: gpuParameter),
		RENDERER: undefined,
		SHADING_LANGUAGE_VERSION: undefined,
		UNMASKED_RENDERER_WEBGL: undefined,
		UNMASKED_VENDOR_WEBGL: undefined,
		VERSION: undefined,
		VENDOR: undefined,
	}

	// Hash all components
	// @ts-ignore
	const [
		windowHash,
		headlessHash,
		htmlHash,
		cssMediaHash,
		cssHash,
		styleHash,
		styleSystemHash,
		screenHash,
		voicesHash,
		canvas2dHash,
		canvas2dImageHash,
		canvas2dPaintHash,
		canvas2dTextHash,
		canvas2dEmojiHash,
		canvasWebglHash,
		canvasWebglImageHash,
		canvasWebglParametersHash,
		pixelsHash,
		pixels2Hash,
		mathsHash,
		consoleErrorsHash,
		timezoneHash,
		rectsHash,
		domRectHash,
		audioHash,
		fontsHash,
		workerHash,
		mediaHash,
		mimeTypesHash,
		navigatorHash,
		liesHash,
		trashHash,
		errorsHash,
		svgHash,
		resistanceHash,
		intlHash,
		featuresHash,
		webrtcHash,
		wasmHash,
		webgpuComputeHash,
		timingHash,
		proxyHash,
		deviceOfTimezoneHash,
	] = await Promise.all([
		hashify(windowFeaturesComputed),
		hashify(headlessComputed),
		hashify((htmlElementVersionComputed || {}).keys),
		hashify(cssMediaComputed),
		hashify(cssComputed),
		hashify((cssComputed || {}).computedStyle),
		hashify((cssComputed || {}).system),
		hashify(screenComputed),
		hashify(voicesComputed),
		hashify(canvas2dComputed),
		hashify((canvas2dComputed || {}).dataURI),
		hashify((canvas2dComputed || {}).paintURI),
		hashify((canvas2dComputed || {}).textURI),
		hashify((canvas2dComputed || {}).emojiURI),
		hashify(canvasWebglComputed),
		hashify((canvasWebglComputed || {}).dataURI),
		hashify(reducedGPUParameters),
		((canvasWebglComputed || {}).pixels || []).length
			? hashify(canvasWebglComputed.pixels)
			: undefined,
		((canvasWebglComputed || {}).pixels2 || []).length
			? hashify(canvasWebglComputed.pixels2)
			: undefined,
		hashify((mathsComputed || {}).data),
		hashify((consoleErrorsComputed || {}).errors),
		hashify(timezoneComputed),
		hashify(clientRectsComputed),
		hashify([
			(clientRectsComputed || {}).elementBoundingClientRect,
			(clientRectsComputed || {}).elementClientRects,
			(clientRectsComputed || {}).rangeBoundingClientRect,
			(clientRectsComputed || {}).rangeClientRects,
		]),
		hashify(offlineAudioContextComputed),
		hashify(fontsComputed),
		hashify(workerScopeComputed),
		hashify(mediaComputed),
		hashify((mediaComputed || {}).mimeTypes),
		hashify(navigatorComputed),
		hashify(liesComputed),
		hashify(trashComputed),
		hashify(capturedErrorsComputed),
		hashify(svgComputed),
		hashify(resistanceComputed),
		hashify(intlComputed),
		hashify(featuresComputed),
		hashify(webrtcComputed),
		hashify(wasmComputed),
		hashify(webgpuComputeComputed),
		hashify(timingComputed),
		hashify(proxyComputed),
		hashify(
			(() => {
				const {
					bluetoothAvailability,
					device,
					deviceMemory,
					hardwareConcurrency,
					maxTouchPoints,
					oscpu,
					platform,
					system,
					userAgentData,
				} = navigatorComputed || {}
				const {
					architecture,
					bitness,
					mobile,
					model,
					platform: uaPlatform,
					platformVersion,
				} = userAgentData || {}
				const { 'any-pointer': anyPointer } = cssMediaComputed?.mediaCSS || {}
				const { colorDepth, pixelDepth, height, width } = screenComputed || {}
				const { location, zone } = timezoneComputed || {}
				const {
					deviceMemory: deviceMemoryWorker,
					hardwareConcurrency: hardwareConcurrencyWorker,
					gpu,
					platform: platformWorker,
					system: systemWorker,
					timezoneLocation: locationWorker,
					userAgentData: userAgentDataWorker,
				} = workerScopeComputed || {}
				const { compressedGPU, confidence } = gpu || {}
				const {
					architecture: architectureWorker,
					bitness: bitnessWorker,
					mobile: mobileWorker,
					model: modelWorker,
					platform: uaPlatformWorker,
					platformVersion: platformVersionWorker,
				} = userAgentDataWorker || {}

				return [
					anyPointer,
					architecture,
					architectureWorker,
					bitness,
					bitnessWorker,
					bluetoothAvailability,
					colorDepth,
					...(compressedGPU && confidence != 'low' ? [compressedGPU] : []),
					device,
					deviceMemory,
					deviceMemoryWorker,
					hardwareConcurrency,
					hardwareConcurrencyWorker,
					height,
					location,
					locationWorker,
					maxTouchPoints,
					mobile,
					mobileWorker,
					model,
					modelWorker,
					oscpu,
					pixelDepth,
					platform,
					platformWorker,
					platformVersion,
					platformVersionWorker,
					system,
					systemWorker,
					uaPlatform,
					uaPlatformWorker,
					width,
					zone,
				]
			})(),
		),
	]).catch((error) => {
		console.error('Hashing error:', error.message)
		return []
	})

	// Clean up phantom element if created
	if (PARENT_PHANTOM) {
		// @ts-ignore
		PARENT_PHANTOM.parentNode.removeChild(PARENT_PHANTOM)
	}

	// Build the loose fingerprint (full raw data)
	const loose = {
		workerScope: !workerScopeComputed
			? undefined
			: { ...workerScopeComputed, $hash: workerHash },
		navigator: !navigatorComputed
			? undefined
			: { ...navigatorComputed, $hash: navigatorHash },
		windowFeatures: !windowFeaturesComputed
			? undefined
			: { ...windowFeaturesComputed, $hash: windowHash },
		headless: !headlessComputed
			? undefined
			: { ...headlessComputed, $hash: headlessHash },
		htmlElementVersion: !htmlElementVersionComputed
			? undefined
			: { ...htmlElementVersionComputed, $hash: htmlHash },
		cssMedia: !cssMediaComputed
			? undefined
			: { ...cssMediaComputed, $hash: cssMediaHash },
		css: !cssComputed ? undefined : { ...cssComputed, $hash: cssHash },
		screen: !screenComputed
			? undefined
			: { ...screenComputed, $hash: screenHash },
		voices: !voicesComputed
			? undefined
			: { ...voicesComputed, $hash: voicesHash },
		media: !mediaComputed ? undefined : { ...mediaComputed, $hash: mediaHash },
		canvas2d: !canvas2dComputed
			? undefined
			: { ...canvas2dComputed, $hash: canvas2dHash },
		canvasWebgl: !canvasWebglComputed
			? undefined
			: {
					...canvasWebglComputed,
					pixels: pixelsHash,
					pixels2: pixels2Hash,
					$hash: canvasWebglHash,
			  },
		maths: !mathsComputed ? undefined : { ...mathsComputed, $hash: mathsHash },
		consoleErrors: !consoleErrorsComputed
			? undefined
			: { ...consoleErrorsComputed, $hash: consoleErrorsHash },
		timezone: !timezoneComputed
			? undefined
			: { ...timezoneComputed, $hash: timezoneHash },
		clientRects: !clientRectsComputed
			? undefined
			: { ...clientRectsComputed, $hash: rectsHash },
		offlineAudioContext: !offlineAudioContextComputed
			? undefined
			: { ...offlineAudioContextComputed, $hash: audioHash },
		fonts: !fontsComputed ? undefined : { ...fontsComputed, $hash: fontsHash },
		lies: !liesComputed ? undefined : { ...liesComputed, $hash: liesHash },
		trash: !trashComputed ? undefined : { ...trashComputed, $hash: trashHash },
		capturedErrors: !capturedErrorsComputed
			? undefined
			: { ...capturedErrorsComputed, $hash: errorsHash },
		svg: !svgComputed ? undefined : { ...svgComputed, $hash: svgHash },
		resistance: !resistanceComputed
			? undefined
			: { ...resistanceComputed, $hash: resistanceHash },
		intl: !intlComputed ? undefined : { ...intlComputed, $hash: intlHash },
		features: !featuresComputed
			? undefined
			: { ...featuresComputed, $hash: featuresHash },
		webrtc: !webrtcComputed ? undefined : { ...webrtcComputed, $hash: webrtcHash },
		wasm: !wasmComputed ? undefined : { ...wasmComputed, $hash: wasmHash },
		webgpuCompute: !webgpuComputeComputed ? undefined : { ...webgpuComputeComputed, $hash: webgpuComputeHash },
		timing: !timingComputed ? undefined : { ...timingComputed, $hash: timingHash },
		proxy: !proxyComputed ? undefined : { ...proxyComputed, $hash: proxyHash },
	}

	// Build the stable fingerprint (filtered/hardened for production)
	const hardenEntropy = (workerScope: any, prop: any) => {
		return !workerScope
			? prop
			: workerScope.localeEntropyIsTrusty && workerScope.localeIntlEntropyIsTrusty
			? prop
			: undefined
	}

	const privacyResistFingerprinting =
		resistanceComputed && /^(tor browser|firefox)$/i.test(resistanceComputed.privacy)

	const hardenGPU = (canvasWebgl: any) => {
		const {
			gpu: { confidence, compressedGPU },
		} = canvasWebgl
		return confidence == 'low'
			? {}
			: {
					UNMASKED_RENDERER_WEBGL: compressedGPU,
					UNMASKED_VENDOR_WEBGL: canvasWebgl.parameters.UNMASKED_VENDOR_WEBGL,
			  }
	}

	const stable = {
		navigator:
			!navigatorComputed || navigatorComputed.lied
				? undefined
				: {
						bluetoothAvailability: navigatorComputed.bluetoothAvailability,
						device: navigatorComputed.device,
						deviceMemory: navigatorComputed.deviceMemory,
						hardwareConcurrency: navigatorComputed.hardwareConcurrency,
						maxTouchPoints: navigatorComputed.maxTouchPoints,
						oscpu: navigatorComputed.oscpu,
						platform: navigatorComputed.platform,
						system: navigatorComputed.system,
						userAgentData: {
							...(navigatorComputed.userAgentData || {}),
							brandsVersion: undefined,
							uaFullVersion: undefined,
						},
						vendor: navigatorComputed.vendor,
				  },
		screen:
			!screenComputed ||
			screenComputed.lied ||
			privacyResistFingerprinting ||
			LowerEntropy.SCREEN
				? undefined
				: hardenEntropy(workerScopeComputed, {
						height: screenComputed.height,
						width: screenComputed.width,
						pixelDepth: screenComputed.pixelDepth,
						colorDepth: screenComputed.colorDepth,
						lied: screenComputed.lied,
				  }),
		workerScope:
			!workerScopeComputed || workerScopeComputed.lied
				? undefined
				: {
						deviceMemory: braveFingerprintingBlocking
							? undefined
							: workerScopeComputed.deviceMemory,
						hardwareConcurrency: braveFingerprintingBlocking
							? undefined
							: workerScopeComputed.hardwareConcurrency,
						language: !LowerEntropy.TIME_ZONE
							? workerScopeComputed.language
							: undefined,
						platform: workerScopeComputed.platform,
						system: workerScopeComputed.system,
						device: workerScopeComputed.device,
						timezoneLocation: !LowerEntropy.TIME_ZONE
							? hardenEntropy(workerScopeComputed, workerScopeComputed.timezoneLocation)
							: undefined,
						webglRenderer:
							workerScopeComputed.gpu.confidence != 'low'
								? workerScopeComputed.gpu.compressedGPU
								: undefined,
						webglVendor:
							workerScopeComputed.gpu.confidence != 'low'
								? workerScopeComputed.webglVendor
								: undefined,
						userAgentData: {
							...workerScopeComputed.userAgentData,
							brandsVersion: undefined,
							uaFullVersion: undefined,
						},
				  },
		media: mediaComputed,
		canvas2d: ((canvas2d) => {
			if (!canvas2d) {
				return
			}
			const { lied, liedTextMetrics } = canvas2d
			let data: any
			if (!lied) {
				const { dataURI, paintURI, textURI, emojiURI } = canvas2d
				data = {
					lied,
					...{ dataURI, paintURI, textURI, emojiURI },
				}
			}
			if (!liedTextMetrics) {
				const { textMetricsSystemSum, emojiSet } = canvas2d
				data = {
					...(data || {}),
					...{ textMetricsSystemSum, emojiSet },
				}
			}
			return data
		})(canvas2dComputed),
		canvasWebgl:
			!canvasWebglComputed || canvasWebglComputed.lied || LowerEntropy.WEBGL
				? undefined
				: braveFingerprintingBlocking
				? {
						parameters: {
							...getBraveUnprotectedParameters(canvasWebglComputed.parameters),
							...hardenGPU(canvasWebglComputed),
						},
				  }
				: {
						...((gl, canvas2d) => {
							if ((canvas2d && canvas2d.lied) || LowerEntropy.CANVAS) {
								const { extensions, gpu, lied, parameterOrExtensionLie } = gl
								return {
									extensions,
									gpu,
									lied,
									parameterOrExtensionLie,
								}
							}
							return gl
						})(canvasWebglComputed, canvas2dComputed),
						parameters: {
							...canvasWebglComputed.parameters,
							...hardenGPU(canvasWebglComputed),
						},
				  },
		cssMedia: !cssMediaComputed
			? undefined
			: {
					reducedMotion: caniuse(
						() => cssMediaComputed.mediaCSS['prefers-reduced-motion'],
					),
					colorScheme: braveFingerprintingBlocking
						? undefined
						: caniuse(() => cssMediaComputed.mediaCSS['prefers-color-scheme']),
					monochrome: caniuse(() => cssMediaComputed.mediaCSS.monochrome),
					invertedColors: caniuse(
						() => cssMediaComputed.mediaCSS['inverted-colors'],
					),
					forcedColors: caniuse(() => cssMediaComputed.mediaCSS['forced-colors']),
					anyHover: caniuse(() => cssMediaComputed.mediaCSS['any-hover']),
					hover: caniuse(() => cssMediaComputed.mediaCSS.hover),
					anyPointer: caniuse(() => cssMediaComputed.mediaCSS['any-pointer']),
					pointer: caniuse(() => cssMediaComputed.mediaCSS.pointer),
					colorGamut: caniuse(() => cssMediaComputed.mediaCSS['color-gamut']),
					screenQuery:
						privacyResistFingerprinting ||
						LowerEntropy.SCREEN ||
						LowerEntropy.IFRAME_SCREEN
							? undefined
							: hardenEntropy(
									workerScopeComputed,
									caniuse(() => cssMediaComputed.screenQuery),
							  ),
			  },
		css: !cssComputed ? undefined : cssComputed.system.fonts,
		timezone:
			!timezoneComputed || timezoneComputed.lied || LowerEntropy.TIME_ZONE
				? undefined
				: {
						// Raw timezone data for server-side validation
						location: timezoneComputed.location,
						offset: timezoneComputed.offset,
						offsetComputed: timezoneComputed.offsetComputed,
						lied: timezoneComputed.lied,
				  },
		offlineAudioContext: !offlineAudioContextComputed
			? undefined
			: offlineAudioContextComputed.lied || LowerEntropy.AUDIO
			? undefined
			: offlineAudioContextComputed,
		fonts:
			!fontsComputed || fontsComputed.lied || LowerEntropy.FONTS
				? undefined
				: fontsComputed.fontFaceLoadFonts,
		wasm: !wasmComputed || wasmComputed.lied
			? undefined
			: {
					simdSupported: wasmComputed.simdSupported,
					memCeiling: wasmComputed.memCeiling,
					sharedArrayBuffer: wasmComputed.sharedArrayBuffer,
					workerAvailable: wasmComputed.workerAvailable,
			  },
		forceRenew: 1737085481442,
	}

	// Calculate hashes
	const [looseHash, stableHash] = await Promise.all([
		hashify(loose),
		hashify(stable),
	]).catch(() => ['', ''])

	const fuzzyHash = await getFuzzyHash(loose).catch(() => '')

	// Analyze internal inconsistencies across signals
	const inconsistencies = analyzeInconsistencies(loose)

	// Get bot signals
	const { botHash, badBot } = getBotHash(loose, { getFeaturesLie, computeWindowsRelease })
	const { totalLies } = liesComputed || {}
	const { stealth } = headlessComputed || {}

	const botSignals: BotSignals = {
		botHash,
		badBot,
		isHeadless: !!(headlessComputed?.headless && Object.values(headlessComputed.headless).some(Boolean)),
		hasLies: !!(liesComputed && liesComputed.totalLies > 0),
		lieCount: totalLies || 0,
		stealthSignals: stealth || {},
		likelyResidentialProxy: proxyComputed?.likelyResidentialProxy || false,
		engineMismatch: consoleErrorsComputed?.engineMismatch || false,
	}

	const timeEnd = startTime()

	return {
		loose,
		stable,
		hashes: {
			loose: looseHash || '',
			stable: stableHash || '',
			fuzzy: fuzzyHash,
			deviceOfTimezone: deviceOfTimezoneHash || '',
		},
		botSignals,
		inconsistencies,
		meta: {
			timestamp: Date.now(),
			durationMs: timeEnd,
			version: '1.0.0',
		},
	}
}

// Export individual collectors for modular use
export {
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
	getWasmFingerprint,
}

// Export utilities
export { hashify, hashMini, getBotHash, getFuzzyHash } from './utils/crypto'
