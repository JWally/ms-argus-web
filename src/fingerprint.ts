/**
 * CreepJS Fingerprint Orchestrator
 *
 * Clean, JSON-only fingerprint collection without DOM rendering.
 * For enterprise fraud/bot detection use cases.
 */

import getOfflineAudioContext from './audio';
import getCanvas2d from './canvas';
import getCSS from './css';
import getCSSMedia from './cssmedia';
import getHTMLElementVersion from './document';
import getClientRects from './domrect';
import getConsoleErrors from './engine';
import { timer, getCapturedErrors, caniuse } from './errors';
import getEngineFeatures, { getFeaturesLie } from './features';
import getFonts from './fonts';
import getHeadlessFeatures from './headless';
import getIntl from './intl';
import { getLies, PARENT_PHANTOM } from './lies';
import getMaths from './math';
import getMedia from './media';
import getNavigator from './navigator';
import getResistance from './resistance';
import getScreen from './screen';
import getVoices from './speech';
import { getStatus } from './status';
import getSVG from './svg';
import getTimezone from './timezone';
import { getTrash } from './trash';
import { getBotHash, getFuzzyHash, hashify, simhashify } from './utils/crypto';
import { removeVolatile, getDroppedKeys } from './utils/delta';
import {
  IS_BLINK,
  braveBrowser,
  getBraveMode,
  getBraveUnprotectedParameters,
  LowerEntropy,
  computeWindowsRelease,
} from './utils/helpers';
import getCanvasWebgl from './webgl';
import getWebRTCData, { getWebRTCDevices } from './webrtc';
import getWindowFeatures from './window';
import getBestWorkerScope, { Scope, spawnWorker } from './worker';
import getWebGpuCompute from './webgpu-compute';
import getTimingFingerprint from './timing';
import { analyzeInconsistencies } from './inconsistencies';
import detectProxy from './proxy';
import { detectIncognito, detectPrivateFromDelta } from './incognito';

// Types for the fingerprint result
export interface FingerprintMeta {
  timestamp: number;
  durationMs: number;
  version: string;
}

export interface BotSignals {
  botHash: string;
  badBot: string | undefined;
  isHeadless: boolean;
  hasLies: boolean;
  lieCount: number;
  stealthSignals: Record<string, boolean>;
  likelyResidentialProxy: boolean;
  /** True if detected JS engine doesn't match User-Agent claim (e.g., Firefox claiming to be Chrome) */
  engineMismatch: boolean;
  /** True if private/incognito browsing detected */
  isPrivate: boolean;
}

export interface FingerprintHashes {
  loose: string;
  stable: string;
  fuzzy: string;
  deviceOfTimezone: string;
}

export interface DeltaReport {
  canvas2d: string[];
  canvasWebgl: string[];
  offlineAudioContext: string[];
  css: string[];
  cssMedia: string[];
  screen: string[];
  fonts: string[];
  media: string[];
  timezone: string[];
}

export interface FingerprintResult {
  loose: Record<string, any>;
  stable: Record<string, any>;
  hashes: FingerprintHashes;
  botSignals: BotSignals;
  deltaReport: DeltaReport;
  meta: FingerprintMeta;
}

/**
 * Collect a complete browser fingerprint
 *
 * @returns Promise<FingerprintResult> - The complete fingerprint with loose/stable data and bot signals
 */
export async function collectFingerprint(): Promise<FingerprintResult> {
  const startTime = timer();
  const fingerprintTimeStart = timer();

  // Initialize worker scope for lie detection
  const scope = await spawnWorker();

  if (scope === Scope.WORKER) {
    throw new Error(
      'collectFingerprint should only be called from the main window context',
    );
  }

  // Detect Brave browser mode
  const isBrave = IS_BLINK ? await braveBrowser() : false;
  const braveMode = isBrave ? getBraveMode() : {};
  const braveFingerprintingBlocking =
    isBrave && (braveMode.standard || braveMode.strict);

  // Collect all fingerprint data in parallel.
  // Safe modules run twice concurrently for delta-based volatility detection.
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
    webgpuComputeComputed,
    timingComputed,
    proxyComputed,
    incognitoComputed,
    // Delta pass (second run of safe modules, runs concurrently with first)
    canvas2dRun2,
    canvasWebglRun2,
    offlineAudioContextRun2,
    mathsRun2,
    cssRun2,
    cssMediaRun2,
    screenRun2,
    fontsRun2,
    clientRectsRun2,
    voicesRun2,
    svgRun2,
    intlRun2,
    windowFeaturesRun2,
    htmlElementVersionRun2,
    consoleErrorsRun2,
    timezoneRun2,
    mediaRun2,
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
    getWebGpuCompute(),
    getTimingFingerprint(),
    detectProxy(),
    detectIncognito(),
    // Second run of safe modules (parallel with above)
    getCanvas2d(),
    getCanvasWebgl(),
    getOfflineAudioContext(),
    getMaths(),
    getCSS(),
    getCSSMedia(),
    getScreen(),
    getFonts(),
    getClientRects(),
    getVoices(),
    getSVG(),
    getIntl(),
    getWindowFeatures(),
    getHTMLElementVersion(),
    getConsoleErrors(),
    getTimezone(),
    getMedia(),
  ]).catch((error) => {
    console.error('Fingerprint collection error:', error.message);
    return [];
  });

  // Navigator depends on worker scope
  const navigatorComputed = await getNavigator(workerScopeComputed).catch(
    (error) => {
      console.error('Navigator error:', error.message);
      return null;
    },
  );

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
    console.error('Features error:', error.message);
    return [];
  });

  // Get lies, trash, and errors
  // @ts-ignore
  const [liesComputed, trashComputed, capturedErrorsComputed] =
    await Promise.all([getLies(), getTrash(), getCapturedErrors()]).catch(
      (error) => {
        console.error('Lies/trash error:', error.message);
        return [];
      },
    );

  const fingerprintTimeEnd = fingerprintTimeStart();

  // Delta-stable results: only attributes that matched across both runs.
  // Falls back to first-run data if delta pass failed (e.g. module errored on second run).
  const canvas2dStable: any =
    removeVolatile(canvas2dComputed, canvas2dRun2) ?? canvas2dComputed;
  const canvasWebglStable: any =
    removeVolatile(canvasWebglComputed, canvasWebglRun2) ?? canvasWebglComputed;
  const offlineAudioContextStable: any =
    removeVolatile(offlineAudioContextComputed, offlineAudioContextRun2) ??
    offlineAudioContextComputed;
  const cssStable: any = removeVolatile(cssComputed, cssRun2) ?? cssComputed;
  const cssMediaStable: any =
    removeVolatile(cssMediaComputed, cssMediaRun2) ?? cssMediaComputed;
  const screenStable: any =
    removeVolatile(screenComputed, screenRun2) ?? screenComputed;
  const fontsStable: any =
    removeVolatile(fontsComputed, fontsRun2) ?? fontsComputed;
  const mediaStable: any =
    removeVolatile(mediaComputed, mediaRun2) ?? mediaComputed;
  const timezoneStable: any =
    removeVolatile(timezoneComputed, timezoneRun2) ?? timezoneComputed;

  // Report which keys were dropped as volatile
  const deltaReport = {
    canvas2d: getDroppedKeys(canvas2dComputed, canvas2dStable),
    canvasWebgl: getDroppedKeys(canvasWebglComputed, canvasWebglStable),
    offlineAudioContext: getDroppedKeys(
      offlineAudioContextComputed,
      offlineAudioContextStable,
    ),
    css: getDroppedKeys(cssComputed, cssStable),
    cssMedia: getDroppedKeys(cssMediaComputed, cssMediaStable),
    screen: getDroppedKeys(screenComputed, screenRun2),
    fonts: getDroppedKeys(fontsComputed, fontsStable),
    media: getDroppedKeys(mediaComputed, mediaStable),
    timezone: getDroppedKeys(timezoneComputed, timezoneStable),
  };

  // Augment incognito detection with delta-based private mode signal
  if (incognitoComputed && !incognitoComputed.isPrivate) {
    const deltaPrivate = detectPrivateFromDelta({
      browser: incognitoComputed.browser,
      canvasLied: canvas2dComputed?.lied ?? false,
      canvasDeltaDropped: deltaReport.canvas2d,
      hasSecondRun: !!canvas2dRun2,
    });
    if (deltaPrivate) {
      incognitoComputed.isPrivate = deltaPrivate.isPrivate;
      incognitoComputed.confidence = deltaPrivate.confidence;
      incognitoComputed.signals.push(deltaPrivate.signal);
    }
  }

  // GPU Prediction handling
  const { parameters: gpuParameter } = canvasWebglComputed || {};
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
  };

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
    webgpuComputeHash,
    timingHash,
    proxyHash,
    incognitoHash,
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
    hashify(webgpuComputeComputed),
    hashify(timingComputed),
    hashify(proxyComputed),
    hashify(incognitoComputed),
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
        } = navigatorComputed || {};
        const {
          architecture,
          bitness,
          mobile,
          model,
          platform: uaPlatform,
          platformVersion,
        } = userAgentData || {};
        const { 'any-pointer': anyPointer } = cssMediaComputed?.mediaCSS || {};
        const { colorDepth, pixelDepth, height, width } = screenComputed || {};
        const { location, zone } = timezoneComputed || {};
        const {
          deviceMemory: deviceMemoryWorker,
          hardwareConcurrency: hardwareConcurrencyWorker,
          gpu,
          platform: platformWorker,
          system: systemWorker,
          timezoneLocation: locationWorker,
          userAgentData: userAgentDataWorker,
        } = workerScopeComputed || {};
        const { compressedGPU, confidence } = gpu || {};
        const {
          architecture: architectureWorker,
          bitness: bitnessWorker,
          mobile: mobileWorker,
          model: modelWorker,
          platform: uaPlatformWorker,
          platformVersion: platformVersionWorker,
        } = userAgentDataWorker || {};

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
        ];
      })(),
    ),
  ]).catch((error) => {
    console.error('Hashing error:', error.message);
    return [];
  });

  // Clean up phantom element if created
  if (PARENT_PHANTOM) {
    // @ts-ignore
    PARENT_PHANTOM.parentNode.removeChild(PARENT_PHANTOM);
  }

  // Build the loose fingerprint (full raw data)
  // Each module gets $hash (SHA-256 for exact matching) and $fuzzy (SimHash for similarity)
  const loose = {
    workerScope: !workerScopeComputed
      ? undefined
      : {
          ...workerScopeComputed,
          $hash: workerHash,
          $fuzzy: simhashify(workerScopeComputed),
        },
    navigator: !navigatorComputed
      ? undefined
      : {
          ...navigatorComputed,
          $hash: navigatorHash,
          $fuzzy: simhashify(navigatorComputed),
        },
    windowFeatures: !windowFeaturesComputed
      ? undefined
      : {
          ...windowFeaturesComputed,
          $hash: windowHash,
          $fuzzy: simhashify(windowFeaturesComputed),
        },
    headless: !headlessComputed
      ? undefined
      : {
          ...headlessComputed,
          $hash: headlessHash,
          $fuzzy: simhashify(headlessComputed),
        },
    htmlElementVersion: !htmlElementVersionComputed
      ? undefined
      : {
          ...htmlElementVersionComputed,
          $hash: htmlHash,
          $fuzzy: simhashify(htmlElementVersionComputed),
        },
    cssMedia: !cssMediaComputed
      ? undefined
      : {
          ...cssMediaComputed,
          $hash: cssMediaHash,
          $fuzzy: simhashify(cssMediaComputed),
        },
    css: !cssComputed
      ? undefined
      : { ...cssComputed, $hash: cssHash, $fuzzy: simhashify(cssComputed) },
    screen: !screenComputed
      ? undefined
      : {
          ...screenComputed,
          $hash: screenHash,
          $fuzzy: simhashify(screenComputed),
        },
    voices: !voicesComputed
      ? undefined
      : {
          ...voicesComputed,
          $hash: voicesHash,
          $fuzzy: simhashify(voicesComputed),
        },
    media: !mediaComputed
      ? undefined
      : {
          ...mediaComputed,
          $hash: mediaHash,
          $fuzzy: simhashify(mediaComputed),
        },
    canvas2d: !canvas2dComputed
      ? undefined
      : {
          ...canvas2dComputed,
          emojiSet: {
            $simhash: simhashify(canvas2dComputed.emojiSet),
            $len: canvas2dComputed.emojiSet.length,
          },
          $hash: canvas2dHash,
          $fuzzy: simhashify(canvas2dComputed),
        },
    canvasWebgl: !canvasWebglComputed
      ? undefined
      : {
          ...canvasWebglComputed,
          pixels: pixelsHash,
          pixels2: pixels2Hash,
          $hash: canvasWebglHash,
          $fuzzy: simhashify(canvasWebglComputed),
        },
    maths: !mathsComputed
      ? undefined
      : {
          ...mathsComputed,
          $hash: mathsHash,
          $fuzzy: simhashify(mathsComputed),
        },
    consoleErrors: !consoleErrorsComputed
      ? undefined
      : {
          ...consoleErrorsComputed,
          $hash: consoleErrorsHash,
          $fuzzy: simhashify(consoleErrorsComputed),
        },
    timezone: !timezoneComputed
      ? undefined
      : {
          ...timezoneComputed,
          $hash: timezoneHash,
          $fuzzy: simhashify(timezoneComputed),
        },
    clientRects: !clientRectsComputed
      ? undefined
      : {
          ...clientRectsComputed,
          elementClientRects: {
            $simhash: simhashify(clientRectsComputed.elementClientRects),
            $len: clientRectsComputed.elementClientRects.length,
          },
          elementBoundingClientRect: {
            $simhash: simhashify(clientRectsComputed.elementBoundingClientRect),
            $len: clientRectsComputed.elementBoundingClientRect.length,
          },
          rangeClientRects: {
            $simhash: simhashify(clientRectsComputed.rangeClientRects),
            $len: clientRectsComputed.rangeClientRects.length,
          },
          rangeBoundingClientRect: {
            $simhash: simhashify(clientRectsComputed.rangeBoundingClientRect),
            $len: clientRectsComputed.rangeBoundingClientRect.length,
          },
          $hash: rectsHash,
          $fuzzy: simhashify(clientRectsComputed),
        },
    offlineAudioContext: !offlineAudioContextComputed
      ? undefined
      : {
          ...offlineAudioContextComputed,
          binsSample: {
            $simhash: simhashify(offlineAudioContextComputed.binsSample),
            $len: offlineAudioContextComputed.binsSample.length,
          },
          copySample: {
            $simhash: simhashify(offlineAudioContextComputed.copySample),
            $len: offlineAudioContextComputed.copySample.length,
          },
          $hash: audioHash,
          $fuzzy: simhashify(offlineAudioContextComputed),
        },
    fonts: !fontsComputed
      ? undefined
      : {
          ...fontsComputed,
          $hash: fontsHash,
          $fuzzy: simhashify(fontsComputed),
        },
    lies: !liesComputed
      ? undefined
      : { ...liesComputed, $hash: liesHash, $fuzzy: simhashify(liesComputed) },
    trash: !trashComputed
      ? undefined
      : {
          ...trashComputed,
          $hash: trashHash,
          $fuzzy: simhashify(trashComputed),
        },
    capturedErrors: !capturedErrorsComputed
      ? undefined
      : {
          ...capturedErrorsComputed,
          $hash: errorsHash,
          $fuzzy: simhashify(capturedErrorsComputed),
        },
    svg: !svgComputed
      ? undefined
      : { ...svgComputed, $hash: svgHash, $fuzzy: simhashify(svgComputed) },
    resistance: !resistanceComputed
      ? undefined
      : {
          ...resistanceComputed,
          $hash: resistanceHash,
          $fuzzy: simhashify(resistanceComputed),
        },
    intl: !intlComputed
      ? undefined
      : { ...intlComputed, $hash: intlHash, $fuzzy: simhashify(intlComputed) },
    features: !featuresComputed
      ? undefined
      : {
          ...featuresComputed,
          $hash: featuresHash,
          $fuzzy: simhashify(featuresComputed),
        },
    webrtc: !webrtcComputed
      ? undefined
      : {
          ...webrtcComputed,
          $hash: webrtcHash,
          $fuzzy: simhashify(webrtcComputed),
        },
    webgpuCompute: !webgpuComputeComputed
      ? undefined
      : {
          ...webgpuComputeComputed,
          $hash: webgpuComputeHash,
          $fuzzy: simhashify(webgpuComputeComputed),
        },
    timing: !timingComputed
      ? undefined
      : {
          ...timingComputed,
          $hash: timingHash,
          $fuzzy: simhashify(timingComputed),
        },
    proxy: !proxyComputed
      ? undefined
      : {
          ...proxyComputed,
          $hash: proxyHash,
          $fuzzy: simhashify(proxyComputed),
        },
    incognito: !incognitoComputed
      ? undefined
      : {
          ...incognitoComputed,
          $hash: incognitoHash,
          $fuzzy: simhashify(incognitoComputed),
        },
  };

  // Build the stable fingerprint (filtered/hardened for production)
  /** Suppresses a property value when locale entropy signals are untrustworthy. */
  const hardenEntropy = (workerScope: any, prop: any) => {
    return !workerScope
      ? prop
      : workerScope.localeEntropyIsTrusty &&
          workerScope.localeIntlEntropyIsTrusty
        ? prop
        : undefined;
  };

  const privacyResistFingerprinting =
    resistanceComputed &&
    /^(tor browser|firefox)$/i.test(resistanceComputed.privacy);

  /** Returns GPU renderer/vendor only when confidence is not low. */
  const hardenGPU = (canvasWebgl: any) => {
    const {
      gpu: { confidence, compressedGPU },
    } = canvasWebgl;
    return confidence == 'low'
      ? {}
      : {
          UNMASKED_RENDERER_WEBGL: compressedGPU,
          UNMASKED_VENDOR_WEBGL: canvasWebgl.parameters.UNMASKED_VENDOR_WEBGL,
        };
  };

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
            height: screenStable.height,
            width: screenStable.width,
            pixelDepth: screenStable.pixelDepth,
            colorDepth: screenStable.colorDepth,
            lied: screenStable.lied,
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
              ? hardenEntropy(
                  workerScopeComputed,
                  workerScopeComputed.timezoneLocation,
                )
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
    media: mediaStable,
    canvas2d: ((canvas2d) => {
      if (!canvas2d) {
        return;
      }
      const { lied, liedTextMetrics } = canvas2dComputed || {};
      let data: any;
      if (!lied) {
        const { dataURI, paintURI, textURI, emojiURI } = canvas2d;
        data = {
          lied,
          ...{ dataURI, paintURI, textURI, emojiURI },
        };
      }
      if (!liedTextMetrics) {
        const { textMetricsSystemSum, emojiSet } = canvas2d;
        data = {
          ...(data || {}),
          ...{ textMetricsSystemSum, emojiSet },
        };
      }
      return data;
    })(canvas2dStable),
    canvasWebgl:
      !canvasWebglComputed || canvasWebglComputed.lied || LowerEntropy.WEBGL
        ? undefined
        : braveFingerprintingBlocking
          ? {
              parameters: {
                ...getBraveUnprotectedParameters(
                  (canvasWebglStable || {}).parameters,
                ),
                ...hardenGPU(canvasWebglComputed),
              },
            }
          : {
              ...((gl, canvas2d) => {
                if ((canvas2d && canvas2d.lied) || LowerEntropy.CANVAS) {
                  const { extensions, gpu, lied, parameterOrExtensionLie } = gl;
                  return {
                    extensions,
                    gpu,
                    lied,
                    parameterOrExtensionLie,
                  };
                }
                return gl;
              })(canvasWebglStable, canvas2dComputed),
              parameters: {
                ...(canvasWebglStable || {}).parameters,
                ...hardenGPU(canvasWebglComputed),
              },
            },
    cssMedia: !cssMediaComputed
      ? undefined
      : {
          reducedMotion: caniuse(
            () => (cssMediaStable.mediaCSS || {})['prefers-reduced-motion'],
          ),
          colorScheme: braveFingerprintingBlocking
            ? undefined
            : caniuse(
                () => (cssMediaStable.mediaCSS || {})['prefers-color-scheme'],
              ),
          monochrome: caniuse(() => (cssMediaStable.mediaCSS || {}).monochrome),
          invertedColors: caniuse(
            () => (cssMediaStable.mediaCSS || {})['inverted-colors'],
          ),
          forcedColors: caniuse(
            () => (cssMediaStable.mediaCSS || {})['forced-colors'],
          ),
          anyHover: caniuse(() => (cssMediaStable.mediaCSS || {})['any-hover']),
          hover: caniuse(() => (cssMediaStable.mediaCSS || {}).hover),
          anyPointer: caniuse(
            () => (cssMediaStable.mediaCSS || {})['any-pointer'],
          ),
          pointer: caniuse(() => (cssMediaStable.mediaCSS || {}).pointer),
          colorGamut: caniuse(
            () => (cssMediaStable.mediaCSS || {})['color-gamut'],
          ),
          screenQuery:
            privacyResistFingerprinting ||
            LowerEntropy.SCREEN ||
            LowerEntropy.IFRAME_SCREEN
              ? undefined
              : hardenEntropy(
                  workerScopeComputed,
                  caniuse(() => cssMediaStable.screenQuery),
                ),
        },
    css: !cssComputed ? undefined : ((cssStable || {}).system || {}).fonts,
    timezone:
      !timezoneComputed || timezoneComputed.lied || LowerEntropy.TIME_ZONE
        ? undefined
        : {
            location: timezoneStable.location,
            offset: timezoneStable.offset,
            offsetComputed: timezoneStable.offsetComputed,
            lied: timezoneStable.lied,
          },
    offlineAudioContext: !offlineAudioContextComputed
      ? undefined
      : offlineAudioContextComputed.lied || LowerEntropy.AUDIO
        ? undefined
        : offlineAudioContextStable,
    fonts:
      !fontsComputed || fontsComputed.lied || LowerEntropy.FONTS
        ? undefined
        : (fontsStable || {}).fontFaceLoadFonts,
    forceRenew: 1737085481442,
  };

  // Calculate hashes
  const [looseHash, stableHash] = await Promise.all([
    hashify(loose),
    hashify(stable),
  ]).catch(() => ['', '']);

  const fuzzyHash = await getFuzzyHash(loose, deltaReport).catch(() => '');

  // Analyze internal inconsistencies across signals
  const inconsistencies = analyzeInconsistencies(loose);

  // Get bot signals
  const { botHash, badBot } = getBotHash(loose, {
    getFeaturesLie,
    computeWindowsRelease,
  });
  const { totalLies } = liesComputed || {};
  const { stealth } = headlessComputed || {};

  const botSignals: BotSignals = {
    botHash,
    badBot,
    isHeadless: !!(
      headlessComputed?.headless &&
      Object.values(headlessComputed.headless).some(Boolean)
    ),
    hasLies: !!(liesComputed && liesComputed.totalLies > 0),
    lieCount: totalLies || 0,
    stealthSignals: stealth || {},
    likelyResidentialProxy: proxyComputed?.likelyResidentialProxy || false,
    engineMismatch: consoleErrorsComputed?.engineMismatch || false,
    isPrivate: incognitoComputed?.isPrivate || false,
  };

  const timeEnd = startTime();

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
    deltaReport,
    meta: {
      timestamp: Date.now(),
      durationMs: timeEnd,
      version: '1.0.0',
    },
  };
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
};

// Export utilities
export { hashify, hashMini, getBotHash, getFuzzyHash } from './utils/crypto';
