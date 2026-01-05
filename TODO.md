# Server-Side Analysis TODO

Tasks moved from client-side to server-side for performance and better cross-validation.

## Timezone Validation (moved from client)

Historical offset comparison was removed from client-side (~3s overhead).

**Server-side implementation:**
1. Compare `timezone.offset` with expected offset based on IP geolocation
2. Compare `timezone.location` with IP-derived timezone
3. For historical validation, compare offset at year 1113 (pre-DST era):
   ```javascript
   // Get offset for a specific city at historical date
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
4. Compare client's system offset with their claimed timezone's historical offset

**Signals available:**
- `timezone.location` - IANA timezone (e.g., "America/Chicago")
- `timezone.offset` - Current offset in minutes
- `timezone.offsetComputed` - Cross-validation offset (should match)
- `workerScope.timezoneOffset` - Worker's offset (should match main)
- `workerScope.timezoneLocation` - Worker's location (should match main)

## Clock Skew Analysis (IMPLEMENTED)

The `timing` module now collects raw timestamp data for server-side drift analysis.

**Client-side signals collected:**
- `timing.start` - Timestamps at collection start (perfNow, dateNow, monotonic)
- `timing.end` - Timestamps at collection end
- `timing.perfElapsed` - Time elapsed via performance.now()
- `timing.dateElapsed` - Time elapsed via Date.now()
- `timing.drift` - Difference between elapsed times (tampering indicator)
- `timing.timeOrigin` - When the page started (performance.timeOrigin)
- `timing.resolution` - Timer precision (~1ms normal, ~0.005ms with COOP/COEP)
- `timing.samples` - Rapid timing samples (only if crossOriginIsolated)

**Server-side analysis:**
```javascript
// 1. Calculate client clock offset
const clientMonotonic = fingerprint.timing.end.monotonic;
const serverTimestamp = Date.now();
const clockOffset = clientMonotonic - serverTimestamp;

// 2. Track drift over multiple visits
// Store (visit_time, clock_offset) pairs
// Drift rate = delta_offset / delta_time

// 3. Detect time manipulation
// Large drift between perfElapsed and dateElapsed indicates
// Date.now() tampering (performance.now() is harder to fake)
if (fingerprint.timing.drift > 10) {
  // Suspicious - investigate further
}

// 4. Resolution fingerprinting
// Low resolution (~1ms) = normal browser
// Very low (~0.005ms) = crossOriginIsolated enabled
// Quantized (5ms, 100ms) = privacy browser with reduced precision
```

**High-precision timing (requires COOP/COEP headers):**
If merchant sets these headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Then `crossOriginIsolated` becomes true and we can use SharedArrayBuffer
for microsecond-precision timing. The `timing.samples` array will contain
rapid measurements useful for:
- CPU jitter fingerprinting
- VM detection (VMs have different timing characteristics)
- Same-device cross-browser linking

**Trade-off:** These headers break iframes, payment widgets, analytics, etc.
Most sites won't enable them. The standard timing data is still valuable.
