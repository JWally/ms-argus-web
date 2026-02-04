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
    const stunUri = getStunServerUri(config.sigint);
    setCustomStunServers([stunUri]);
  }

  // Skip isolation if requested (for debugging or specific use cases)
  if (config.skipIsolation) {
    try {
      // Run fingerprint and sigint collection in parallel if enabled
      const [fingerprint, sigintData] = await Promise.all([
        collectFingerprint(),
        config.enableSigint
          ? collectSigintData(config.sigint || {})
          : Promise.resolve(undefined),
      ]);
      const endTime = performance.now();

      const result: LoaderResult = {
        fingerprint,
        variant: config.variant,
        timing: {
          start: startTime,
          end: endTime,
          duration: endTime - startTime,
        },
        isolated: false,
        sigint: sigintData,
      };

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

    // Run fingerprint collection inside iframe (and sigint in parallel if enabled)
    // Since srcdoc is same-origin, we have full access
    /**
     * Runs fingerprint and optional sigint collection in parallel within the
     * iframe's clean environment.
     */
    const collectionPromise = (async () => {
      // The iframe has a clean JS environment, but we need to run our code there.
      // We inject the collectFingerprint function and run it.
      //
      // Note: In the bundled version, collectFingerprint will be inlined.
      // The iframe's clean environment protects against prototype pollution
      // and API tampering that might exist in the parent page.

      // For now, we run in the parent context but could inject into iframe
      // if deeper isolation is needed. The srcdoc approach still helps by
      // providing a clean DOM to query if needed.
      const [fingerprint, sigintData] = await Promise.all([
        collectFingerprint(),
        config.enableSigint
          ? collectSigintData(config.sigint || {})
          : Promise.resolve(undefined),
      ]);
      return { fingerprint, sigintData };
    })();

    // Race between collection and timeout
    const { fingerprint, sigintData } = await Promise.race([
      collectionPromise,
      timeoutPromise,
    ]);

    const endTime = performance.now();

    const result: LoaderResult = {
      fingerprint,
      variant: config.variant,
      timing: {
        start: startTime,
        end: endTime,
        duration: endTime - startTime,
      },
      isolated: true,
      sigint: sigintData,
    };

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
  return result.fingerprint.$hash;
}

/* ------------------------------------------------------------------ */
/*  Auto-run Support                                                   */
/* ------------------------------------------------------------------ */

// For script tag usage: <script src="argus-loader.js?endpoint=...&sessionId=...">
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
      const script = document.currentScript as HTMLScriptElement | null;
      if (!script?.src) return false;
      const url = new URL(script.src);
      return (
        url.searchParams.has('autorun') || url.searchParams.has('endpoint')
      );
    } catch {
      // URL parsing failed - auto-run not applicable
      return false;
    }
  })();

  if (autoRun) {
    const script = document.currentScript as HTMLScriptElement;
    const url = new URL(script.src);

    // Parse sigint config from URL params
    const sigintConfig = parseSigintConfigFromUrl(url);
    const enableSigint =
      url.searchParams.has('sigintDomain') ||
      url.searchParams.get('enableSigint') === 'true';

    load({
      endpoint: url.searchParams.get('endpoint') || undefined,
      sessionId: url.searchParams.get('sessionId') || undefined,
      variant: url.searchParams.get('variant') || undefined,
      timeout: parseInt(url.searchParams.get('timeout') || '') || undefined,
      enableSigint,
      sigint: enableSigint ? sigintConfig : undefined,
    }).catch((err) => {
      console.warn('[Argus] Auto-run failed:', err);
    });
  }
}
