/**
 * Incognito / Private Browsing Detection Module
 *
 * Detects private browsing mode across different browsers using multiple
 * techniques. Each browser has unique characteristics when running in
 * private/incognito mode.
 *
 * Detection Methods:
 * - Chrome/Chromium: FileSystem API quota, storage estimate
 * - Firefox: IndexedDB behavior, storage quota
 * - Safari: localStorage/sessionStorage behavior
 * - Brave: Brave-specific APIs
 *
 * @module incognito
 */

import { createTimer, logTestResult } from '../utils/helpers';

/**
 * Result of incognito detection
 */
export interface IncognitoResult {
  /** Whether private browsing is detected */
  isPrivate: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Which detection methods triggered */
  signals: string[];
  /** Browser identified */
  browser: string;
  /** Detection timing in ms */
  durationMs: number;
}

/**
 * Individual test result
 */
interface TestResult {
  name: string;
  isPrivate: boolean;
  weight: number;
}

/**
 * Detect browser from user agent
 */
function detectBrowser(): string {
  const ua = navigator.userAgent;

  // Check for Brave first (has its own navigator.brave)
  // @ts-ignore
  if (navigator.brave?.isBrave) {
    return 'Brave';
  }

  // iOS browsers
  if (/CriOS/.test(ua)) return 'Chrome iOS';
  if (/FxiOS/.test(ua)) return 'Firefox iOS';
  if (/EdgiOS/.test(ua)) return 'Edge iOS';
  if (/OPiOS/.test(ua)) return 'Opera iOS';

  // Desktop/Android browsers
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';

  return 'Unknown';
}

/**
 * Chrome/Chromium: Test using FileSystem API
 * In incognito, the temporary filesystem has a smaller quota (~120MB vs ~10%+ of disk)
 */
async function testChromeFileSystem(): Promise<TestResult> {
  const result: TestResult = {
    name: 'chrome-filesystem',
    isPrivate: false,
    weight: 0.8,
  };

  try {
    // @ts-ignore - webkitRequestFileSystem is Chrome-specific
    if (!window.webkitRequestFileSystem) {
      return { ...result, weight: 0 };
    }

    return new Promise((resolve) => {
      // @ts-ignore
      window.webkitRequestFileSystem(
        // @ts-ignore
        window.TEMPORARY,
        1,
        () => resolve({ ...result, isPrivate: false }),
        () => resolve({ ...result, isPrivate: true }),
      );
    });
  } catch {
    return { ...result, weight: 0 };
  }
}

/**
 * Chrome/Chromium: Test using StorageManager API
 * Incognito mode typically shows a much smaller quota
 */
async function testStorageEstimate(): Promise<TestResult> {
  const result: TestResult = {
    name: 'storage-estimate',
    isPrivate: false,
    weight: 0.7,
  };

  try {
    if (!navigator.storage?.estimate) {
      return { ...result, weight: 0 };
    }

    const { quota } = await navigator.storage.estimate();
    if (!quota) return { ...result, weight: 0 };

    // Incognito typically has quota <= 120MB
    // Normal mode has much larger quota (often GBs)
    const quotaMB = quota / (1024 * 1024);
    result.isPrivate = quotaMB <= 200;

    return result;
  } catch {
    return { ...result, weight: 0 };
  }
}

/**
 * Firefox: Test using IndexedDB
 * In private browsing, IndexedDB throws or has limited functionality
 */
async function testFirefoxIndexedDB(): Promise<TestResult> {
  const result: TestResult = {
    name: 'firefox-indexeddb',
    isPrivate: false,
    weight: 0.9,
  };

  try {
    const db = indexedDB.open('test-private-mode');

    return new Promise((resolve) => {
      db.onerror = () => {
        resolve({ ...result, isPrivate: true });
      };

      db.onsuccess = () => {
        db.result.close();
        indexedDB.deleteDatabase('test-private-mode');
        resolve({ ...result, isPrivate: false });
      };

      // Timeout for safety
      setTimeout(() => resolve({ ...result, weight: 0 }), 500);
    });
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Safari: Test localStorage behavior
 * In private mode, Safari's localStorage throws on setItem or has limited quota
 */
function testSafariLocalStorage(): TestResult {
  const result: TestResult = {
    name: 'safari-localstorage',
    isPrivate: false,
    weight: 0.8,
  };

  try {
    const testKey = '__incognito_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return result;
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Safari: Test openDatabase (WebSQL)
 * WebSQL is disabled in Safari private mode
 */
function testSafariOpenDatabase(): TestResult {
  const result: TestResult = {
    name: 'safari-opendb',
    isPrivate: false,
    weight: 0.7,
  };

  try {
    // @ts-ignore - openDatabase is Safari-specific
    if (!window.openDatabase) {
      return { ...result, weight: 0 };
    }

    // @ts-ignore
    const db = window.openDatabase('test', '1.0', 'Test', 1);
    return { ...result, isPrivate: !db };
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Test cache storage availability
 * Some browsers restrict this in private mode
 */
async function testCacheStorage(): Promise<TestResult> {
  const result: TestResult = {
    name: 'cache-storage',
    isPrivate: false,
    weight: 0.5,
  };

  try {
    if (!('caches' in window)) {
      return { ...result, weight: 0 };
    }

    const cacheName = '__incognito_cache_test__';
    await caches.open(cacheName);
    await caches.delete(cacheName);
    return result;
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Test service worker availability
 * Some incognito modes restrict service workers
 */
async function testServiceWorker(): Promise<TestResult> {
  const result: TestResult = {
    name: 'service-worker',
    isPrivate: false,
    weight: 0.4,
  };

  try {
    if (!('serviceWorker' in navigator)) {
      return { ...result, weight: 0 };
    }

    // Check if we can access registrations
    await navigator.serviceWorker.getRegistrations();
    return result;
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Test SharedWorker availability
 * Some browsers block SharedWorkers in private mode
 */
function testSharedWorker(): TestResult {
  const result: TestResult = {
    name: 'shared-worker',
    isPrivate: false,
    weight: 0.3,
  };

  try {
    if (typeof SharedWorker === 'undefined') {
      return { ...result, weight: 0 };
    }

    // Try to create a SharedWorker with a data URL
    const blob = new Blob([''], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    try {
      const worker = new SharedWorker(url);
      worker.port.close();
      URL.revokeObjectURL(url);
      return result;
    } catch {
      URL.revokeObjectURL(url);
      return { ...result, isPrivate: true };
    }
  } catch {
    return { ...result, weight: 0 };
  }
}

/**
 * Test requestFileSystemSync (if available)
 * Workers have this in normal mode but not incognito
 */
function testFileSystemSync(): TestResult {
  const result: TestResult = {
    name: 'filesystem-sync',
    isPrivate: false,
    weight: 0.4,
  };

  try {
    // @ts-ignore
    if (!window.webkitRequestFileSystemSync && !window.requestFileSystemSync) {
      return { ...result, weight: 0 };
    }
    return result;
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Test performance.memory (Chrome only)
 * May show different values in incognito
 */
function testPerformanceMemory(): TestResult {
  const result: TestResult = {
    name: 'performance-memory',
    isPrivate: false,
    weight: 0.2,
  };

  try {
    // @ts-ignore
    const memory = performance.memory;
    if (!memory) {
      return { ...result, weight: 0 };
    }

    // In incognito, jsHeapSizeLimit is often smaller
    // This is a weak signal
    const heapLimitMB = memory.jsHeapSizeLimit / (1024 * 1024);
    result.isPrivate = heapLimitMB < 1000;

    return result;
  } catch {
    return { ...result, weight: 0 };
  }
}

/**
 * Test navigator.credentials (if available)
 * Credential Management API may behave differently in private mode
 */
async function testCredentials(): Promise<TestResult> {
  const result: TestResult = {
    name: 'credentials',
    isPrivate: false,
    weight: 0.3,
  };

  try {
    if (!navigator.credentials) {
      return { ...result, weight: 0 };
    }

    // Try to access credentials - may fail in private mode
    await navigator.credentials.preventSilentAccess();
    return result;
  } catch {
    return { ...result, isPrivate: true };
  }
}

/**
 * Main detection function
 * Runs multiple browser-specific tests and aggregates results
 */
export async function detectIncognito(): Promise<IncognitoResult> {
  const timer = createTimer();
  const browser = detectBrowser();
  const results: TestResult[] = [];

  // Run browser-specific tests
  const isChromium = [
    'Chrome',
    'Edge',
    'Opera',
    'Brave',
    'Chrome iOS',
  ].includes(browser);
  const isFirefox = browser.includes('Firefox');
  const isSafari = browser.includes('Safari');

  // Parallel test execution
  const tests: Promise<TestResult>[] = [];

  // Universal tests
  tests.push(testStorageEstimate());
  tests.push(testCacheStorage());
  tests.push(testServiceWorker());
  tests.push(testCredentials());
  results.push(testSharedWorker());

  // Chrome/Chromium specific
  if (isChromium) {
    tests.push(testChromeFileSystem());
    results.push(testPerformanceMemory());
    results.push(testFileSystemSync());
  }

  // Firefox specific
  if (isFirefox) {
    tests.push(testFirefoxIndexedDB());
  }

  // Safari specific
  if (isSafari) {
    results.push(testSafariLocalStorage());
    results.push(testSafariOpenDatabase());
  }

  // Wait for async tests
  const asyncResults = await Promise.all(tests);
  results.push(...asyncResults);

  // Filter out tests that didn't apply (weight = 0)
  const validResults = results.filter((r) => r.weight > 0);

  // Calculate weighted score
  let totalWeight = 0;
  let privateScore = 0;
  const signals: string[] = [];

  for (const test of validResults) {
    totalWeight += test.weight;
    if (test.isPrivate) {
      privateScore += test.weight;
      signals.push(test.name);
    }
  }

  // Calculate confidence and final result
  const confidence = totalWeight > 0 ? privateScore / totalWeight : 0;
  const isPrivate = confidence >= 0.5;

  const durationMs = timer.stop();

  logTestResult({
    time: durationMs,
    test: 'incognito detection',
    passed: true,
  });

  return {
    isPrivate,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    browser,
    durationMs,
  };
}

export default detectIncognito;
