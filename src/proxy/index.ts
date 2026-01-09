/**
 * Proxy Detection Module
 *
 * Detects residential proxies by testing localhost connectivity behavior.
 * Residential proxies typically intercept and block/drop localhost requests,
 * while direct connections or datacenter proxies either timeout or connect.
 *
 * Detection signals (positive = likely proxy):
 * - ERR_EMPTY_RESPONSE: Proxy intercepted and dropped
 * - 403 Forbidden: Explicit proxy block
 * - Timeout/slow response (>500ms): Proxy routing through network
 *
 * Negative signal (likely NOT a proxy):
 * - Fast connection_refused (<500ms): Local TCP stack responding directly
 */

import { captureError } from '../errors';

export interface ProxyDetectionResult {
  localhostBlocked: boolean;
  responseTime: number;
  errorType:
    | 'empty_response'
    | 'connection_refused'
    | 'timeout'
    | 'forbidden'
    | 'success'
    | 'unknown';
  errorMessage: string | null;
  likelyResidentialProxy: boolean;
  $hash?: string;
}

// Use a random high port unlikely to have anything listening
const TEST_PORT = 23847;
const TIMEOUT_MS = 1000;
// Fast failure threshold - if error comes back faster than this, proxy is actively blocking
const FAST_FAIL_MS = 500;

/**
 * Test localhost connectivity to detect proxy behavior
 */
async function testLocalhostConnectivity(): Promise<{
  blocked: boolean;
  elapsed: number;
  errorType: ProxyDetectionResult['errorType'];
  errorMessage: string | null;
}> {
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`http://localhost:${TEST_PORT}/`, {
      signal: controller.signal,
      mode: 'no-cors',
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const elapsed = performance.now() - start;

    // If we get here, something responded
    if (response.status === 403) {
      return {
        blocked: true,
        elapsed,
        errorType: 'forbidden',
        errorMessage: '403 Forbidden',
      };
    }

    return {
      blocked: false,
      elapsed,
      errorType: 'success',
      errorMessage: null,
    };
  } catch (error: any) {
    const elapsed = performance.now() - start;
    const message = error?.message || String(error);

    // Aborted = timeout
    if (error?.name === 'AbortError' || message.includes('abort')) {
      return {
        blocked: false,
        elapsed,
        errorType: 'timeout',
        errorMessage: 'Request timed out',
      };
    }

    // Empty response = proxy intercepted and dropped
    if (message.includes('ERR_EMPTY_RESPONSE') || message.includes('empty')) {
      return {
        blocked: true,
        elapsed,
        errorType: 'empty_response',
        errorMessage: message,
      };
    }

    // Connection refused/reset - this is normal when nothing is listening
    // NOT a reliable proxy signal by itself
    if (
      message.includes('ERR_CONNECTION_REFUSED') ||
      message.includes('ERR_CONNECTION_RESET') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ECONNRESET') ||
      message.includes('Failed to fetch')
    ) {
      return {
        blocked: false,
        elapsed,
        errorType: 'connection_refused',
        errorMessage: message,
      };
    }

    // Network error - could be proxy
    if (message.includes('NetworkError') || message.includes('network')) {
      return {
        blocked: true,
        elapsed,
        errorType: 'connection_refused',
        errorMessage: message,
      };
    }

    return {
      blocked: false,
      elapsed,
      errorType: 'unknown',
      errorMessage: message,
    };
  }
}

/**
 * Detect residential proxy by testing localhost behavior
 */
export async function detectProxy(): Promise<ProxyDetectionResult> {
  try {
    const result = await testLocalhostConnectivity();

    // Residential proxy indicators:
    // 1. ERR_EMPTY_RESPONSE (proxy intercepted and dropped connection)
    // 2. 403 Forbidden (explicit proxy block)
    // 3. Timeout - proxy routing localhost through network
    // 4. Slow connection_refused (>500ms) - proxy routed to its localhost, nothing listening
    //
    // Negative signal (NOT a proxy):
    // - Fast connection_refused (<500ms) - local TCP stack responding directly
    //   Without a proxy, the local machine immediately knows nothing is listening
    //   With a proxy, the request routes through network which adds latency
    const fastLocalResponse =
      result.elapsed < FAST_FAIL_MS &&
      result.errorType === 'connection_refused';
    const slowNetworkResponse = result.elapsed >= FAST_FAIL_MS;

    const likelyResidentialProxy =
      !fastLocalResponse &&
      (result.errorType === 'empty_response' ||
        result.errorType === 'forbidden' ||
        result.errorType === 'timeout' ||
        (slowNetworkResponse && result.errorType === 'connection_refused'));

    return {
      localhostBlocked: result.blocked,
      responseTime: Math.round(result.elapsed),
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      likelyResidentialProxy,
    };
  } catch (error) {
    captureError(error, 'proxy detection');
    return {
      localhostBlocked: false,
      responseTime: 0,
      errorType: 'unknown',
      errorMessage: error?.toString() || null,
      likelyResidentialProxy: false,
    };
  }
}

export default detectProxy;
