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
  getMathML,
  getAdBlock,
  // Utilities
  hashify,
  hashMini,
  getBotHash,
  getFuzzyHash,
} from './fingerprint';

// Default export for convenience
export { collectFingerprint as default } from './fingerprint';

// Crypto ID - persistent ECDSA key pair for device identity
export {
  getCryptoId,
  signWithCryptoId,
  resetCryptoIdMemo,
  clearStoredKeys,
  type CryptoKeys,
} from './utils/get-crypto-id';

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
} from './utils/evercookie';

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
} from './utils/favicon-cache';

// Sigint integration - server-side fingerprinting (JA3/JA4, TCP RTT, H2, STUN, Favicon Cache)
export {
  collectSigintData,
  fetchTlsFingerprint,
  fetchTcpProbe,
  fetchH2Probe,
  performStunBinding,
  parseSigintConfigFromUrl,
  getTlsFingerprintEndpoint,
  getTcpProbeEndpoint,
  getH2ProbeEndpoint,
  getStunServerUri,
  getFaviconCacheEndpoint,
  getFaviconCacheConfig,
  getProxyScore,
  getTlsHash,
  getThirdPartyCookieId,
  getFaviconCacheDeviceId,
  getH2Fingerprint,
  type SigintConfig,
  type SigintData,
  type TlsFingerprintResponse,
  type TcpProbeResponse,
  type H2ProbeResponse,
  type TcpInfo,
  type RttFingerprint,
  type Http2Fingerprint,
  type H2PriorityFrame,
  type ClientHints,
  type StunResult,
  type ProbeTokenResponse,
} from './utils/sigint';

// Telemetry - API submission and match results
export {
  submitTelemetry,
  fetchSessionResult,
  getMatchTierLabel,
  type TelemetryConfig,
  type TelemetrySubmission,
  type TelemetryResult,
} from './telemetry';

// WebRTC STUN configuration
export {
  setCustomStunServers,
  clearCustomStunServers,
  getStunServers,
} from './webrtc/constants';

// ============================================================================
// Unified load() function for lite loader compatibility
// ============================================================================

// Capture script-tag query params at parse time (document.currentScript is
// only available during synchronous execution of the <script> element).
const _scriptParams: Record<string, string> = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    if (!src) return {};
    const params = new URL(src).searchParams;
    const out: Record<string, string> = {};
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
})();

import { collectFingerprint as _collectFingerprint } from './fingerprint';
import {
  collectSigintData as _collectSigintData,
  getStunServerUri as _getStunServerUri,
  type SigintConfig,
} from './utils/sigint';
import { setCustomStunServers as _setCustomStunServers } from './webrtc/constants';
import { getEvercookieId as _getEvercookieId } from './utils/evercookie';
import { getCryptoId as _getCryptoId } from './utils/get-crypto-id';
import {
  submitTelemetry as _submitTelemetry,
  fetchSessionResult,
  type TelemetryConfig,
  type TelemetryResult,
} from './telemetry';
import { runArgusVm, prefetchArgusVm } from './vm/argus-vm';
import { detectApiBaseFromHostname } from './telemetry/helpers';

export interface LoadOptions {
  enableSigint?: boolean;
  sigint?: Partial<SigintConfig>;
  /** Enable auto-submission to API after collection */
  enableTelemetry?: boolean;
  /** Telemetry configuration */
  telemetry?: Partial<TelemetryConfig>;
  /** Arbitrary key-value metadata forwarded into the telemetry payload */
  metadata?: Record<string, string>;
  /** Session ID — forwarded to telemetry if provided */
  sessionId?: string;
}

export interface LoadResult {
  fingerprint: Awaited<ReturnType<typeof _collectFingerprint>>;
  sigint?: Awaited<ReturnType<typeof _collectSigintData>>;
  evercookie?: {
    id: string;
    created: string;
    lastSeen: string;
    recoveredFrom?: string;
  };
  cryptoId?: { publicKey: string; date: string };
  telemetry?: TelemetryResult;
  /** Session ID returned by /v1/collect after successful VM submission */
  sessionId?: string;
  timing: { start: number; end: number; duration: number };
}

/**
 * Normalize a raw session-id param to a URL-safe value.
 * Converts standard base64 → base64url (replace +→-, /→_, strip =)
 * so the value passes the API's /^[\w-]+$/ path-parameter validation.
 */
function parseSessionIdParam(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Unified load function - collects fingerprint, sigint data, and optionally submits telemetry.
 * Used by the lite loader to run fingerprinting inside an iframe.
 */
export async function load(opts: LoadOptions = {}): Promise<LoadResult> {
  const start = performance.now();

  // Configure STUN servers if sigint is enabled
  if (opts.enableSigint && opts.sigint?.baseDomain) {
    const stunUri = _getStunServerUri(opts.sigint as SigintConfig);
    _setCustomStunServers([stunUri]);
  }

  const useVm = opts.enableTelemetry && !!opts.telemetry?.baseDomain;
  const apiBase = useVm
    ? detectApiBaseFromHostname(opts.telemetry!.baseDomain)
    : '';

  // Kick off handshake + bytecode load as early as possible so they overlap
  // with fingerprint collection rather than running after it.
  if (useVm) prefetchArgusVm(apiBase);

  // Run fingerprint, evercookie, and cryptoId in parallel.
  // Sigint is handled inside the VM; the fallback path collects it explicitly.
  const [fingerprint, evercookieData, cryptoIdData] = await Promise.all([
    _collectFingerprint(),
    _getEvercookieId(),
    _getCryptoId(),
  ]);

  const evercookie = evercookieData
    ? {
        id: evercookieData.id,
        created: evercookieData.created,
        lastSeen: evercookieData.lastSeen,
        recoveredFrom: evercookieData.recoveredFrom,
      }
    : undefined;

  const cryptoId = cryptoIdData
    ? {
        publicKey: cryptoIdData.publicKey,
        date: cryptoIdData.date,
      }
    : undefined;

  let sigint: Awaited<ReturnType<typeof _collectSigintData>> | undefined;
  let telemetryResult: TelemetryResult | undefined;
  let sessionId: string | undefined;

  if (useVm) {
    // VM path: handshake → bot detection + sigint probes + ECDH encrypt + POST /v1/collect
    // The handshake fetches the server pubkey from /v1/handshake internally.
    // Falls back gracefully (empty sessionId) if handshake or VM fails.
    const sigintConfig = opts.enableSigint
      ? (opts.sigint as SigintConfig)
      : undefined;
    const vmResult = await runArgusVm(
      fingerprint,
      apiBase,
      sigintConfig,
      evercookieData,
      cryptoIdData,
    );
    sessionId = vmResult.sessionId || undefined;
    telemetryResult = {
      sessionId: vmResult.sessionId,
      submitted: !!vmResult.sessionId,
      timing: { submitMs: 0, totalMs: 0 },
    };
  } else if (opts.enableTelemetry && opts.telemetry?.baseDomain) {
    // Fallback: collect sigint explicitly, then submit via plaintext JSON
    sigint = opts.enableSigint
      ? await _collectSigintData(opts.sigint as SigintConfig)
      : undefined;

    // Merge script-tag query params with any explicitly passed metadata,
    // filtering out reserved keys that have dedicated handling
    const RESERVED_SCRIPT_PARAMS = new Set([
      'session-id',
      'sessionId',
      'version',
      'src',
      'autorun',
      'endpoint',
      'variant',
      'timeout',
      'enableSigint',
      'sigintDomain',
      'sigintStage',
      'enableStun',
    ]);

    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(_scriptParams)) {
      if (!RESERVED_SCRIPT_PARAMS.has(k)) {
        merged[k] = v;
      }
    }
    if (opts.metadata) {
      for (const [k, v] of Object.entries(opts.metadata)) {
        merged[k] = v;
      }
    }
    const metadata = Object.keys(merged).length > 0 ? merged : undefined;

    const explicitSessionId =
      opts.sessionId ||
      parseSessionIdParam(
        _scriptParams['session-id'] || _scriptParams['sessionId'],
      );

    telemetryResult = await _submitTelemetry(
      {
        fingerprint,
        sigint,
        evercookie: evercookieData,
        cryptoId: cryptoIdData,
        metadata,
        sessionId: explicitSessionId,
      },
      opts.telemetry as TelemetryConfig,
    );
    sessionId = telemetryResult.sessionId || undefined;
  } else if (opts.enableSigint) {
    sigint = await _collectSigintData(opts.sigint as SigintConfig);
  }

  // Poll GET /v1/session/{sessionId} to retrieve the match result (device_id, tier, confidence).
  // The matching pipeline is async (SQS → matching-worker), so we poll until complete or timeout.
  if (sessionId && apiBase && telemetryResult?.submitted) {
    const sessionResult = await fetchSessionResult(sessionId, apiBase);
    if (sessionResult && telemetryResult) {
      telemetryResult.matchResult = sessionResult.matchResult;
      telemetryResult.apiResponse = sessionResult.apiResponse;
    }
  }

  const end = performance.now();

  return {
    fingerprint,
    sigint,
    evercookie,
    cryptoId,
    telemetry: telemetryResult,
    sessionId,
    timing: { start, end, duration: end - start },
  };
}
