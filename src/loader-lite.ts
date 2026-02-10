/**
 * Argus Loader (Lite)
 *
 * Lightweight loader (~2KB) that creates an isolated iframe and dynamically
 * loads the fingerprinting script. Does NOT bundle the fingerprinting code.
 *
 * Usage:
 *   <script src="argus-loader-lite.js?src=/argus.min.js"></script>
 *
 * Or programmatically:
 *   import { load } from 'argus-loader-lite';
 *   const result = await load({ scriptUrl: '/argus.min.js' });
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LoaderConfig {
  /** URL to the argus fingerprinting script (required) */
  scriptUrl: string;

  /** Timeout in ms before aborting (default: 15000) */
  timeout?: number;

  /** Enable sigint server-side fingerprinting */
  enableSigint?: boolean;

  /** Sigint configuration */
  sigint?: {
    baseDomain?: string;
    stagePrefix?: string;
    enableStun?: boolean;
  };

  /** Session identifier */
  sessionId?: string;

  /** Endpoint to POST results to */
  endpoint?: string;
}

export interface LoaderResult {
  fingerprint: unknown;
  sigint?: unknown;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT = 15_000;
const MSG_TYPE = '__argus_result__';
const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

const IFRAME_CSS = `
.argus-frame{position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;border:none}
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Inject CSS once to hide iframe */
function injectStyles(): void {
  if (document.querySelector('style[data-argus]')) return;
  try {
    const style = document.createElement('style');
    style.setAttribute('data-argus', '');
    style.textContent = IFRAME_CSS;
    document.head.appendChild(style);
  } catch {
    // CSP may block inline styles - iframe will still work, just visible briefly
    // No expectFailure needed - this is non-critical and the page will still function
  }
}

/** Build the script content to inject into iframe */
function buildIframeScript(config: LoaderConfig): string {
  const opts = {
    enableSigint: config.enableSigint ?? false,
    sigint: config.sigint ?? {},
    sessionId: config.sessionId,
  };

  // Script that loads argus.js and runs fingerprinting
  return `
(async function() {
  const opts = ${JSON.stringify(opts)};

  // Load the fingerprinting script
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ${JSON.stringify(config.scriptUrl)};
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load script'));
    document.body.appendChild(s);
  });

  // Wait for Argus to be available
  if (typeof Argus === 'undefined') {
    throw new Error('Argus not defined after script load');
  }

  try {
    // Run fingerprint collection
    const result = await Argus.load(opts);

    // Send result back to parent
    parent.postMessage({
      type: '${MSG_TYPE}',
      success: true,
      data: {
        fingerprint: result.fingerprint,
        sigint: result.sigint,
      }
    }, '*');
  } catch (err) {
    parent.postMessage({
      type: '${MSG_TYPE}',
      success: false,
      error: err.message || String(err)
    }, '*');
  }
})();
`;
}

/* ------------------------------------------------------------------ */
/*  Main Loader                                                        */
/* ------------------------------------------------------------------ */

/**
 * Load fingerprint via isolated iframe
 */
export async function load(config: LoaderConfig): Promise<LoaderResult> {
  const startTime = performance.now();
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  injectStyles();

  return new Promise(
    /** Creates iframe, sets up message listener, and manages timeout */ (
      resolve,
      reject,
    ) => {
      let iframe: HTMLIFrameElement | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      /** Removes the iframe, clears timeout, and detaches the message listener. */
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (iframe) iframe.remove();
        window.removeEventListener('message', handleMessage);
      };

      /**
       * Handles postMessage events from the iframe, resolving or rejecting the loader promise.
       * @param event - The MessageEvent from the iframe containing fingerprint results or an error.
       */
      const handleMessage = (event: MessageEvent) => {
        // Only handle our messages
        if (!event.data || event.data.type !== MSG_TYPE) return;
        if (settled) return;
        settled = true;

        cleanup();

        const endTime = performance.now();

        if (event.data.success) {
          resolve({
            fingerprint: event.data.data.fingerprint,
            sigint: event.data.data.sigint,
            timing: {
              start: startTime,
              end: endTime,
              duration: endTime - startTime,
            },
          });
        } else {
          reject(new Error(event.data.error || 'Unknown error'));
        }
      };

      // Listen for result
      window.addEventListener('message', handleMessage);

      // Set up timeout
      timeoutId = setTimeout(
        /** Rejects the promise if fingerprinting exceeds the configured timeout */ () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(
            new Error(`Fingerprint collection timed out after ${timeout}ms`),
          );
        },
        timeout,
      );

      // Create iframe
      iframe = document.createElement('iframe');
      iframe.className = 'argus-frame';
      iframe.setAttribute('srcdoc', SRCDOC);
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('aria-hidden', 'true');

      iframe.addEventListener(
        'load',
        /** Injects the fingerprinting script into the iframe once it has loaded */
        () => {
          if (settled || !iframe?.contentDocument) return;

          // Inject our script into the iframe
          const script = iframe.contentDocument.createElement('script');
          script.textContent = buildIframeScript(config);
          iframe.contentDocument.body.appendChild(script);
        },
        { once: true },
      );

      iframe.addEventListener(
        'error',
        /** Rejects the loader promise if the iframe fails to load */
        () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('Failed to create iframe'));
        },
        { once: true },
      );

      document.body.appendChild(iframe);
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Convenience                                                        */
/* ------------------------------------------------------------------ */

/** Get just the fingerprint object */
export async function getFingerprint(config: LoaderConfig): Promise<unknown> {
  const result = await load(config);
  return result.fingerprint;
}

/* ------------------------------------------------------------------ */
/*  Auto-run from script tag                                           */
/* ------------------------------------------------------------------ */

/**
 * Normalize a raw session-id param to a URL-safe value.
 * Converts standard base64 → base64url (replace +→-, /→_, strip =)
 * so the value passes the API's /^[\w-]+$/ path-parameter validation.
 */
function parseSessionIdParam(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

declare const globalThis: { __ARGUS_TEST__?: boolean };

if (typeof globalThis !== 'undefined' && !globalThis.__ARGUS_TEST__) {
  try {
    if (typeof document !== 'undefined' && document.currentScript) {
      const script = document.currentScript as HTMLScriptElement;
      const url = new URL(script.src);
      const version = url.searchParams.get('version');
      const scriptUrl = version
        ? new URL(`${version}.js`, url.origin).href
        : url.searchParams.get('src');

      if (scriptUrl) {
        load({
          scriptUrl,
          enableSigint: url.searchParams.get('enableSigint') === 'true',
          sigint: {
            baseDomain: url.searchParams.get('sigintDomain') || undefined,
            stagePrefix: url.searchParams.get('sigintStage') || undefined,
            enableStun: url.searchParams.get('enableStun') === 'true',
          },
          endpoint: url.searchParams.get('endpoint') || undefined,
          sessionId: parseSessionIdParam(
            url.searchParams.get('session-id') ||
              url.searchParams.get('sessionId'),
          ),
          timeout: parseInt(url.searchParams.get('timeout') || '') || undefined,
        })
          .then(
            /** Stores the result globally and sends it to the configured endpoint */ (
              result,
            ) => {
              // Store result globally for access
              (window as unknown as Record<string, unknown>).__argusResult__ =
                result;

              // Send to endpoint if configured
              const endpoint = url.searchParams.get('endpoint');
              if (endpoint) {
                const sessionId = parseSessionIdParam(
                  url.searchParams.get('session-id') ||
                    url.searchParams.get('sessionId'),
                );
                const body = JSON.stringify({ ...result, sessionId });
                if (navigator.sendBeacon) {
                  navigator.sendBeacon(
                    endpoint,
                    new Blob([body], { type: 'application/json' }),
                  );
                } else {
                  fetch(endpoint, {
                    method: 'POST',
                    body,
                    keepalive: true,
                  }).catch(() => {});
                }
              }
            },
          )
          .catch((err) => {
            console.warn('[Argus] Load failed:', err);
          });
      }
    }
  } catch {
    // Ignore auto-run errors - this is initialization code that may fail in some environments
    // No expectFailure needed - this is non-critical startup code
  }
}
