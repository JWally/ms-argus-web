/**
 * Navigator Fingerprinting Module
 *
 * This module collects device and browser information from the Navigator API.
 * The Navigator object provides extensive information about the user's browser
 * and device that can be used for fingerprinting.
 *
 * ## Key fingerprinting vectors:
 *
 * - **Platform/OS**: Windows, macOS, Linux, Android, iOS
 * - **Hardware**: CPU cores, device memory, touch support
 * - **Preferences**: Language, Do Not Track, permissions
 * - **Plugins**: Browser plugins and MIME types
 * - **User Agent**: Browser version, OS details
 *
 * ## Tampering detection:
 *
 * - Platform vs User-Agent mismatch
 * - Main thread vs Worker scope mismatch
 * - Invalid device memory values
 * - Gibberish in user agent or plugin names
 * - Plugin/MIME type inconsistencies
 *
 * ## Special thanks:
 * https://arh.antoinevastel.com for inspiration
 *
 * @module navigator
 */

import { attempt, caniuse, captureError } from '../errors';
import { lieProps, documentLie, getPluginLies } from '../lies';
import { sendToTrash, gibberish } from '../trash';
import { hashMini } from '../utils/crypto';
import {
  createTimer,
  queueEvent,
  getOS,
  braveBrowser,
  decryptUserAgent,
  getUserAgentPlatform,
  isUAPostReduction,
  logTestResult,
  USER_AGENT_OS,
  PLATFORM_OS,
  Analysis,
} from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';
import {
  VALID_DEVICE_MEMORY,
  VALID_DO_NOT_TRACK,
  KNOWN_PLATFORMS,
  PERMISSION_NAMES,
  HIGH_ENTROPY_UA_VALUES,
} from './constants';
import type {
  PluginInfo,
  UserAgentData,
  PermissionStates,
  WebGpuInfo,
  NavigatorFingerprint,
} from './types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Checks if user agent is credible by comparing to appVersion.
 *
 * In Chrome, the userAgent should contain the appVersion as a substring.
 * Mismatches indicate tampering.
 */
function isCredibleUserAgent(): boolean {
  return 'chrome' in window
    ? navigator.userAgent.includes(navigator.appVersion)
    : true;
}

/**
 * Validates and returns the platform string.
 *
 * Checks that:
 * - Platform contains a known OS substring
 * - Platform matches the OS from user agent
 * - Platform matches the worker scope
 */
function getPlatform(
  workerScope: { platform?: string },
  setLied: () => void,
): string | undefined {
  return attempt(() => {
    const { platform } = navigator;

    // Check for known platform strings
    const trusted =
      typeof platform === 'string' &&
      KNOWN_PLATFORMS.find((val) => platform.toLowerCase().includes(val));

    if (!trusted) {
      sendToTrash('platform', `${platform} is unusual`);
    }

    // Check platform vs user agent OS
    if (USER_AGENT_OS !== PLATFORM_OS) {
      setLied();
      documentLie(
        'Navigator.platform',
        `${PLATFORM_OS} platform and ${USER_AGENT_OS} user agent do not match`,
      );
    }

    // Check main thread vs worker scope
    if (platform !== workerScope.platform) {
      setLied(); // documented in the worker source
    }

    return platform;
  });
}

/**
 * Validates and returns the user agent string.
 *
 * Checks for:
 * - Mismatch with appVersion
 * - Extra whitespace
 * - Gibberish content
 * - Worker scope mismatch
 */
function getUserAgent(
  workerScope: { userAgent?: string },
  credibleUserAgent: boolean,
  setLied: () => void,
): string | undefined {
  return attempt(() => {
    const { userAgent } = navigator;

    if (!credibleUserAgent) {
      sendToTrash('userAgent', `${userAgent} does not match appVersion`);
    }

    if (/\s{2,}|^\s|\s$/g.test(userAgent)) {
      sendToTrash('userAgent', 'extra spaces detected');
    }

    const gibbers = gibberish(userAgent);
    if (gibbers.length) {
      sendToTrash('userAgent is gibberish', userAgent);
    }

    if (userAgent !== workerScope.userAgent) {
      setLied(); // documented in the worker source
    }

    return userAgent.trim().replace(/\s{2,}/, ' ');
  }, 'userAgent failed');
}

/**
 * Validates and returns device memory.
 *
 * Device Memory API returns values in a limited set (0.25, 0.5, 1, 2, 4, 8 GB).
 * Also validates against JS heap size limit.
 */
function getDeviceMemory(
  workerScope: { deviceMemory?: number },
  setLied: () => void,
): number | undefined {
  return attempt(() => {
    if (!('deviceMemory' in navigator)) {
      return undefined;
    }

    // @ts-ignore
    const { deviceMemory } = navigator;

    if (!VALID_DEVICE_MEMORY[deviceMemory]) {
      sendToTrash(
        'deviceMemory',
        `${deviceMemory} is not a valid value [0.25, 0.5, 1, 2, 4, 8]`,
      );
    }

    // Check against JS heap size limit
    // @ts-expect-error memory is undefined if not supported
    const memory = performance?.memory?.jsHeapSizeLimit || null;
    const memoryInGigabytes = memory ? +(memory / 1073741824).toFixed(1) : 0;
    if (memoryInGigabytes > deviceMemory) {
      sendToTrash(
        'deviceMemory',
        `available memory ${memoryInGigabytes}GB is greater than device memory ${deviceMemory}GB`,
      );
    }

    if (deviceMemory !== workerScope.deviceMemory) {
      setLied(); // documented in the worker source
    }

    return deviceMemory;
  }, 'deviceMemory failed');
}

/**
 * Gets plugins with validation.
 *
 * Validates plugin/MIME type consistency and checks for gibberish.
 */
function getPlugins(setLied: () => void): PluginInfo[] | undefined {
  return attempt(() => {
    const { plugins } = navigator;

    if (!(plugins instanceof PluginArray)) {
      return undefined;
    }

    const response: PluginInfo[] = plugins
      ? [...plugins].map((p) => ({
          name: p.name,
          description: p.description,
          filename: p.filename,
          // @ts-ignore
          version: p.version,
        }))
      : [];

    // Validate plugin/MIME type consistency
    const { lies } = getPluginLies(plugins, navigator.mimeTypes);
    if (lies.length) {
      setLied();
      lies.forEach((lie) => documentLie('Navigator.plugins', lie));
    }

    // Check for gibberish in plugin names/descriptions
    response.forEach((plugin) => {
      const { name, description } = plugin;
      const nameGibbers = gibberish(name);
      const descriptionGibbers = gibberish(description);
      if (nameGibbers.length) {
        sendToTrash('plugin name is gibberish', name);
      }
      if (descriptionGibbers.length) {
        sendToTrash('plugin description is gibberish', description);
      }
    });

    return response;
  }, 'plugins failed');
}

// ============================================================================
// ASYNC DATA COLLECTORS
// ============================================================================

/**
 * Gets User-Agent Client Hints (high entropy values).
 *
 * The User-Agent Client Hints API provides structured access to
 * browser and platform information that was previously only available
 * by parsing the user agent string.
 */
async function getUserAgentData(): Promise<UserAgentData | undefined> {
  return attempt(async () => {
    // @ts-ignore
    if (!navigator.userAgentData?.getHighEntropyValues) {
      return undefined;
    }

    // @ts-ignore
    const data = await navigator.userAgentData.getHighEntropyValues(
      HIGH_ENTROPY_UA_VALUES as unknown as string[],
    );

    // @ts-ignore
    const { brands, mobile } = navigator.userAgentData || {};

    // Compress brand names (filter out "Not A Brand" entries)
    const compressedBrands = (
      brandList: Array<{ brand: string; version: string }>,
      captureVersion = false,
    ): string[] =>
      brandList
        .filter((obj) => !/Not/.test(obj.brand))
        .map((obj) => `${obj.brand}${captureVersion ? ` ${obj.version}` : ''}`);

    // Remove Chromium if there are other brands
    const removeChromium = (brandList: string[]): string[] =>
      brandList.length > 1
        ? brandList.filter((brand) => !/Chromium/.test(brand))
        : brandList;

    if (!data.brands) {
      data.brands = brands;
    }

    data.brandsVersion = compressedBrands(data.brands, true);
    data.brands = compressedBrands(data.brands);
    data.brandsVersion = removeChromium(data.brandsVersion);
    data.brands = removeChromium(data.brands);

    if (!data.mobile) {
      data.mobile = mobile;
    }

    // Sort keys for consistent output
    return Object.keys(data)
      .sort()
      .reduce((acc, key) => {
        acc[key as keyof UserAgentData] = data[key];
        return acc;
      }, {} as UserAgentData);
  }, 'userAgentData failed');
}

/**
 * Gets Bluetooth availability status.
 */
async function getBluetoothAvailability(): Promise<boolean | undefined> {
  return attempt(async () => {
    // @ts-ignore
    if (!navigator.bluetooth?.getAvailability) {
      return undefined;
    }
    // @ts-ignore
    return navigator.bluetooth.getAvailability();
  }, 'bluetoothAvailability failed');
}

/**
 * Gets permission states for various APIs.
 *
 * The Permissions API allows querying the current state of
 * permissions without triggering a prompt.
 */
async function getPermissions(): Promise<PermissionStates | undefined> {
  return attempt(async () => {
    if (!('permissions' in navigator)) {
      return undefined;
    }

    const getPermissionState = async (
      name: string,
    ): Promise<{ name: string; state: string }> => {
      try {
        const res = await navigator.permissions.query({
          name,
        } as PermissionDescriptor);
        return { name, state: res.state };
      } catch {
        expectFailure(
          'getPermissionState',
          `Permission query failed for ${name}`,
        );
        return { name, state: 'unknown' };
      }
    };

    const permissions = await Promise.all(
      PERMISSION_NAMES.map((name) => getPermissionState(name)),
    );

    // Group by state
    return permissions.reduce((acc, perm) => {
      const { state, name } = perm;
      if (acc[state as keyof PermissionStates]) {
        acc[state as keyof PermissionStates]!.push(name);
      } else {
        acc[state as keyof PermissionStates] = [name];
      }
      return acc;
    }, {} as PermissionStates);
  }, 'permissions failed');
}

/**
 * Gets WebGPU adapter information.
 *
 * WebGPU provides detailed GPU information that can be used for
 * fingerprinting, including vendor, architecture, and limits.
 */
async function getWebGpu(): Promise<WebGpuInfo | undefined> {
  return attempt(async () => {
    if (!('gpu' in navigator)) {
      return undefined;
    }

    // @ts-expect-error if unsupported
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return undefined;

    const { limits = {}, features = [] } = adapter;

    const handleInfo = (info: {
      architecture?: string;
      description?: string;
      device?: string;
      vendor?: string;
    }): WebGpuInfo => {
      const { architecture, description, device, vendor } = info;
      const adapterInfo = [vendor, architecture, description, device];
      const featureValues = [...features.values()];

      // Extract limits as plain object
      const limitsData: Record<string, number> = {};
      for (const prop in limits) {
        limitsData[prop] = limits[prop as keyof typeof limits];
      }

      // Store for analysis
      Analysis.webGpuAdapter = adapterInfo;
      Analysis.webGpuFeatures = featureValues;
      Analysis.webGpuLimits = hashMini(limitsData);

      return { adapterInfo, limits: limitsData };
    };

    const { info } = adapter;
    return info
      ? handleInfo(info)
      : adapter.requestAdapterInfo().then(handleInfo);
  }, 'webgpu failed');
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Collects a complete navigator fingerprint.
 *
 * This is the main entry point for navigator fingerprinting. It:
 * 1. Checks for known API lies
 * 2. Collects platform, user agent, and hardware info
 * 3. Validates values against known good ranges
 * 4. Compares main thread vs worker scope
 * 5. Gets async data (permissions, WebGPU, etc.)
 *
 * @param workerScope - Data from the worker scope for comparison
 * @returns Complete navigator fingerprint
 */
export default async function getNavigator(
  workerScope: Record<string, unknown>,
): Promise<NavigatorFingerprint | undefined> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Check for known API lies
    let lied =
      !!(
        lieProps['Navigator.appVersion'] ||
        lieProps['Navigator.deviceMemory'] ||
        lieProps['Navigator.doNotTrack'] ||
        lieProps['Navigator.hardwareConcurrency'] ||
        lieProps['Navigator.language'] ||
        lieProps['Navigator.languages'] ||
        lieProps['Navigator.maxTouchPoints'] ||
        lieProps['Navigator.oscpu'] ||
        lieProps['Navigator.platform'] ||
        lieProps['Navigator.userAgent'] ||
        lieProps['Navigator.vendor'] ||
        lieProps['Navigator.plugins'] ||
        lieProps['Navigator.mimeTypes']
      ) || false;

    const setLied = () => {
      lied = true;
    };

    const credibleUserAgent = isCredibleUserAgent();

    // Collect synchronous data
    const data = {
      platform: getPlatform(workerScope as { platform?: string }, setLied),

      system: attempt(
        () => getOS(navigator.userAgent),
        'userAgent system failed',
      ),

      userAgentParsed: await attempt(async () => {
        const reportedUserAgent = caniuse(() => navigator.userAgent);
        const reportedSystem = getOS(reportedUserAgent);
        const isBrave = await braveBrowser();
        return decryptUserAgent({
          ua: reportedUserAgent,
          os: reportedSystem,
          isBrave,
        });
      }),

      device: attempt(
        () => getUserAgentPlatform({ userAgent: navigator.userAgent }),
        'userAgent device failed',
      ),

      userAgent: getUserAgent(
        workerScope as { userAgent?: string },
        credibleUserAgent,
        setLied,
      ),

      uaPostReduction: isUAPostReduction(navigator?.userAgent),

      appVersion: attempt(() => {
        const { appVersion } = navigator;

        if (!credibleUserAgent) {
          sendToTrash('appVersion', `${appVersion} does not match userAgent`);
        }
        if ('appVersion' in navigator && !appVersion) {
          sendToTrash(
            'appVersion',
            'Living Standard property returned falsy value',
          );
        }
        if (/\s{2,}|^\s|\s$/g.test(appVersion)) {
          sendToTrash('appVersion', 'extra spaces detected');
        }

        return appVersion.trim().replace(/\s{2,}/, ' ');
      }, 'appVersion failed'),

      deviceMemory: getDeviceMemory(
        workerScope as { deviceMemory?: number },
        setLied,
      ),

      doNotTrack: attempt(() => {
        const { doNotTrack } = navigator;
        if (!VALID_DO_NOT_TRACK[doNotTrack as string]) {
          sendToTrash('doNotTrack - unusual result', doNotTrack);
        }
        return doNotTrack;
      }, 'doNotTrack failed'),

      globalPrivacyControl: attempt(() => {
        if (!('globalPrivacyControl' in navigator)) {
          return undefined;
        }
        // @ts-ignore
        const { globalPrivacyControl } = navigator;
        if (!VALID_DO_NOT_TRACK[globalPrivacyControl]) {
          sendToTrash(
            'globalPrivacyControl - unusual result',
            globalPrivacyControl,
          );
        }
        return globalPrivacyControl;
      }, 'globalPrivacyControl failed'),

      hardwareConcurrency: attempt(() => {
        if (!('hardwareConcurrency' in navigator)) {
          return undefined;
        }

        const { hardwareConcurrency } = navigator;

        if (hardwareConcurrency !== workerScope.hardwareConcurrency) {
          setLied(); // documented in the worker source
        }

        return hardwareConcurrency;
      }, 'hardwareConcurrency failed'),

      language: attempt(() => {
        const { language, languages } = navigator;

        if (language && languages) {
          // @ts-ignore
          const lang = /^.{0,2}/g.exec(language)[0];
          // @ts-ignore
          const langs = /^.{0,2}/g.exec(languages[0])[0];
          if (langs !== lang) {
            sendToTrash(
              'language/languages',
              `${[language, languages].join(' ')} mismatch`,
            );
          }
          return `${languages.join(', ')} (${language})`;
        }

        if (language !== workerScope.language) {
          lied = true;
          documentLie(
            'Navigator.language',
            `${language} does not match worker scope`,
          );
        }

        if (languages !== workerScope.languages) {
          lied = true;
          documentLie(
            'Navigator.languages',
            `${languages} does not match worker scope`,
          );
        }

        return `${language} ${languages}`;
      }, 'language(s) failed'),

      maxTouchPoints: attempt(() => {
        if (!('maxTouchPoints' in navigator)) {
          return null;
        }
        return navigator.maxTouchPoints;
      }, 'maxTouchPoints failed'),

      vendor: attempt(() => navigator.vendor, 'vendor failed'),

      mimeTypes: attempt(() => {
        const { mimeTypes } = navigator;
        return mimeTypes ? [...mimeTypes].map((m) => m.type) : [];
      }, 'mimeTypes failed'),

      // @ts-ignore
      oscpu: attempt(() => navigator.oscpu, 'oscpu failed'),

      plugins: getPlugins(setLied),

      properties: attempt(() => {
        const keys = Object.keys(Object.getPrototypeOf(navigator));
        return keys;
      }, 'navigator keys failed'),
    };

    // Collect async data in parallel
    await queueEvent(timer);
    const [userAgentData, bluetoothAvailability, permissions, webgpu] =
      await Promise.all([
        getUserAgentData(),
        getBluetoothAvailability(),
        getPermissions(),
        getWebGpu(),
      ]);

    logTestResult({ time: timer.stop(), test: 'navigator', passed: true });

    return {
      ...data,
      userAgentData,
      bluetoothAvailability,
      permissions,
      webgpu,
      lied,
    };
  } catch (error) {
    logTestResult({ test: 'navigator', passed: false });
    captureError(error, 'Navigator failed or blocked by client');
    return undefined;
  }
}
