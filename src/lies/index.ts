/**
 * Lie Detection Module
 *
 * This module detects if browser APIs have been modified, wrapped in proxies,
 * or otherwise tampered with. This is critical for bot detection because
 * automation tools commonly modify APIs to:
 *
 * - **Spoof fingerprints**: Return fake values for navigator, screen, etc.
 * - **Hide automation**: Mask webdriver flags, headless indicators
 * - **Bypass security**: Modify permission checks, disable features
 *
 * ## How lie detection works:
 *
 * Native browser functions have specific behaviors that are hard to replicate:
 * 1. **toString()**: Returns "[native code]" in a specific format
 * 2. **Error handling**: Throws specific TypeError messages/stacks
 * 3. **Property descriptors**: Have specific enumerable/configurable flags
 * 4. **Prototype chain**: Follow expected inheritance patterns
 *
 * When functions are wrapped in Proxies or replaced, these behaviors change
 * in detectable ways. This module tests dozens of checks per function.
 *
 * ## Phantom Darkness (Isolated Testing):
 *
 * Some extensions only modify the main window's APIs. To detect this, we
 * create nested iframes ("phantom darkness") and test APIs there too.
 * If the iframe's APIs differ from the main window, tampering is detected.
 *
 * @module lies
 */

/* eslint-disable new-cap */
/* eslint-disable no-unused-vars */
import { captureError } from '../errors';
import {
  IS_BLINK,
  IS_WEBKIT,
  IS_GECKO,
  IS_WORKER_SCOPE,
} from '../utils/helpers';
import {
  GHOST_STYLES,
  STACK_TRACE_PATTERNS,
  getKnownToStringFormats,
} from './constants';
import type {
  LieRecords,
  ErrorTrap,
  LieQueryResult,
  LieQueryConfig,
  SearchConfig,
  PrototypeLiesResult,
  LieDetector,
  PluginLiesResult,
  LiesResult,
  PhantomIframe,
  LieRecordsManager,
} from './types';

// ============================================================================
// WARM UP
// ============================================================================

/**
 * Warm up speech synthesis before lie detection.
 * Some browsers lazily initialize this API, so we trigger it early
 * to ensure consistent timing during detection.
 */
try {
  speechSynthesis.getVoices();
} catch (err) {
  // Ignore - speech synthesis may not be available
}

// ============================================================================
// LIE RECORDS MANAGEMENT
// ============================================================================

/**
 * Creates a manager for recording detected lies.
 *
 * Lies are stored by API name (e.g., "Navigator.userAgent") with an array
 * of lie types describing what was detected (e.g., "failed toString").
 *
 * @returns Manager object with getRecords and documentLie methods
 */
function createLieRecords(): LieRecordsManager {
  const records: LieRecords = {};

  return {
    getRecords: () => records,
    documentLie: (name: string, lie: string | string[]) => {
      const isArray = lie instanceof Array;
      if (records[name]) {
        if (isArray) {
          return (records[name] = [...records[name], ...lie]);
        }
        return records[name].push(lie) as unknown as string[];
      }
      return isArray ? (records[name] = lie) : (records[name] = [lie]);
    },
  };
}

const lieRecords = createLieRecords();
const { documentLie } = lieRecords;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a random string for unique element IDs.
 *
 * Used to create unique identifiers for test elements (iframes, divs)
 * that won't conflict with page elements or be predictable.
 *
 * @returns Random alphanumeric string
 */
function getRandomValues(): string {
  return (
    String.fromCharCode(Math.random() * 26 + 97) +
    Math.random().toString(36).slice(-7)
  );
}

/** Random value for this session (used in prototype chain tests) */
const RAND = getRandomValues();

/** Whether Reflect API is available */
const HAS_REFLECT = 'Reflect' in self;

/**
 * Checks if an error is a TypeError.
 *
 * Many lie detection tests expect TypeError to be thrown. If a different
 * error type is thrown, it may indicate tampering.
 */
function isTypeError(err: unknown): boolean {
  return (err as Error).constructor.name === 'TypeError';
}

/**
 * Tests if a function call fails with the expected TypeError.
 *
 * This is a core lie detection technique. Native functions throw specific
 * TypeErrors when called incorrectly. If the error is different, or no
 * error is thrown, the function may have been modified.
 *
 * @param config - Error trap configuration
 * @returns true if the test indicates tampering
 */
function failsTypeError({ spawnErr, withStack, final }: ErrorTrap): boolean {
  try {
    spawnErr();
    throw Error();
  } catch (err) {
    if (!isTypeError(err)) return true;
    return withStack ? withStack(err as Error) : false;
  } finally {
    final && final();
  }
}

/**
 * Tests if a function call throws any error.
 *
 * @param fn - Function to test
 * @returns true if the function throws
 */
function failsWithError(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    return true;
  }
}

/**
 * Validates error stack trace contains expected pattern.
 *
 * Error stack traces reveal information about how functions were called.
 * Proxy-wrapped functions produce different stack traces than native ones.
 *
 * @param err - Error object to check
 * @param reg - Regex pattern to match
 * @param i - Line index to check (0 for message, 1+ for stack lines)
 */
function hasValidStack(err: Error, reg: RegExp, i: number = 1): boolean {
  if (i === 0) return reg.test(err.message);
  return reg.test(err.stack?.split('\n')[i] || '');
}

// ============================================================================
// PHANTOM DARKNESS (Isolated iFrame Testing)
// ============================================================================

/**
 * Creates a deeply nested iframe for isolated API testing ("Behemoth").
 *
 * Extensions often only hook the main window. By creating a nested iframe
 * (iframe inside iframe), we can access APIs that may not be modified.
 * This is called "Behemoth" because it's a larger, more isolated context.
 *
 * Only used in Blink browsers where this technique is most effective.
 *
 * @param win - Parent window to create iframe in
 * @returns ContentWindow of the nested iframe, or original window on failure
 */
function getBehemothIframe(win: Window): Window | null {
  try {
    if (!IS_BLINK) return win;

    const div = win.document.createElement('div');
    div.setAttribute('id', getRandomValues());
    div.setAttribute('style', GHOST_STYLES);
    div.innerHTML = `<div><iframe></iframe></div>`;
    win.document.body.appendChild(div);
    const iframe = [
      ...[...div.childNodes][0].childNodes,
    ][0] as HTMLIFrameElement;

    if (!iframe) return null;

    const { contentWindow } = iframe || {};
    if (!contentWindow) return null;

    // Create another nested iframe for even more isolation
    const div2 = contentWindow.document.createElement('div');
    div2.innerHTML = `<div><iframe></iframe></div>`;
    contentWindow.document.body.appendChild(div2);
    const iframe2 = [
      ...[...div2.childNodes][0].childNodes,
    ][0] as HTMLIFrameElement;
    return iframe2.contentWindow;
  } catch (error) {
    captureError(error, 'client blocked behemoth iframe');
    return win;
  }
}

/**
 * Creates a phantom iframe for isolated API testing.
 *
 * The "phantom" is an invisible iframe used to access browser APIs
 * in an isolated context. Extensions that modify the main window's
 * APIs may not modify iframe APIs, allowing detection.
 *
 * @returns Object with iframe window reference and parent div for cleanup
 */
function getPhantomIframe(): PhantomIframe {
  if (IS_WORKER_SCOPE) {
    return { iframeWindow: self as Window & typeof globalThis };
  }

  try {
    const numberOfIframes = self.length;
    const frag = new DocumentFragment();
    const div = document.createElement('div');
    const id = getRandomValues();
    div.setAttribute('id', id);
    frag.appendChild(div);
    div.innerHTML = `<div style="${GHOST_STYLES}"><iframe></iframe></div>`;
    document.body.appendChild(frag);
    const iframeWindow = self[numberOfIframes];
    const phantomWindow = getBehemothIframe(iframeWindow as Window);
    return {
      iframeWindow: (phantomWindow || self) as Window & typeof globalThis,
      div,
    };
  } catch (error) {
    captureError(error, 'client blocked phantom iframe');
    return { iframeWindow: self as Window & typeof globalThis };
  }
}

// Create the phantom iframe on module load
const { iframeWindow: PHANTOM_DARKNESS, div: PARENT_PHANTOM } =
  getPhantomIframe() || {};

// ============================================================================
// CORE LIE DETECTION
// ============================================================================

/**
 * Comprehensive lie detection for a single API function.
 *
 * This is the heart of lie detection. It runs dozens of tests on a function
 * to detect if it's been modified, wrapped in a Proxy, or otherwise tampered.
 *
 * ## Test Categories:
 *
 * 1. **Error Tests**: Functions should throw specific TypeErrors
 * 2. **toString Tests**: Should return "[native code]" format
 * 3. **Descriptor Tests**: Should have expected property descriptors
 * 4. **Prototype Tests**: Should follow expected prototype chain
 * 5. **Proxy Detection**: Advanced tests to detect Proxy wrappers
 *
 * @param config - Configuration with scope, function, and proto
 * @returns Object with lied count and list of lie types
 */
function queryLies({
  scope,
  apiFunction,
  proto,
  obj,
  lieProps,
}: LieQueryConfig): LieQueryResult {
  if (typeof apiFunction !== 'function') {
    return { lied: 0, lieTypes: [] };
  }

  const name = apiFunction.name.replace(/get\s/, '');
  const objName = (obj as { name?: string })?.name;
  const nativeProto = Object.getPrototypeOf(apiFunction);

  // Build initial lie detection tests
  let lies: Record<string, boolean> = {
    // Test 1: Accessing prototype[name] should throw TypeError for certain objects
    ['failed illegal error']:
      !!obj &&
      failsTypeError({
        spawnErr: () =>
          (obj as { prototype: Record<string, unknown> }).prototype[name],
      }),

    // Test 2: Screen/Navigator properties shouldn't have own property descriptors
    ['failed undefined properties']:
      !!obj &&
      /^(screen|navigator)$/i.test(objName || '') &&
      !!(
        Object.getOwnPropertyDescriptor(
          self[(objName?.toLowerCase() || '') as 'screen' | 'navigator'],
          name,
        ) ||
        (HAS_REFLECT &&
          Reflect.getOwnPropertyDescriptor(
            self[(objName?.toLowerCase() || '') as 'screen' | 'navigator'],
            name,
          ))
      ),

    // Test 3: Calling with wrong context should throw TypeError
    ['failed call interface error']: failsTypeError({
      spawnErr: () => {
        // @ts-expect-error - Testing invalid usage
        new apiFunction();
        apiFunction.call(proto);
      },
    }),

    // Test 4: Apply with wrong context should throw TypeError
    ['failed apply interface error']: failsTypeError({
      spawnErr: () => {
        // @ts-expect-error - Testing invalid usage
        new apiFunction();
        apiFunction.apply(proto);
      },
    }),

    // Test 5: Constructor call should throw TypeError
    ['failed new instance error']: failsTypeError({
      // @ts-expect-error - Testing invalid usage
      spawnErr: () => new apiFunction(),
    }),

    // Test 6: Class extension should throw TypeError (not in WebKit)
    ['failed class extends error']:
      !IS_WEBKIT &&
      failsTypeError({
        spawnErr: () => {
          // @ts-expect-error - Testing invalid usage
          class Fake extends apiFunction {}
        },
      }),

    // Test 7: Setting null prototype and calling toString should throw
    ['failed null conversion error']: failsTypeError({
      spawnErr: () => Object.setPrototypeOf(apiFunction, null).toString(),
      final: () => Object.setPrototypeOf(apiFunction, nativeProto),
    }),

    // Test 8: toString() should return known native code format
    ['failed toString']:
      !getKnownToStringFormats(name)[
        scope.Function.prototype.toString.call(apiFunction)
      ] ||
      !getKnownToStringFormats('toString')[
        scope.Function.prototype.toString.call(apiFunction.toString)
      ],

    // Test 9: Native functions shouldn't have a prototype property
    ['failed "prototype" in function']: 'prototype' in apiFunction,

    // Test 10: Native functions shouldn't have arguments/caller/prototype descriptors
    ['failed descriptor']: !!(
      Object.getOwnPropertyDescriptor(apiFunction, 'arguments') ||
      Reflect.getOwnPropertyDescriptor(apiFunction, 'arguments') ||
      Object.getOwnPropertyDescriptor(apiFunction, 'caller') ||
      Reflect.getOwnPropertyDescriptor(apiFunction, 'caller') ||
      Object.getOwnPropertyDescriptor(apiFunction, 'prototype') ||
      Reflect.getOwnPropertyDescriptor(apiFunction, 'prototype') ||
      Object.getOwnPropertyDescriptor(apiFunction, 'toString') ||
      Reflect.getOwnPropertyDescriptor(apiFunction, 'toString')
    ),

    // Test 11: Native functions shouldn't have own properties beyond length/name
    ['failed own property']: !!(
      apiFunction.hasOwnProperty('arguments') ||
      apiFunction.hasOwnProperty('caller') ||
      apiFunction.hasOwnProperty('prototype') ||
      apiFunction.hasOwnProperty('toString')
    ),

    // Test 12: Descriptor keys should only be length,name
    ['failed descriptor keys']:
      Object.keys(Object.getOwnPropertyDescriptors(apiFunction))
        .sort()
        .toString() !== 'length,name',

    // Test 13: Own property names should only be length,name
    ['failed own property names']:
      Object.getOwnPropertyNames(apiFunction).sort().toString() !==
      'length,name',

    // Test 14: Reflect.ownKeys should only return length,name
    ['failed own keys names']:
      HAS_REFLECT &&
      Reflect.ownKeys(apiFunction).sort().toString() !== 'length,name',

    // Test 15-16: Proxy detection via Object.create and toString
    ['failed object toString error']:
      failsTypeError({
        spawnErr: () => Object.create(apiFunction).toString(),
        withStack: (err) =>
          IS_BLINK && !hasValidStack(err, STACK_TRACE_PATTERNS.AT_FUNCTION),
      }) ||
      failsTypeError({
        spawnErr: () => Object.create(new Proxy(apiFunction, {})).toString(),
        withStack: (err) =>
          IS_BLINK && !hasValidStack(err, STACK_TRACE_PATTERNS.AT_OBJECT),
      }),

    // Test 17: Arguments/caller access should fail in strict mode (Gecko)
    ['failed at incompatible proxy error']: failsTypeError({
      spawnErr: () => {
        // @ts-expect-error - Testing invalid usage
        apiFunction.arguments;
        // @ts-expect-error - Testing invalid usage
        apiFunction.caller;
      },
      withStack: (err) =>
        IS_GECKO && !hasValidStack(err, STACK_TRACE_PATTERNS.STRICT_MODE, 0),
    }),

    // Test 18: toString's arguments/caller should also fail
    ['failed at toString incompatible proxy error']: failsTypeError({
      spawnErr: () => {
        // @ts-expect-error - Testing invalid usage
        apiFunction.toString.arguments;
        // @ts-expect-error - Testing invalid usage
        apiFunction.toString.caller;
      },
      withStack: (err) =>
        IS_GECKO && !hasValidStack(err, STACK_TRACE_PATTERNS.STRICT_MODE, 0),
    }),

    // Test 19: Circular prototype should cause recursion error
    ['failed at too much recursion error']: failsTypeError({
      spawnErr: () => {
        Object.setPrototypeOf(
          apiFunction,
          Object.create(apiFunction),
        ).toString();
      },
      final: () => Object.setPrototypeOf(apiFunction, nativeProto),
    }),
  };

  // Advanced Proxy Detection
  // Only run these expensive tests if we've already detected issues
  // or if this is a critical function like toString
  const detectProxies =
    name === 'toString' ||
    !!lieProps['Function.toString'] ||
    !!lieProps['Permissions.query'];

  if (detectProxies) {
    const proxy1 = new Proxy(apiFunction, {});
    const proxy2 = new Proxy(apiFunction, {});
    const proxy3 = new Proxy(apiFunction, {});

    lies = {
      ...lies,
      // Test 20: __proto__ modification should work differently for proxies
      ['failed at too much recursion __proto__ error']: !failsTypeError({
        spawnErr: () => {
          // @ts-expect-error - Testing invalid usage
          apiFunction.__proto__ = proxy1;
          // @ts-expect-error - Testing invalid usage
          apiFunction++;
        },
        final: () => Object.setPrototypeOf(apiFunction, nativeProto),
      }),

      // Test 21: Proxy chain cycle detection
      ['failed at chain cycle error']: !failsTypeError({
        spawnErr: () => {
          Object.setPrototypeOf(proxy1, Object.create(proxy1)).toString();
        },
        final: () => Object.setPrototypeOf(proxy1, nativeProto),
      }),

      // Test 22: Proxy __proto__ cycle detection
      ['failed at chain cycle __proto__ error']: !failsTypeError({
        spawnErr: () => {
          // @ts-expect-error - Testing invalid usage
          proxy2.__proto__ = proxy2;
          // @ts-expect-error - Testing invalid usage
          proxy2++;
        },
        final: () => Object.setPrototypeOf(proxy2, nativeProto),
      }),

      // Test 23: Reflect.setPrototypeOf behavior
      ['failed at reflect set proto']:
        HAS_REFLECT &&
        failsTypeError({
          spawnErr: () => {
            Reflect.setPrototypeOf(apiFunction, Object.create(apiFunction));
            RAND in apiFunction;
            throw new TypeError();
          },
          final: () => Object.setPrototypeOf(apiFunction, nativeProto),
        }),

      // Test 24: Proxy should behave differently with Reflect.setPrototypeOf
      ['failed at reflect set proto proxy']:
        HAS_REFLECT &&
        !failsTypeError({
          spawnErr: () => {
            Reflect.setPrototypeOf(proxy3, Object.create(proxy3));
            RAND in proxy3;
          },
          final: () => Object.setPrototypeOf(proxy3, nativeProto),
        }),

      // Test 25: instanceof checks have different stack traces for proxies (Blink)
      ['failed at instanceof check error']:
        IS_BLINK &&
        (failsTypeError({
          spawnErr: () => {
            apiFunction instanceof apiFunction;
          },
          withStack: (err) =>
            !hasValidStack(err, STACK_TRACE_PATTERNS.FUNCTION_INSTANCE),
        }) ||
          failsTypeError({
            spawnErr: () => {
              const proxy = new Proxy(apiFunction, {});
              proxy instanceof proxy;
            },
            withStack: (err) =>
              !hasValidStack(err, STACK_TRACE_PATTERNS.PROXY_INSTANCE),
          })),

      // Test 26: defineProperty behavior (Blink)
      ['failed at define properties']:
        IS_BLINK &&
        HAS_REFLECT &&
        failsWithError(() => {
          Object.defineProperty(apiFunction, '', {
            configurable: true,
          }).toString();
          Reflect.deleteProperty(apiFunction, '');
        }),
    };
  }

  // Collect all failed tests
  const lieTypes = Object.keys(lies).filter((key) => !!lies[key]);
  return { lied: lieTypes.length, lieTypes };
}

// ============================================================================
// LIE DETECTOR FACTORY
// ============================================================================

/**
 * Creates a lie detector instance for searching APIs.
 *
 * The detector maintains state about which APIs have been tested and
 * what lies were found. It provides a searchLies method to test
 * specific APIs.
 *
 * @param scope - Window scope to test in
 * @returns Lie detector instance
 */
function createLieDetector(scope: Window & typeof globalThis): LieDetector {
  const isSupported = (obj: unknown) => typeof obj !== 'undefined' && !!obj;
  const props: Record<string, string[]> = {}; // lie list and detail
  const propsSearched: string[] = []; // list of properties searched

  return {
    getProps: () => props,
    getPropsSearched: () => propsSearched,
    searchLies: (fn: () => unknown, config?: SearchConfig): void => {
      const { target, ignore } = config || {};
      let obj: { prototype?: unknown; name?: string };

      // Check if API is blocked or not supported
      try {
        obj = fn() as typeof obj;
        if (!isSupported(obj)) {
          return;
        }
      } catch (error) {
        return;
      }

      const interfaceObject = obj.prototype ? obj.prototype : obj;

      // Get all property names to test
      [
        ...new Set([
          ...Object.getOwnPropertyNames(interfaceObject),
          ...Object.keys(interfaceObject),
        ]),
      ]
        .sort()
        .forEach((name) => {
          // Skip constructor and filtered properties
          const skip =
            name === 'constructor' ||
            (target && !new Set(target).has(name)) ||
            (ignore && new Set(ignore).has(name));
          if (skip) return;

          // Build API name string
          const objectNameString = /\s(.+)\]/;
          const apiName = `${
            obj.name
              ? obj.name
              : objectNameString.test(String(obj))
                ? objectNameString.exec(String(obj))?.[1]
                : undefined
          }.${name}`;

          propsSearched.push(apiName);

          try {
            const proto = obj.prototype ? obj.prototype : obj;
            let res: LieQueryResult;

            // Try to test as a function first
            try {
              const apiFunction = (proto as Record<string, unknown>)[name];
              if (typeof apiFunction === 'function') {
                res = queryLies({
                  scope,
                  apiFunction: apiFunction as Function,
                  proto,
                  obj: null,
                  lieProps: props,
                });
                if (res.lied) {
                  documentLie(apiName, res.lieTypes);
                  props[apiName] = res.lieTypes;
                  return;
                }
                return;
              }
              // Handle invalid values (not function, not constant)
              if (
                name !== 'name' &&
                name !== 'length' &&
                name[0] !== name[0].toUpperCase()
              ) {
                const lie = ['failed descriptor.value undefined'];
                documentLie(apiName, lie);
                props[apiName] = lie;
                return;
              }
            } catch (error) {
              // Function access failed, try getter
            }

            // Test as getter function
            const descriptor = Object.getOwnPropertyDescriptor(
              proto as object,
              name,
            );
            if (!descriptor?.get) return;

            res = queryLies({
              scope,
              apiFunction: descriptor.get,
              proto,
              obj, // Send obj for special tests
              lieProps: props,
            });

            if (res.lied) {
              documentLie(apiName, res.lieTypes);
              props[apiName] = res.lieTypes;
            }
          } catch (error) {
            const lie = 'failed prototype test execution';
            documentLie(apiName, lie);
            props[apiName] = [lie];
          }
        });
    },
  };
}

// ============================================================================
// MAIN LIE DETECTION
// ============================================================================

/**
 * Runs comprehensive lie detection across all major browser APIs.
 *
 * This is the main entry point for lie detection. It tests dozens of
 * browser APIs for signs of tampering, returning a complete report.
 *
 * @param scope - Window scope to test in (usually PHANTOM_DARKNESS)
 * @returns Complete lie detection results
 */
function getPrototypeLies(
  scope: Window & typeof globalThis,
): PrototypeLiesResult {
  const lieDetector = createLieDetector(scope);
  const { searchLies } = lieDetector;

  // Test Function.toString first - determines depth of other searches
  // If Function.toString is tampered, we need deeper proxy detection
  searchLies(() => Function, {
    target: ['toString'],
    ignore: ['caller', 'arguments'],
  });

  // Audio APIs
  searchLies(() => AnalyserNode);
  searchLies(() => AudioBuffer, {
    target: ['copyFromChannel', 'getChannelData'],
  });
  searchLies(() => BiquadFilterNode, { target: ['getFrequencyResponse'] });

  // Canvas APIs
  searchLies(() => CanvasRenderingContext2D, {
    target: [
      'getImageData',
      'getLineDash',
      'isPointInPath',
      'isPointInStroke',
      'measureText',
      'quadraticCurveTo',
      'fillText',
      'strokeText',
      'font',
    ],
  });

  // CSS APIs
  searchLies(() => CSSStyleDeclaration, { target: ['setProperty'] });
  // @ts-expect-error - Gecko-specific
  searchLies(() => CSS2Properties, { target: ['setProperty'] });

  // Date APIs
  searchLies(() => Date, {
    target: [
      'getDate',
      'getDay',
      'getFullYear',
      'getHours',
      'getMinutes',
      'getMonth',
      'getTime',
      'getTimezoneOffset',
      'setDate',
      'setFullYear',
      'setHours',
      'setMilliseconds',
      'setMonth',
      'setSeconds',
      'setTime',
      'toDateString',
      'toJSON',
      'toLocaleDateString',
      'toLocaleString',
      'toLocaleTimeString',
      'toString',
      'toTimeString',
      'valueOf',
    ],
  });

  // GPU APIs
  // @ts-expect-error - May not be supported
  searchLies(() => GPU, { target: ['requestAdapter'] });
  // @ts-expect-error - May not be supported
  searchLies(() => GPUAdapter, { target: ['requestAdapterInfo'] });

  // Intl APIs
  searchLies(() => Intl.DateTimeFormat, {
    target: ['format', 'formatRange', 'formatToParts', 'resolvedOptions'],
  });

  // Document APIs
  searchLies(() => Document, {
    target: [
      'createElement',
      'createElementNS',
      'getElementById',
      'getElementsByClassName',
      'getElementsByName',
      'getElementsByTagName',
      'getElementsByTagNameNS',
      'referrer',
      'write',
      'writeln',
    ],
    ignore: ['onreadystatechange', 'onmouseenter', 'onmouseleave'],
  });

  // DOM Rect APIs
  searchLies(() => DOMRect);
  searchLies(() => DOMRectReadOnly);

  // Element APIs
  searchLies(() => Element, {
    target: [
      'append',
      'appendChild',
      'getBoundingClientRect',
      'getClientRects',
      'insertAdjacentElement',
      'insertAdjacentHTML',
      'insertAdjacentText',
      'insertBefore',
      'prepend',
      'replaceChild',
      'replaceWith',
      'setAttribute',
    ],
  });

  // Font APIs
  searchLies(() => FontFace, { target: ['family', 'load', 'status'] });

  // Canvas HTML element
  searchLies(() => HTMLCanvasElement);

  // HTML Element APIs
  searchLies(() => HTMLElement, {
    target: [
      'clientHeight',
      'clientWidth',
      'offsetHeight',
      'offsetWidth',
      'scrollHeight',
      'scrollWidth',
    ],
    ignore: ['onmouseenter', 'onmouseleave'],
  });

  // iFrame APIs
  searchLies(() => HTMLIFrameElement, {
    target: ['contentDocument', 'contentWindow'],
  });

  // Intersection Observer APIs
  searchLies(() => IntersectionObserverEntry, {
    target: ['boundingClientRect', 'intersectionRect', 'rootBounds'],
  });

  // Math APIs
  searchLies(() => Math, {
    target: [
      'acos',
      'acosh',
      'asinh',
      'atan',
      'atan2',
      'atanh',
      'cbrt',
      'cos',
      'cosh',
      'exp',
      'expm1',
      'log',
      'log10',
      'log1p',
      'sin',
      'sinh',
      'sqrt',
      'tan',
      'tanh',
    ],
  });

  // Media Device APIs
  searchLies(() => MediaDevices, {
    target: ['enumerateDevices', 'getDisplayMedia', 'getUserMedia'],
  });

  // Navigator APIs
  searchLies(() => Navigator, {
    target: [
      'appCodeName',
      'appName',
      'appVersion',
      'buildID',
      'connection',
      'deviceMemory',
      'getBattery',
      'getGamepads',
      'getVRDisplays',
      'hardwareConcurrency',
      'language',
      'languages',
      'maxTouchPoints',
      'mimeTypes',
      'oscpu',
      'platform',
      'plugins',
      'product',
      'productSub',
      'sendBeacon',
      'serviceWorker',
      'storage',
      'userAgent',
      'vendor',
      'vendorSub',
      'webdriver',
      'gpu',
    ],
  });

  // Node APIs
  searchLies(() => Node, {
    target: ['appendChild', 'insertBefore', 'replaceChild'],
  });

  // OffscreenCanvas APIs
  // @ts-expect-error - May not be supported
  searchLies(() => OffscreenCanvas, {
    target: ['convertToBlob', 'getContext'],
  });
  // @ts-expect-error - May not be supported
  searchLies(() => OffscreenCanvasRenderingContext2D, {
    target: [
      'getImageData',
      'getLineDash',
      'isPointInPath',
      'isPointInStroke',
      'measureText',
      'quadraticCurveTo',
      'font',
    ],
  });

  // Permissions APIs
  searchLies(() => Permissions, { target: ['query'] });

  // Range APIs
  searchLies(() => Range, {
    target: ['getBoundingClientRect', 'getClientRects'],
  });

  // Intl APIs
  // @ts-expect-error - May not be supported in older browsers
  searchLies(() => Intl.RelativeTimeFormat, { target: ['resolvedOptions'] });

  // Screen APIs
  searchLies(() => Screen);

  // Speech APIs
  searchLies(() => speechSynthesis, { target: ['getVoices'] });

  // String APIs
  searchLies(() => String, { target: ['fromCodePoint'] });

  // Storage APIs
  searchLies(() => StorageManager, { target: ['estimate'] });

  // SVG APIs
  searchLies(() => SVGRect);
  searchLies(() => SVGRectElement, { target: ['getBBox'] });
  searchLies(() => SVGTextContentElement, {
    target: ['getExtentOfChar', 'getSubStringLength', 'getComputedTextLength'],
  });

  // Text Metrics
  searchLies(() => TextMetrics);

  // WebGL APIs
  searchLies(() => WebGLRenderingContext, {
    target: ['bufferData', 'getParameter', 'readPixels'],
  });
  searchLies(() => WebGL2RenderingContext, {
    target: ['bufferData', 'getParameter', 'readPixels'],
  });

  // Return results
  const props = lieDetector.getProps();
  const propsSearched = lieDetector.getPropsSearched();

  return {
    lieDetector,
    lieList: Object.keys(props).sort(),
    lieDetail: props,
    lieCount: Object.keys(props).reduce(
      (acc, key) => acc + props[key].length,
      0,
    ),
    propsSearched,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Run lie detection on module load
const start = performance.now();
const { lieDetector, lieList, lieDetail, propsSearched } = getPrototypeLies(
  PHANTOM_DARKNESS as Window & typeof globalThis,
);

/**
 * Filter out Function.toString lies when determining API trust.
 *
 * Some lies are about the toString proxy wrapper rather than the
 * actual API function. These are less severe and can be filtered.
 */
const getNonFunctionToStringLies = (x: string[]): number =>
  !x
    ? 0
    : x.filter(
        (item) => !/object toString|toString incompatible proxy/.test(item),
      ).length;

let lieProps: Record<string, number>;
let prototypeLies: LieRecords;
let PROTO_BENCHMARK = 0;

if (!IS_WORKER_SCOPE) {
  // Convert lie arrays to counts (excluding toString-related lies)
  lieProps = (() => {
    const props = lieDetector.getProps();
    return Object.keys(props).reduce(
      (acc, key) => {
        acc[key] = getNonFunctionToStringLies(props[key]);
        return acc;
      },
      {} as Record<string, number>,
    );
  })();

  prototypeLies = JSON.parse(JSON.stringify(lieDetail));
  const perf = performance.now() - start;
  PROTO_BENCHMARK = +perf.toFixed(2);

  const message = `${propsSearched.length} API properties analyzed in ${PROTO_BENCHMARK}ms (${lieList.length} corrupted)`;
  setTimeout(() => console.log(message), 3000);
}

// ============================================================================
// PLUGIN VALIDATION
// ============================================================================

/**
 * Validates browser plugins and mimeTypes for tampering.
 *
 * Plugins and mimeTypes have cross-references that should be consistent.
 * If a plugin claims to support a mimeType that doesn't exist, or vice
 * versa, tampering is detected.
 *
 * @param plugins - Browser's PluginArray
 * @param mimeTypes - Browser's MimeTypeArray
 * @returns Validated plugins/mimeTypes and any detected lies
 */
function getPluginLies(
  plugins: PluginArray,
  mimeTypes: MimeTypeArray,
): PluginLiesResult {
  const lies: string[] = [];
  const pluginsOwnPropertyNames = Object.getOwnPropertyNames(plugins).filter(
    (name) => isNaN(+name),
  );
  const mimeTypesOwnPropertyNames = Object.getOwnPropertyNames(
    mimeTypes,
  ).filter((name) => isNaN(+name));

  // Cast to arrays for easier processing
  const pluginsList = [...plugins] as Plugin[];
  const mimeTypesList = [...mimeTypes] as MimeType[];

  // Get initial trusted mimeType names
  const trustedMimeTypes = new Set(mimeTypesOwnPropertyNames);

  // Get initial trusted plugin names
  const excludeDuplicates = <T>(arr: T[]): T[] => [...new Set(arr)];
  const mimeTypeEnabledPlugins = excludeDuplicates(
    mimeTypesList.map((mimeType) => mimeType.enabledPlugin),
  );
  const trustedPluginNames = new Set(pluginsOwnPropertyNames);
  const mimeTypeEnabledPluginsNames = mimeTypeEnabledPlugins.map(
    (plugin) => plugin && plugin.name,
  );
  const trustedPluginNamesArray = [...trustedPluginNames];

  trustedPluginNamesArray.forEach((name) => {
    const validName = new Set(mimeTypeEnabledPluginsNames).has(name);
    if (!validName) {
      trustedPluginNames.delete(name);
    }
  });

  // Check 1: Each plugin should contain valid MimeType objects
  const invalidPlugins = pluginsList.filter((plugin) => {
    try {
      const validMimeType =
        Object.getPrototypeOf(plugin[0]).constructor.name === 'MimeType';
      if (!validMimeType) {
        trustedPluginNames.delete(plugin.name);
      }
      return !validMimeType;
    } catch (error) {
      trustedPluginNames.delete(plugin.name);
      return true; // Sign of tampering
    }
  });

  if (invalidPlugins.length) {
    lies.push('missing mimetype');
  }

  // Check 2: Each plugin's mimeTypes should be in the global mimeTypes list
  const pluginMimeTypes = pluginsList
    .map((plugin) => Object.values(plugin))
    .flat();
  const pluginMimeTypesNames = pluginMimeTypes.map(
    (mimetype) => (mimetype as MimeType).type,
  );

  pluginMimeTypesNames.forEach((name) => {
    const validName = trustedMimeTypes.has(name);
    if (!validName) {
      trustedMimeTypes.delete(name);
    }
  });

  pluginsList.forEach((plugin) => {
    const mimeTypes = Object.values(plugin).map((mimetype) => mimetype.type);
    mimeTypes.forEach((mimetype) => {
      if (!trustedMimeTypes.has(mimetype)) {
        lies.push('invalid mimetype');
        trustedPluginNames.delete(plugin.name);
      }
    });
  });

  return {
    validPlugins: pluginsList.filter((plugin) =>
      trustedPluginNames.has(plugin.name),
    ),
    validMimeTypes: mimeTypesList.filter((mimeType) =>
      trustedMimeTypes.has(mimeType.type),
    ),
    lies: [...new Set(lies)], // Remove duplicates
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Gets all recorded lies.
 *
 * @returns Object with lie data and total count
 */
function getLies(): LiesResult {
  const records = lieRecords.getRecords();
  const totalLies = Object.keys(records).reduce((acc, key) => {
    acc += records[key].length;
    return acc;
  }, 0);
  return { data: records, totalLies };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getRandomValues,
  documentLie,
  createLieDetector,
  PHANTOM_DARKNESS,
  PARENT_PHANTOM,
  lieProps,
  prototypeLies,
  lieRecords,
  getLies,
  getPluginLies,
  PROTO_BENCHMARK,
};
