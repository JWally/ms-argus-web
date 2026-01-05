# Server-Side Analysis Migration

## Overview

The client should collect fingerprint data and compute hashes. The server should run validation/analysis against reference databases. This reduces client bundle size by ~50KB and allows updating detection patterns without client redeploys.

## Payload Attributes Requiring Server-Side Analysis

### 1. Timezone Validation
**Payload fields:** `timezone.location`, `timezone.zone`, `timezone.locationEpoch`
**Server database:** IANA timezone city data with historical offset information
**Analysis:** Validate reported timezone against known city/offset combinations
**Current client code to remove:** `TIMEZONE_CITIES_INLINE` in `src/timezone/constants.ts`

### 2. GPU Fraud Detection [REMOVED FROM CLIENT]
**Payload fields:** `canvasWebgl.gpu.compressedGPU`, `canvasWebgl.gpu.webglBrandCapabilities`, `canvasWebgl.gpu.webglCapabilities`
**Server database:** Known legitimate GPU capability hashes (~530 entries)
**Analysis:**
- Check if `webglBrandCapabilities` hash exists in known GPU brand list
- Check if `webglCapabilities` XOR hash exists in known capability list
- Flag unknown combinations as suspicious (VM, emulator, or spoofed)
**Reference data for server:** See git history for `KNOWN_GPU_BRAND_CAPABILITIES` (290 8-char hashes) and `KNOWN_CAPABILITIES` (230 XOR integers)
**Status:** Client code removed. Client computes hashes; server validates.

### 3. Canvas Pattern Validation
**Payload fields:** `canvas2d.dataURI`, `canvas2d.paintURI`, pixel data
**Server database:** Known legitimate canvas pixel patterns by engine
**Analysis:** Match canvas output against known Blink/Gecko/WebKit patterns
**Current client code to remove:** `KNOWN_IMAGE_DATA` in `src/canvas/constants.ts`

### 4. Audio Anomaly Detection [REMOVED FROM CLIENT]
**Payload fields:** `offlineAudioContext.compressorGainReduction`, `offlineAudioContext.floatFrequencyDataSum`, `offlineAudioContext.floatTimeDomainDataSum`, `offlineAudioContext.sampleSum`
**Server database:** Known audio fingerprint patterns indexed by composite key `{compressorGainReduction},{frequencySum},{timeDomainSum}` → valid sampleSum values
**Analysis:**
- Lookup pattern key in database
- If pattern exists but sampleSum doesn't match known values → flag as tampered
- Can also classify browser engine by compressorGainReduction range:
  - Blink: -21 to -20 (e.g., -20.538)
  - Gecko: -32 to -31 (e.g., -31.502)
  - WebKit: -30 to -29 (e.g., -29.837)
**Status:** Client code removed. See git history for reference patterns.

### 5. OS Version Inference from Fonts
**Payload fields:** `fonts.fontFaceLoadFonts`, font list
**Server database:** Windows/macOS version-specific font mappings
**Analysis:** Infer OS version from installed fonts, cross-check with reported platform
**Current client code to remove:** `WINDOWS_FONTS_BY_VERSION`, `MACOS_FONTS_BY_VERSION` in `src/fonts/constants.ts`

### 6. Lie/Tampering Detection Enhancement
**Payload fields:** `lies.data`, function signatures, stack traces
**Server database:** Known toString formats, proxy detection patterns
**Analysis:** Enhanced tampering detection with updatable pattern database
**Current client code to remove:** Validation patterns in `src/lies/constants.ts`

### 7. Navigator Value Validation
**Payload fields:** `navigator.deviceMemory`, `navigator.platform`, `navigator.hardwareConcurrency`
**Server database:** Valid value sets (deviceMemory: 0.25-8, valid platforms, etc.)
**Analysis:** Flag impossible or suspicious navigator values
**Current client code to remove:** `VALID_DEVICE_MEMORY`, `KNOWN_PLATFORMS` in `src/navigator/constants.ts`

### 8. Browser Version Detection [REMOVED FROM CLIENT]
**Payload fields:** `features.cssKeys`, `features.windowKeys`, `features.jsKeys`, `features.engine`
**Server database:** MDN Browser Compatibility Data (auto-updated via `scripts/update-features-mdn.ts`)
**Analysis:**
- Compare cssKeys against known CSS property additions by Chrome/Firefox version
- Compare windowKeys against known window API additions by version
- Compare jsKeys against known JavaScript built-in additions by version
- Detect version spoofing: if UA claims Chrome 120 but features match Chrome 115, flag as lie
- Engine detection: verify `engine` hint matches feature signatures
**Reference data for server:** Use `scripts/update-features-mdn.ts` to generate feature maps from MDN BCD
**Data source:** `public/data/features-engine-maps-mdn.json` (851KB) or fetch directly from `@mdn/browser-compat-data`
**Status:** Client code removed (~800 lines). Client collects raw keys; server detects versions.
**Bot signal:** `outsideFeaturesVersion` (ofv) in botHash now computed server-side

### 9. Extension/Automation Detection [REMOVED FROM CLIENT]
**Payload fields:** `resistance.extensionHashPattern`
**Server database:** Extension hash patterns (~230 lines) mapping lie detection hashes to known extensions
**Analysis:**
- Match `extensionHashPattern` keys against known extension signatures
- Each extension has a minimum lie count threshold to reduce false positives
- Detection order matters (most specific first) to avoid misidentification
**Detectable extensions:**
- Privacy extensions: CanvasBlocker, DuckDuckGo, Privacy Badger, Privacy Possum, JShelter, NoScript, Trace, Chameleon
- Automation tools: puppeteer-extra-plugin-stealth, FakeBrowser, CyDec
**Reference data for server:** See git history for `EXTENSION_PATTERNS` and `EXTENSION_MIN_LIES`
**Status:** Client code removed. Client sends raw `extensionHashPattern`; server identifies extension.
**Note:** The `resistance.extension` field is now always `undefined` on client; server computes it.

## Implementation Steps

1. [ ] Create server-side analysis module with validation functions
2. [ ] Migrate each database to server (can use JSON files or actual DB)
3. [ ] Add analysis results to server response (fraud scores, flags, inferred data)
4. [ ] Remove validation constants from client `src/*/constants.ts`
5. [ ] Remove client-side validation code that uses these constants
6. [ ] Update lite builds to exclude all validation logic

## What MUST Stay Client-Side

These constants directly affect hash computation and cannot be moved:
- `WEBGL_PARAMS` - controls which parameters are collected
- `VERTEX_SHADER_SOURCE`, `FRAGMENT_SHADER_SOURCE` - affects rendered pixels
- `TRIANGLE_VERTICES` - affects rendered output
- `SYSTEM_COLORS`, `SYSTEM_FONTS` - controls CSS collection
- `PICASSO_COLORS`, `PICASSO_CONFIG` - affects canvas rendering
- `AUDIO_CONFIG` (sample rate, frequencies) - affects audio output
- `PERMISSION_NAMES` - controls which permissions are queried

## Estimated Impact

- Client bundle reduction: ~50KB uncompressed (~15KB gzipped)
- Lines of code removed: ~2,800 lines (including ~1,650 already removed)
- Validation databases that can be updated independently: 8

## Already Removed from Client

The following have been migrated to server-side analysis:
- Audio patterns (KNOWN_AUDIO_SIGNATURES, KNOWN_AUDIO_PATTERNS) - ~250 lines
- GPU validation (KNOWN_GPU_BRAND_CAPABILITIES, KNOWN_CAPABILITIES) - ~350 lines
- Extension detection (EXTENSION_PATTERNS, EXTENSION_MIN_LIES) - ~250 lines
- Browser version detection (engine maps, version comparison) - ~800 lines
