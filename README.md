# Argus

Browser fingerprinting library for fraud detection and device identification. Collects stable, high-entropy signals across 28 fingerprinting modules to generate unique device identifiers.

## Quick Start

```typescript
import getFingerprint from 'argus';

const fp = await getFingerprint();
console.log(fp.$hash); // Unique device hash
```

## Architecture

```
src/
├── fingerprint.ts      # Main orchestrator - runs all modules in parallel
├── [28 modules]/       # Individual fingerprinting modules
├── errors/             # Error capture and normalization
├── utils/              # Shared utilities (crypto, helpers)
└── types.ts            # Shared type definitions

rust/
└── wasm-fingerprint/   # High-precision CPU/memory benchmarking
```

---

## Fingerprinting Modules

### Audio (`src/audio/`)

**What it does:** Creates an AudioContext and analyzes the audio processing pipeline.

**How it works:**
1. Creates OfflineAudioContext with specific parameters
2. Generates a triangle wave through an oscillator
3. Applies dynamic compression
4. Renders and captures the output waveform
5. Hashes the resulting audio buffer values

**Value:** HIGH entropy. Audio processing varies by hardware audio chipset, driver version, and browser audio implementation. Stable across sessions. Detects VM/emulator inconsistencies.

---

### Canvas 2D (`src/canvas/`)

**What it does:** Renders text and graphics to a 2D canvas, captures pixel data.

**How it works:**
1. Draws emoji, Unicode text, and geometric shapes
2. Applies various blending modes and filters
3. Captures canvas as data URL and hashes pixels
4. Tests specific rendering features (emoji rendering, text metrics)

**Value:** HIGH entropy. GPU, graphics driver, font rendering, and anti-aliasing all affect output. Very stable fingerprint component.

---

### WebGL (`src/webgl/`)

**What it does:** Queries WebGL context for renderer info, extensions, and parameters.

**How it works:**
1. Creates WebGL and WebGL2 contexts
2. Uses WEBGL_debug_renderer_info extension to get GPU vendor/renderer
3. Queries all supported extensions
4. Reads shader precision formats and parameter limits

**Value:** HIGH entropy. GPU model is highly identifying. Extension support varies by driver version.

**Signals collected:**
- `vendor` / `renderer` - GPU identification (e.g., "NVIDIA Corporation", "GeForce RTX 3080")
- `extensions` - List of supported WebGL extensions
- `parameters` - MAX_TEXTURE_SIZE, MAX_VERTEX_ATTRIBS, etc.

---

### WebGL2 (`src/webgl2/`)

**What it does:** Extended WebGL2-specific parameter collection.

**How it works:** Queries WebGL2-specific limits and capabilities not available in WebGL1.

**Value:** MEDIUM entropy. Adds granularity to GPU fingerprint.

---

### WebGPU (`src/webgpu/`)

**What it does:** Queries WebGPU adapter for GPU info and limits.

**How it works:**
1. Requests GPU adapter
2. Reads adapter info (vendor, architecture, device, description)
3. Queries all limit values

**Value:** HIGH entropy. WebGPU provides more detailed GPU info than WebGL. Not universally supported yet.

---

### WebGPU Compute (`src/webgpu-compute/`)

**What it does:** Runs compute shader to detect GPU computational characteristics.

**How it works:**
1. Creates compute pipeline with known algorithm
2. Executes shader and reads results
3. Measures execution time and validates output

**Value:** MEDIUM entropy. GPU compute behavior varies by architecture. Gracefully returns `{supported: false}` on Firefox and unsupported browsers.

---

### Fonts (`src/fonts/`)

**What it does:** Detects installed fonts by measuring text rendering width.

**How it works:**
1. Renders test strings with fallback fonts
2. Measures resulting text width
3. Compares against reference width to detect font availability
4. Tests ~200 common fonts

**Value:** HIGH entropy. Installed font set varies significantly by OS, language, installed applications. Very stable.

---

### Screen (`src/screen/`)

**What it does:** Collects screen and display properties.

**How it works:** Reads screen API and window properties.

**Signals collected:**
- `width` / `height` - Screen resolution
- `availWidth` / `availHeight` - Available screen area
- `colorDepth` / `pixelDepth` - Color information
- `devicePixelRatio` - Display scaling
- `orientation` - Portrait/landscape

**Value:** MEDIUM entropy. Common resolutions reduce uniqueness, but combinations with DPR and available dimensions add value.

---

### Navigator (`src/navigator/`)

**What it does:** Collects browser and OS information from navigator object.

**How it works:** Reads navigator properties with lie detection.

**Signals collected:**
- `userAgent`, `platform`, `vendor`
- `language`, `languages`
- `hardwareConcurrency` - CPU core count
- `deviceMemory` - RAM (approximated)
- `maxTouchPoints` - Touch capability
- `pdfViewerEnabled`, `cookieEnabled`
- `webdriver` - Automation detection

**Value:** HIGH entropy collectively. Individual signals are common but combinations are identifying.

---

### User-Agent Client Hints (`src/navigator/clientHints.ts`)

**What it does:** Collects high-entropy UA-CH data when available.

**How it works:**
1. Calls `navigator.userAgentData.getHighEntropyValues()`
2. Requests brands, platform, model, versions

**Signals collected:**
- `brands` - Browser brand versions
- `platform` / `platformVersion` - OS info
- `architecture` / `bitness` - CPU architecture
- `model` - Device model (mobile)
- `mobile` / `formFactor`

**Value:** HIGH entropy. More detailed than user-agent string. Chrome 90+.

---

### CSS (`src/css/`)

**What it does:** Detects CSS feature support and computed values.

**How it works:**
1. Uses `CSS.supports()` for feature detection
2. Measures computed style values
3. Detects CSS vendor prefixes

**Value:** LOW-MEDIUM entropy. Useful for browser version detection.

---

### CSS Media (`src/cssMedia/`)

**What it does:** Queries media features and user preferences.

**How it works:** Tests media queries for various features.

**Signals collected:**
- `colorScheme` - prefers-color-scheme (light/dark)
- `reducedMotion` - prefers-reduced-motion
- `colorGamut` - Display color capability
- `contrast` - prefers-contrast
- `forcedColors` - High contrast mode
- `monochrome` - Monochrome display
- `invertedColors` - Inverted colors setting

**Value:** MEDIUM entropy. User preference signals vary by OS settings.

---

### Timezone (`src/timezone/`)

**What it does:** Captures timezone information.

**How it works:**
1. Gets timezone from `Intl.DateTimeFormat`
2. Calculates UTC offset
3. Cross-validates offset via worker

**Signals collected:**
- `zone` - Raw timezone string
- `location` - IANA timezone (e.g., "America/Chicago")
- `offset` - UTC offset in minutes
- `offsetComputed` - Cross-validation offset
- `lied` - Inconsistency detected

**Value:** LOW entropy (few hundred timezones) but useful for lie detection and geo-validation.

---

### Intl (`src/intl/`)

**What it does:** Probes Intl API for locale-specific formatting.

**How it works:**
1. Creates formatters (DateTimeFormat, NumberFormat, etc.)
2. Tests formatting of known values
3. Collects locale-specific results

**Value:** MEDIUM entropy. Locale settings and formatting variations.

---

### Timing (`src/timing/`)

**What it does:** Collects timing data for server-side clock skew analysis.

**How it works:**
1. Takes timestamp samples from multiple sources (performance.now, Date.now)
2. Measures timer resolution
3. Calculates drift between clock sources
4. Collects high-precision samples if crossOriginIsolated

**Signals collected:**
- `start` / `end` - Timestamp samples (perfNow, dateNow, monotonic)
- `perfElapsed` / `dateElapsed` - Time elapsed by each clock
- `drift` - Difference between elapsed times (tampering indicator)
- `resolution` - Timer precision (~1ms normal, ~0.005ms with COOP/COEP)
- `timeOrigin` - Page start time
- `samples` - High-precision samples (only with COOP/COEP headers)

**Value:** Server-side analysis. Each device's crystal oscillator has unique drift characteristics. Over multiple visits, server builds a "clock fingerprint" from drift patterns.

---

### WASM Benchmarks (`src/wasm/`)

**What it does:** Runs CPU/memory benchmarks via WebAssembly for hardware fingerprinting.

**How it works:**
1. Compiles Rust-based WASM module
2. Executes standardized stress tests:
   - CPU stress (integer operations)
   - FPU stress (floating-point operations)
   - RAM stress (memory allocation patterns)
   - Branch prediction stress
   - JIT compilation stress
3. Measures execution times with high precision

**Value:** HIGH entropy. CPU microarchitecture, cache sizes, and JIT behavior create unique timing signatures. Stable per device.

---

### Worker Scope (`src/workerScope/`)

**What it does:** Collects fingerprint from a Web Worker context.

**How it works:**
1. Creates dedicated worker
2. Runs fingerprinting inside worker
3. Compares with main thread values

**Value:** Lie detection. Worker and main thread should match. Inconsistencies indicate spoofing.

---

### Service Worker (`src/serviceWorker/`)

**What it does:** Detects service worker support and registration.

**How it works:** Checks navigator.serviceWorker availability and registration status.

**Value:** LOW entropy but useful for detecting controlled browser environments.

---

### HTML Elements (`src/htmlElements/`)

**What it does:** Probes HTML element behavior and properties.

**How it works:**
1. Creates various HTML elements
2. Tests default property values
3. Detects browser-specific implementations

**Value:** LOW-MEDIUM entropy. Browser-specific quirks.

---

### Window Features (`src/windowFeatures/`)

**What it does:** Detects available window properties and functions.

**How it works:** Enumerates window object properties and checks for specific features.

**Value:** LOW-MEDIUM entropy. Detects polyfills and modifications.

---

### Document Properties (`src/document/`)

**What it does:** Collects document-level properties.

**How it works:** Reads document properties and tests behavior.

**Value:** LOW entropy. Environment detection.

---

### Math (`src/math/`)

**What it does:** Tests Math function precision.

**How it works:** Evaluates transcendental functions (sin, cos, tan, etc.) and checks precision of results.

**Value:** MEDIUM entropy. JavaScript engine and CPU FPU differences create variations.

---

### Console (`src/console/`)

**What it does:** Detects console object tampering.

**How it works:** Checks console methods for modifications.

**Value:** Lie detection. Modified console often indicates anti-fingerprinting tools.

---

### Speech (`src/speech/`)

**What it does:** Collects available speech synthesis voices.

**How it works:** Queries `speechSynthesis.getVoices()` for available TTS voices.

**Value:** HIGH entropy. Voice list varies by OS, language packs, installed applications.

---

### Permissions (`src/permissions/`)

**What it does:** Queries permission states.

**How it works:** Uses `navigator.permissions.query()` for various permissions.

**Value:** LOW-MEDIUM entropy. Permission states vary by user settings and site history.

---

### Storage (`src/storage/`)

**What it does:** Tests storage API availability and quotas.

**How it works:** Checks localStorage, sessionStorage, IndexedDB availability and estimates.

**Value:** LOW entropy. Detects private browsing and storage restrictions.

---

### DOM Rect (`src/domRect/`)

**What it does:** Measures element bounding rectangles.

**How it works:** Creates elements and reads `getBoundingClientRect()` values.

**Value:** MEDIUM entropy. Subpixel rendering varies by display scaling and GPU.

---

### Text Metrics (`src/textMetrics/`)

**What it does:** Measures advanced text rendering metrics.

**How it works:**
1. Renders test strings on canvas
2. Measures actualBoundingBox, fontBoundingBox
3. Tests alphabetic/hanging baselines

**Value:** HIGH entropy. Font rendering varies by OS, GPU, driver. Uses extended TextMetrics API (Chrome 80+).

---

### SVG (`src/svg/`)

**What it does:** Tests SVG rendering and filter capabilities.

**How it works:** Creates SVG elements with filters and measures output.

**Value:** MEDIUM entropy. SVG rendering varies by browser and GPU.

---

### Resistance (`src/resistance/`)

**What it does:** Detects anti-fingerprinting measures.

**How it works:** Looks for signs of:
- Privacy browsers (Brave, Firefox with RFP)
- Extensions (Privacy Badger, etc.)
- Modified APIs

**Value:** Lie detection and browser identification.

---

### Headless (`src/headless/`)

**What it does:** Detects headless/automated browser environments.

**How it works:** Checks for:
- `navigator.webdriver` flag
- Missing plugins
- Suspicious user-agent
- Phantom/Chrome DevTools detection

**Value:** Bot detection. Headless browsers have distinct characteristics.

---

### Inconsistencies (`src/inconsistencies/`)

**What it does:** Cross-validates signals to detect spoofing.

**How it works:**
1. Compares `hardwareConcurrency` between navigator, workerScope, and WASM
2. Validates UA-CH data matches user-agent
3. Checks worker/main thread consistency

**Value:** Lie detection. Spoofing one API often leaves others inconsistent.

---

## Rust/WASM Module (`rust/wasm-fingerprint/`)

### Purpose

High-precision hardware fingerprinting that can't be achieved in JavaScript. WebAssembly provides:
- Deterministic execution (no JIT warmup variance)
- Direct memory access (cache timing analysis)
- Lower overhead (more sensitive measurements)

### Probes

| Probe | Description | What it measures |
|-------|-------------|------------------|
| `cpu_stress_test` | Integer operations loop | CPU clock speed, instruction throughput |
| `fpu_stress_test` | Floating-point operations | FPU performance, precision |
| `ram_stress_test` | Memory allocation patterns | Memory speed, cache behavior |
| `branch_stress_test` | Conditional branches | Branch predictor characteristics |
| `jit_stress_test` | Dynamic code generation | JIT compiler behavior |

### Output

```typescript
interface WasmBenchmarkResult {
  cpuScore: number;      // Time for CPU stress test
  fpuScore: number;      // Time for FPU stress test
  ramScore: number;      // Time for RAM stress test
  branchScore: number;   // Time for branch stress test
  jitScore: number;      // Time for JIT stress test
  $hash: string;         // Combined hash
}
```

### Building

```bash
cd rust/wasm-fingerprint
wasm-pack build --target web
```

---

## Server-Side Analysis (TODO)

The following analyses are performed server-side because they:
- Require cross-request state
- Involve IP/geolocation data
- Need historical comparison

### Timezone Validation

**Signals consumed:**
- `timezone.offset` - Client's reported UTC offset
- `timezone.location` - Client's IANA timezone
- IP geolocation data

**Analysis:**
1. Compare `timezone.offset` with expected offset for IP-derived location
2. Compare `timezone.location` with IP-derived timezone
3. For historical validation, check offset at year 1113 (pre-DST era):

```javascript
function getHistoricalOffset(city, year = 1113) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: city,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric'
  });
  const summer = +new Date(formatter.format(new Date(`7/1/${year}`)));
  const utc = +new Date(`${year}-07-01`);
  return (summer - utc) / 60000; // minutes
}
```

**Purpose:** Detects timezone spoofing. Users behind VPNs often forget to change system timezone.

---

### Clock Skew Analysis

**Signals consumed:**
- `timing.start.monotonic` / `timing.end.monotonic` - Client timestamps
- `timing.drift` - Difference between performance.now and Date.now
- `timing.resolution` - Timer precision
- Server's own timestamp at request arrival

**Analysis:**

```javascript
// 1. Calculate client clock offset
const clientMonotonic = fingerprint.timing.end.monotonic;
const serverTimestamp = Date.now();
const clockOffset = clientMonotonic - serverTimestamp;

// 2. Track drift over multiple visits
// Store (visit_time, clock_offset) pairs per fingerprint
// Drift rate = delta_offset / delta_time

// 3. Detect time manipulation
if (fingerprint.timing.drift > 10) {
  // Date.now() may be tampered (performance.now() is harder to fake)
}

// 4. Resolution analysis
// ~1ms = normal browser
// ~0.005ms = crossOriginIsolated (high-precision)
// ~5ms, ~100ms = privacy browser with reduced precision
```

**Purpose:** Each device's crystal oscillator has unique frequency variations. Over multiple visits, the server builds a "clock fingerprint" from drift patterns. This is:
- Very hard to spoof (requires consistent time manipulation)
- Works across browser sessions
- Helps link different browser profiles on same device

---

### High-Precision Timing (Optional)

**Required headers:**
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Trade-off:** These headers enable `crossOriginIsolated`, allowing SharedArrayBuffer for microsecond timing. However, they break:
- Iframes from different origins
- Payment widgets (Stripe, PayPal)
- Third-party analytics
- Social media embeds

**When enabled:**
- `timing.samples` contains rapid timestamp pairs
- `timing.resolution` drops to ~0.005ms
- Server can analyze CPU jitter patterns
- VM detection becomes more reliable (VMs have different timing characteristics)

---

### Cross-Visit Linking

**Signals consumed:** All fingerprint components

**Analysis:**
1. Hash fingerprint components with varying weights
2. Use fuzzy matching for components that drift slightly
3. Track fingerprint evolution over time
4. Link visits from same device across:
   - Different browsers
   - Incognito/private mode
   - Cookie clears

---

## Fingerprint Uniqueness

Estimated uniqueness with all modules:

| Scenario | Uniqueness |
|----------|------------|
| Standard signals (no WASM) | ~1 in 50,000 |
| With WASM benchmarks | ~1 in 100,000-500,000 |
| With high-precision timing | ~1 in 1,000,000-10,000,000 |
| With server-side clock skew | Adds temporal stability |

The goal is not just uniqueness but **stability**—the same device should produce the same fingerprint across:
- Browser restarts
- Cookie clears
- Incognito mode
- Minor software updates

---

## Performance

Target: < 1 second total collection time

| Module | Typical Time |
|--------|--------------|
| Audio | ~100ms |
| Canvas | ~50ms |
| WebGL | ~30ms |
| Fonts | ~200ms |
| WASM | ~300ms |
| Timing | ~60ms |
| Others | ~50ms each |
| **Total** | **~500-800ms** |

All modules run in parallel. The slowest modules (fonts, WASM) determine total time.

---

## License

MIT
