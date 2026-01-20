import { isFontOSBad } from '../fonts';
import { WORKER_TYPE } from '../worker';
import { getReportedPlatform } from './helpers';

// https://stackoverflow.com/a/22429679
const hashMini = (x) => {
  const json = `${JSON.stringify(x)}`;
  const hash = json.split('').reduce((hash, char, i) => {
    return (Math.imul(31, hash) + json.charCodeAt(i)) | 0;
  }, 0x811c9dc5);
  return ('0000000' + (hash >>> 0).toString(16)).substr(-8);
};

// instance id
const instanceId =
  String.fromCharCode(Math.random() * 26 + 97) +
  Math.random().toString(36).slice(-7);

// https://stackoverflow.com/a/53490958
// https://stackoverflow.com/a/43383990
// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
const hashify = (x, algorithm = 'SHA-256') => {
  const json = `${JSON.stringify(x)}`;

  // Fallback for non-secure contexts (HTTP) where crypto.subtle is unavailable
  if (!crypto.subtle) {
    // Use hashMini as fallback - less secure but functional for testing
    return Promise.resolve(hashMini(x).padEnd(64, '0'));
  }

  const jsonBuffer = new TextEncoder().encode(json);
  return crypto.subtle.digest(algorithm, jsonBuffer).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => ('00' + b.toString(16)).slice(-2))
      .join('');
    return hashHex;
  });
};

async function cipher(data: any): Promise<string[]> {
  // Fallback for non-secure contexts (HTTP) where crypto.subtle is unavailable
  if (!crypto.subtle) {
    // Return dummy values - cipher isn't used in core fingerprinting
    const fallback = btoa(JSON.stringify(data));
    return [fallback, 'no-iv', 'no-key'];
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const json = JSON.stringify(data);
  const encoded = new TextEncoder().encode(json);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  const message = btoa(
    String.fromCharCode.apply(
      null,
      new Uint8Array(ciphertext) as unknown as number[],
    ),
  );
  const vector = btoa(
    String.fromCharCode.apply(null, iv as unknown as number[]),
  );
  const { k: keyData } = await crypto.subtle.exportKey('jwk', key);

  return [message, vector, keyData!];
}

const getBotHash = (fp, imports) => {
  const { getFeaturesLie, computeWindowsRelease } = imports;
  const outsideFeaturesVersion = getFeaturesLie(fp);
  const workerScopeIsBlocked =
    !fp.workerScope ||
    !fp.workerScope.userAgent ||
    // only accept shared and service types
    // device emulators can easily spoof dedicated scope
    WORKER_TYPE == 'dedicated';
  const liedWorkerScope = !!(fp.workerScope && fp.workerScope.lied);
  let liedPlatformVersion = false;
  if (fp.workerScope && fp.fonts) {
    const { platformVersion, platform } = fp.workerScope.userAgentData || {};
    const { platformVersion: fontPlatformVersion } = fp.fonts || {};
    const windowsRelease = computeWindowsRelease({
      platform,
      platformVersion,
      fontPlatformVersion,
    });

    const windowsPlatformVersionLie =
      windowsRelease &&
      fontPlatformVersion &&
      !('' + windowsRelease).includes(fontPlatformVersion);
    // use font platform (window scope) to detect userAgent (worker scope) lies
    const macOrWindowsPlatformVersionLie =
      /macOS|Windows/.test(fontPlatformVersion) &&
      platform &&
      !fontPlatformVersion.includes(platform);
    liedPlatformVersion =
      windowsPlatformVersionLie || macOrWindowsPlatformVersionLie;
  }

  const { totalLies } = fp.lies || {};
  const { fontFaceLoadFonts } = fp.fonts || {};
  const { userAgent } = fp.workerScope || {};
  const { stealth } = fp.headless || {};
  const [workerUserAgentOS] = userAgent ? getReportedPlatform(userAgent) : [];
  const maxLieCount = 100;
  const extremeLieCount =
    isFontOSBad(workerUserAgentOS, fontFaceLoadFonts) ||
    (totalLies || 0) > maxLieCount ||
    Object.values(stealth || {}).some((x) => x === true); // stealth lies are severe
  const functionToStringHasProxy =
    !!(stealth || {})['Function.prototype.toString has invalid TypeError'] ||
    !!(stealth || {})['Function.prototype.toString leaks Proxy behavior'];

  // Pattern conditions that warrant rejection
  const botPatterns = {
    // custom order is important
    liedWorkerScope, // lws
    liedPlatformVersion, // lpv
    functionToStringHasProxy, // ftp
    outsideFeaturesVersion, // ofv
    extremeLieCount, // elc
    excessiveLooseFingerprints: false, // elf (compute on server)
    workerScopeIsBlocked, // wsb
    crowdBlendingScoreIsLow: false, // csl
  };

  const botHash = Object.keys(botPatterns)
    .map((key) => (botPatterns[key] ? '1' : '0'))
    .join('');
  return {
    botHash,
    badBot: Object.keys(botPatterns).find((key) => botPatterns[key]),
  };
};

/**
 * SimHash - Locality Sensitive Hash for fingerprint similarity matching
 *
 * Unlike cryptographic hashes (SHA-256), SimHash preserves locality:
 * similar inputs produce similar outputs, enabling similarity comparison
 * via Hamming distance.
 *
 * Algorithm:
 * 1. Each feature contributes a weighted vote to each bit position
 * 2. Feature value is hashed to determine vote direction (+/- weight)
 * 3. Final bit = 1 if cumulative vote > 0, else 0
 *
 * Interpretation:
 * - Hamming distance 0-3: Very likely same device
 * - Hamming distance 4-8: Possibly same device (browser update, config change)
 * - Hamming distance 9+: Likely different devices
 *
 * Feature weights derived from empirical analysis of fingerprint stability
 * and discriminative power across device types.
 */

// Feature weights based on empirical analysis:
// Score = (within-group consistency) * (between-group discrimination) * sqrt(entropy)
// Higher weight = more stable within same device, more discriminating between devices
const SIMHASH_FEATURE_WEIGHTS: Record<string, number> = {
  // TIER 1 (weight=8): Highly stable and discriminating
  'workerScope.userAgentVersion': 8,
  'canvas2d.paintCpuURI': 8,
  'clientRects.domrectSystemSum': 8,
  'fonts.pixelSizeSystemSum': 8,
  'canvas2d.textURI': 8,
  'windowFeatures.keys': 8,
  'navigator.userAgentParsed': 8,
  'navigator.properties': 8,
  'htmlElementVersion.keys': 8,
  'css.computedStyle': 8,
  'css.system': 8,
  'canvas2d.dataURI': 8,
  'canvas2d.paintURI': 8,
  'cssMedia.mediaCSS': 8,
  'canvas2d.emojiURI': 8,
  'canvasWebgl.extensions': 8,
  'cssMedia.matchMediaCSS': 8,
  'navigator.globalPrivacyControl': 8,
  'workerScope.userAgentData': 8,
  'workerScope.userAgentDataVersion': 8,
  'headless.likeHeadless': 8,
  'headless.likeHeadlessRating': 8,
  'workerScope.webglRenderer': 8,
  'navigator.oscpu': 8,
  'canvas2d.textMetricsSystemSum': 8,
  'svg.svgrectSystemSum': 8,
  'svg.bBox': 8,
  'workerScope.webglVendor': 8,
  'fonts.emojiSet': 8,
  'svg.emojiSet': 8,
  'clientRects.emojiSet': 8,
  'svg.extentOfChar': 8,
  'svg.subStringLength': 8,
  'svg.computedTextLength': 8,
  'navigator.permissions': 8,
  'media.mimeTypes': 8,
  'canvas2d.mods': 8,
  'maths.data': 8,
  'canvas2d.emojiSet': 8,
  'navigator.doNotTrack': 8,
  'consoleErrors.errors': 8,
  'screen.availHeight': 8,
  'cssMedia.screenQuery': 8,
  'screen.width': 8,
  'screen.height': 8,
  'screen.availWidth': 8,
  'canvasWebgl.dataURI': 8,
  'canvasWebgl.dataURI2': 8,
  'navigator.userAgent': 8,
  'navigator.appVersion': 8,
  'workerScope.userAgent': 8,
  'canvasWebgl.parameters': 8,
  'workerScope.gpu': 8,
  'navigator.userAgentData': 8,

  // TIER 2 (weight=4): Good stability and discrimination
  'workerScope.userAgentEngine': 4,
  'canvasWebgl.gpu': 4,
  'navigator.hardwareConcurrency': 4,
  'navigator.plugins': 4,
  'navigator.vendor': 4,
  'windowFeatures.moz': 4,
  'windowFeatures.webkit': 4,
  'headless.chromium': 4,
  'headless.systemFonts': 4,
  'headless.platformEstimate': 4,
  'offlineAudioContext.compressorGainReduction': 4,
  'offlineAudioContext.floatFrequencyDataSum': 4,
  'offlineAudioContext.floatTimeDomainDataSum': 4,
  'offlineAudioContext.sampleSum': 4,
  'offlineAudioContext.binsSample': 4,
  'offlineAudioContext.copySample': 4,
  'offlineAudioContext.values': 4,
  'resistance.engine': 4,
  'navigator.platform': 4,
  'workerScope.hardwareConcurrency': 4,
  'workerScope.system': 4,
  'workerScope.device': 4,
  'navigator.mimeTypes': 4,
  'workerScope.platform': 4,
  'clientRects.elementClientRects': 4,
  'clientRects.elementBoundingClientRect': 4,
  'clientRects.rangeClientRects': 4,
  'clientRects.rangeBoundingClientRect': 4,
  'fonts.fontFaceLoadFonts': 4,
  'headless.headless': 4,
  'headless.headlessRating': 4,
  'canvasWebgl.pixels': 4,
  'canvasWebgl.pixels2': 4,
  'workerScope.locale': 4,
  'workerScope.timezoneOffset': 4,
  'trash.trashBin': 4,
  'navigator.system': 4,
  'navigator.device': 4,
  'screen.colorDepth': 4,
  'screen.pixelDepth': 4,
  'navigator.language': 4,
  'workerScope.languages': 4,

  // TIER 3 (weight=2): Moderate usefulness
  'headless.stealth': 2,
  'headless.stealthRating': 2,
  'canvasWebgl.parameterOrExtensionLie': 2,
  'navigator.uaPostReduction': 2,
  'resistance.extensionHashPattern': 2,
  'lies.data': 2,
  'lies.totalLies': 2,
  'timezone.location': 2,
  'timezone.offset': 2,
  'timezone.zone': 2,

  // TIER 4 (weight=1): Lower usefulness but still contributory
  'navigator.deviceMemory': 1,
  'workerScope.deviceMemory': 1,
  'navigator.maxTouchPoints': 1,
  'screen.touch': 1,
  'offlineAudioContext.noise': 1,
  'offlineAudioContext.totalUniqueSamples': 1,
};

// 64-bit SimHash implementation
const SIMHASH_BITS = 64;

/**
 * Generate a 64-bit SimHash from fingerprint data.
 * Returns a 16-character hex string.
 */
const getFuzzyHash = async (fp): Promise<string> => {
  // Extract all features from fingerprint
  const features: Record<string, unknown> = {};
  for (const [section, values] of Object.entries(fp)) {
    if (typeof values !== 'object' || values === null) continue;
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (key === '$hash' || key === 'lied') continue;
      features[`${section}.${key}`] = value;
    }
  }

  // Initialize vote accumulator for each bit position
  const votes = new Array(SIMHASH_BITS).fill(0);

  // Process each weighted feature
  for (const [featureKey, weight] of Object.entries(SIMHASH_FEATURE_WEIGHTS)) {
    const value = features[featureKey];
    if (value === undefined || value === null) continue;

    // Hash the feature key+value to get deterministic bit pattern
    const featureString = JSON.stringify({ k: featureKey, v: value });
    const hash = hashMini(featureString);

    // Convert 8-char hex hash to 32 bits, then extend to 64 bits
    // by also hashing with a salt for the upper 32 bits
    const lower32 = parseInt(hash, 16) >>> 0;
    const upper32 = parseInt(hashMini(featureString + ':upper'), 16) >>> 0;

    // Vote on each bit position
    for (let i = 0; i < SIMHASH_BITS; i++) {
      const bitValue = i < 32
        ? (lower32 >>> i) & 1
        : (upper32 >>> (i - 32)) & 1;

      // Add or subtract weight based on bit value
      votes[i] += bitValue ? weight : -weight;
    }
  }

  // Convert votes to binary: positive -> 1, non-positive -> 0
  // Then pack into 64-bit value as hex string
  let result = '';
  for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
    let byte = 0;
    for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
      const voteIdx = byteIdx * 8 + bitIdx;
      if (votes[voteIdx] > 0) {
        byte |= (1 << bitIdx);
      }
    }
    result += ('0' + byte.toString(16)).slice(-2);
  }

  return result;
};

/**
 * Calculate Hamming distance between two SimHash values.
 * Lower distance = more similar fingerprints.
 *
 * @param hash1 - First SimHash (16-char hex string)
 * @param hash2 - Second SimHash (16-char hex string)
 * @returns Number of differing bits (0-64)
 */
const getSimHashDistance = (hash1: string, hash2: string): number => {
  if (hash1.length !== 16 || hash2.length !== 16) {
    throw new Error('SimHash values must be 16-character hex strings');
  }

  let distance = 0;
  for (let i = 0; i < 16; i += 2) {
    const byte1 = parseInt(hash1.slice(i, i + 2), 16);
    const byte2 = parseInt(hash2.slice(i, i + 2), 16);
    const xor = byte1 ^ byte2;
    // Count set bits (popcount)
    distance += popcount8(xor);
  }
  return distance;
};

// 8-bit popcount lookup
const popcount8 = (n: number): number => {
  n = n - ((n >> 1) & 0x55);
  n = (n & 0x33) + ((n >> 2) & 0x33);
  return (n + (n >> 4)) & 0x0f;
};

export {
  hashMini,
  instanceId,
  hashify,
  getBotHash,
  getFuzzyHash,
  getSimHashDistance,
  cipher,
  SIMHASH_FEATURE_WEIGHTS,
};
