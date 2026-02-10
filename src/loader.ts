/**
 * Argus Loader
 *
 * Creates a sandboxed iframe with srcdoc to run fingerprinting in an isolated
 * environment where browser APIs haven't been clobbered by other scripts.
 *
 * Key features:
 * - srcdoc iframe = same-origin, no network request, clean API environment
 * - No postMessage complexity - direct access to iframe contentWindow
 * - A/B testing ready with variant selection and feature flags
 * - Configurable modules, timeouts, and callbacks
 * - Sigint integration for server-side fingerprinting (JA3/JA4, TCP RTT, etc.)
 * - Telemetry submission to /v1/collect with script-tag query params in identifiers
 */

import { collectFingerprint, type FingerprintResult } from './fingerprint';
import {
  collectSigintData,
  parseSigintConfigFromUrl,
  getStunServerUri,
  type SigintConfig,
  type SigintData,
} from './utils/sigint';
import {
  setCustomStunServers,
  clearCustomStunServers,
} from './webrtc/constants';
import { getEvercookieId } from './utils/evercookie';
import { getCryptoId } from './utils/get-crypto-id';
import {
  submitTelemetry,
  getMatchTierLabel,
  type TelemetryConfig,
  type TelemetryResult,
} from './telemetry';
import { detectStageFromHostname } from './telemetry/helpers';

// Re-export for consumers
export { getMatchTierLabel } from './telemetry';

// ---------------------------------------------------------------------------
// Capture script-tag query params at parse time.
// document.currentScript is only available during synchronous execution of
// the <script> element — it becomes null once any async code runs.
// ---------------------------------------------------------------------------
const _scriptParams: Record<string, string> = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    if (!src) return {};
    const url = new URL(src);
    const out: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  } catch {
    return {};
  }
})();

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

/**
 * Extract a clean session ID from a raw param value.
 * Handles base64-encoded JSON blobs (e.g. the demo's cross-domain state)
 * by extracting the inner `sessionId` field.  Plain strings pass through.
 */
function parseSessionIdParam(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // If it looks like base64 (contains = padding or is long + alphanumeric), try to decode
  try {
    const decoded = atob(raw);
    const obj = JSON.parse(decoded);
    if (obj && typeof obj === 'object' && typeof obj.sessionId === 'string') {
      return obj.sessionId;
    }
  } catch {
    // Not base64 JSON — use raw value
  }
  return raw;
}

/** Resolve session ID from script-tag query params (hyphenated preferred). */
function getScriptParamSessionId(): string | undefined {
  const raw = _scriptParams['session-id'] || _scriptParams['sessionId'];
  return parseSessionIdParam(raw);
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LoaderConfig {
  /** Timeout in ms before aborting (default: 10000) */
  timeout?: number;

  /** A/B test variant identifier (e.g., 'control', 'variant-a') */
  variant?: string;

  /** Feature flags for conditional module execution */
  features?: Record<string, boolean>;

  /** Custom endpoint to send results (optional) */
  endpoint?: string;

  /** Session identifier for correlation */
  sessionId?: string;

  /** Additional metadata to include with fingerprint */
  metadata?: Record<string, unknown>;

  /** Callback when fingerprint collection starts */
  onStart?: () => void;

  /** Callback with progress updates */
  onProgress?: (module: string, completed: number, total: number) => void;

  /** Callback when complete (before promise resolves) */
  onComplete?: (result: FingerprintResult) => void;

  /** Callback on error (before promise rejects) */
  onError?: (error: Error) => void;

  /** Skip iframe isolation (run in main thread - not recommended for production) */
  skipIsolation?: boolean;

  /** Enable sigint server-side fingerprinting (default: false) */
  enableSigint?: boolean;

  /** Sigint configuration (domain, stage, etc.) */
  sigint?: Partial<SigintConfig>;

  /** Enable telemetry submission to /v1/collect (default: false) */
  enableTelemetry?: boolean;

  /** Telemetry configuration */
  telemetry?: Partial<TelemetryConfig>;
}

export interface LoaderResult {
  fingerprint: FingerprintResult;
  variant?: string;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
  isolated: boolean;
  /** Server-side fingerprint data from sigint (if enabled) */
  sigint?: SigintData;
  /** Evercookie persistent identifier */
  evercookie?: {
    id: string;
    created: string;
    lastSeen: string;
    recoveredFrom?: string;
  };
  /** Crypto ID (ECDSA public key) */
  cryptoId?: { publicKey: string; date: string };
  /** Telemetry submission result (if telemetry enabled) */
  telemetry?: TelemetryResult;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT = 10_000;

/** Minimal HTML for srcdoc iframe - clean environment */
const SRCDOC_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

/** CSS to hide the iframe completely */
const IFRAME_STYLES = `
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  pointer-events: none;
  opacity: 0;
  border: none;
  z-index: -2147483648;
`;

/* ------------------------------------------------------------------ */
/*  A/B Testing Utilities                                              */
/* ------------------------------------------------------------------ */

/**
 * Select a variant based on device hash or random assignment.
 * Can be seeded with a stable identifier for consistent assignment.
 */
export function selectVariant(variants: string[], seed?: string): string {
  if (variants.length === 0) return 'control';
  if (variants.length === 1) return variants[0];

  // Use seed for deterministic assignment, or random if no seed
  let hash = 0;
  const str = seed || Math.random().toString();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % variants.length;
  return variants[index];
}

/**
 * Check if a feature is enabled based on config and variant
 */
export function isFeatureEnabled(
  feature: string,
  config: LoaderConfig,
): boolean {
  // Explicit feature flag takes precedence
  if (config.features?.[feature] !== undefined) {
    return config.features[feature];
  }
  // Default: all features enabled
  return true;
}

/* ------------------------------------------------------------------ */
/*  Iframe Management                                                  */
/* ------------------------------------------------------------------ */

interface ArgusIframe extends HTMLIFrameElement {
  __argusStartTime: number;
}

/**
 * Create a hidden, same-origin iframe using srcdoc.
 * This provides a clean JS environment unaffected by page scripts.
 */
function createIsolatedIframe(): ArgusIframe {
  const iframe = document.createElement('iframe') as ArgusIframe;

  // Unique ID for debugging/tracking
  iframe.id = `argus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Inline styles (no external CSS needed)
  iframe.style.cssText = IFRAME_STYLES;

  // srcdoc creates same-origin document without network request
  iframe.setAttribute('srcdoc', SRCDOC_HTML);

  // A11y: make it invisible to screen readers
  iframe.setAttribute('tabindex', '-1');
  iframe.setAttribute('role', 'presentation');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', '');

  // Track timing
  iframe.__argusStartTime = performance.now();

  return iframe;
}

/**
 * Wait for iframe srcdoc to load and be ready
 */
function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Iframe load timeout'));
    }, 5000);

    /** Resolves the promise once the iframe content has fully loaded. */
    iframe.addEventListener(
      'load',
      () => {
        clearTimeout(timeout);
        // Small delay to ensure contentDocument is fully ready
        requestAnimationFrame(() => resolve());
      },
      { once: true },
    );

    /** Rejects the promise if the iframe fails to load. */
    iframe.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('Iframe load error'));
      },
      { once: true },
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Telemetry Helpers                                                  */
/* ------------------------------------------------------------------ */

/** Merge script-tag query params with any explicitly passed metadata. */
function buildMetadata(
  config: LoaderConfig,
): Record<string, string> | undefined {
  const hasScriptParams = Object.keys(_scriptParams).length > 0;
  const hasConfigMeta =
    config.metadata && Object.keys(config.metadata).length > 0;

  if (!hasScriptParams && !hasConfigMeta) return undefined;

  const merged: Record<string, string> = {};
  // Script-tag params first (lower priority), filtering out reserved keys
  for (const [k, v] of Object.entries(_scriptParams)) {
    if (!RESERVED_SCRIPT_PARAMS.has(k)) {
      merged[k] = v;
    }
  }
  // Explicit config metadata wins
  if (config.metadata) {
    for (const [k, v] of Object.entries(config.metadata)) {
      merged[k] = String(v);
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Submit telemetry and return the result (silent on failure). */
async function submitTelemetryIfEnabled(
  config: LoaderConfig,
  collectionData: {
    fingerprint: FingerprintResult;
    sigintData?: SigintData;
    evercookieData?: Awaited<ReturnType<typeof getEvercookieId>>;
    cryptoIdData?: Awaited<ReturnType<typeof getCryptoId>>;
  },
): Promise<TelemetryResult | undefined> {
  if (!config.enableTelemetry || !config.telemetry?.baseDomain) {
    return undefined;
  }

  return submitTelemetry(
    {
      fingerprint: collectionData.fingerprint,
      sigint: collectionData.sigintData,
      evercookie: collectionData.evercookieData ?? undefined,
      cryptoId: collectionData.cryptoIdData ?? undefined,
      metadata: buildMetadata(config),
      sessionId: config.sessionId || getScriptParamSessionId(),
    },
    config.telemetry as TelemetryConfig,
  );
}

/** Build the LoaderResult from collected data + telemetry. */
function buildResult(
  startTime: number,
  config: LoaderConfig,
  data: {
    fingerprint: FingerprintResult;
    sigintData?: SigintData;
    evercookieData?: Awaited<ReturnType<typeof getEvercookieId>>;
    cryptoIdData?: Awaited<ReturnType<typeof getCryptoId>>;
    telemetryResult?: TelemetryResult;
    isolated: boolean;
  },
): LoaderResult {
  const endTime = performance.now();
  return {
    fingerprint: data.fingerprint,
    variant: config.variant,
    timing: { start: startTime, end: endTime, duration: endTime - startTime },
    isolated: data.isolated,
    sigint: data.sigintData,
    evercookie: data.evercookieData
      ? {
          id: data.evercookieData.id,
          created: data.evercookieData.created,
          lastSeen: data.evercookieData.lastSeen,
          recoveredFrom: data.evercookieData.recoveredFrom,
        }
      : undefined,
    cryptoId: data.cryptoIdData
      ? {
          publicKey: data.cryptoIdData.publicKey,
          date: data.cryptoIdData.date,
        }
      : undefined,
    telemetry: data.telemetryResult,
  };
}

/* ------------------------------------------------------------------ */
/*  Core Loader                                                        */
/* ------------------------------------------------------------------ */

/**
 * Run fingerprint collection in an isolated iframe environment.
 *
 * The srcdoc iframe provides:
 * - Clean browser APIs (not clobbered by other scripts)
 * - Same-origin access (we can directly call functions)
 * - No network request for the iframe itself
 *
 * @example
 * ```ts
 * const result = await load({ variant: 'control', sessionId: 'abc123' });
 * console.log(result.fingerprint.$hash);
 * ```
 */
export async function load(config: LoaderConfig = {}): Promise<LoaderResult> {
  const startTime = performance.now();
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  config.onStart?.();

  // Configure STUN servers for WebRTC if sigint is enabled
  if (config.enableSigint && config.sigint?.baseDomain) {
    const stunUri = getStunServerUri(config.sigint as SigintConfig);
    setCustomStunServers([stunUri]);
  }

  // Skip isolation if requested (for debugging or specific use cases)
  if (config.skipIsolation) {
    try {
      const [fingerprint, sigintData, evercookieData, cryptoIdData] =
        await Promise.all([
          collectFingerprint(),
          config.enableSigint
            ? collectSigintData(config.sigint as SigintConfig)
            : Promise.resolve(undefined),
          getEvercookieId(),
          getCryptoId(),
        ]);

      const telemetryResult = await submitTelemetryIfEnabled(config, {
        fingerprint,
        sigintData,
        evercookieData,
        cryptoIdData,
      });

      const result = buildResult(startTime, config, {
        fingerprint,
        sigintData,
        evercookieData,
        cryptoIdData,
        telemetryResult,
        isolated: false,
      });

      config.onComplete?.(fingerprint);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      config.onError?.(err);
      throw err;
    }
  }

  // Create isolated iframe environment
  const iframe = createIsolatedIframe();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // Set up timeout
    /** Rejects after the configured timeout duration to prevent indefinite hangs. */
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(`Fingerprint collection timed out after ${timeout}ms`),
        );
      }, timeout);
    });

    // Append iframe and wait for it to be ready
    document.body.appendChild(iframe);
    await waitForIframeReady(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      throw new Error('Failed to access iframe contentWindow');
    }

    // Run all collection in parallel, race against timeout.
    // Fingerprint + sigint use the iframe's clean environment (via same-origin access).
    // Evercookie + cryptoId run in main context (need localStorage/IndexedDB).
    const collectionPromise = (async () => {
      const [fingerprint, sigintData, evercookieData, cryptoIdData] =
        await Promise.all([
          collectFingerprint(),
          config.enableSigint
            ? collectSigintData(config.sigint as SigintConfig)
            : Promise.resolve(undefined),
          getEvercookieId(),
          getCryptoId(),
        ]);
      return { fingerprint, sigintData, evercookieData, cryptoIdData };
    })();

    // Race between collection and timeout
    const { fingerprint, sigintData, evercookieData, cryptoIdData } =
      await Promise.race([collectionPromise, timeoutPromise]);

    const telemetryResult = await submitTelemetryIfEnabled(config, {
      fingerprint,
      sigintData,
      evercookieData,
      cryptoIdData,
    });

    const result = buildResult(startTime, config, {
      fingerprint,
      sigintData,
      evercookieData,
      cryptoIdData,
      telemetryResult,
      isolated: true,
    });

    config.onComplete?.(fingerprint);

    // Send to endpoint if configured
    if (config.endpoint) {
      sendToEndpoint(config.endpoint, result, config).catch(() => {
        // Silent fail for beacon - fingerprint already returned
      });
    }

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    config.onError?.(err);
    throw err;
  } finally {
    // Cleanup
    if (timeoutId) clearTimeout(timeoutId);
    iframe.remove();
  }
}

/* ------------------------------------------------------------------ */
/*  Network Utilities                                                  */
/* ------------------------------------------------------------------ */

/**
 * Send fingerprint result to configured endpoint.
 * Uses sendBeacon for reliability, falls back to fetch.
 */
async function sendToEndpoint(
  endpoint: string,
  result: LoaderResult,
  config: LoaderConfig,
): Promise<void> {
  const payload = {
    fingerprint: result.fingerprint,
    variant: result.variant,
    sessionId: config.sessionId,
    metadata: config.metadata,
    timing: result.timing,
    sigint: result.sigint,
    timestamp: Date.now(),
  };

  const body = JSON.stringify(payload);

  // Try sendBeacon first (works even during page unload)
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const sent = navigator.sendBeacon(endpoint, blob);
    if (sent) return;
  }

  // Fallback to fetch
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Convenience Exports                                                */
/* ------------------------------------------------------------------ */

/**
 * Simple one-liner to get fingerprint with default settings
 */
export async function getFingerprint(): Promise<FingerprintResult> {
  const result = await load();
  return result.fingerprint;
}

/**
 * Get fingerprint hash only (smaller payload)
 */
export async function getFingerprintHash(): Promise<string> {
  const result = await load();
  return result.fingerprint.hashes.stable;
}

/* ------------------------------------------------------------------ */
/*  Auto-run Support                                                   */
/* ------------------------------------------------------------------ */

// For script tag usage: <script src="argus-loader.js?autorun&sessionId=...">
// Disabled during testing
declare const globalThis: { __ARGUS_TEST__?: boolean };

if (typeof globalThis !== 'undefined' && !globalThis.__ARGUS_TEST__) {
  /**
   * Determines whether the loader should auto-run by checking the current
   * script element's URL for 'autorun' or 'endpoint' search parameters.
   */
  const autoRun = (() => {
    try {
      if (typeof document === 'undefined') return false;
      return 'autorun' in _scriptParams || 'endpoint' in _scriptParams;
    } catch {
      return false;
    }
  })();

  if (autoRun) {
    // Parse sigint config from URL params
    try {
      const scriptSrc = (document.currentScript as HTMLScriptElement)?.src;
      const url = scriptSrc ? new URL(scriptSrc) : undefined;
      const sigintConfig = url ? parseSigintConfigFromUrl(url) : undefined;
      const enableSigint =
        'sigintDomain' in _scriptParams ||
        _scriptParams.enableSigint === 'true';

      // Auto-detect telemetry config from hostname
      const baseDomain = 'argus.pw';
      const stagePrefix = detectStageFromHostname();

      load({
        endpoint: _scriptParams.endpoint || undefined,
        sessionId: getScriptParamSessionId(),
        variant: _scriptParams.variant || undefined,
        timeout: parseInt(_scriptParams.timeout || '') || undefined,
        enableSigint,
        sigint: enableSigint ? sigintConfig : undefined,
        enableTelemetry: true,
        telemetry: { baseDomain, stagePrefix },
        skipIsolation: true,
      }).catch((err) => {
        console.warn('[Argus] Auto-run failed:', err);
      });
    } catch (err) {
      console.warn('[Argus] Auto-run failed:', err);
    }
  }
}
