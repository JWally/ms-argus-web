# Plan: Gzip Payload Compression for Full Fingerprint Data

## Goal
Send the full fingerprint payload (~156KB) compressed via gzip (~15-20KB) to enable discovery of new high-entropy stable signals we haven't considered yet.

## Architecture

```
Browser                          API Gateway              Lambda
   |                                  |                      |
   | POST /v1/collect                 |                      |
   | Content-Encoding: gzip           |                      |
   | [gzipped JSON ~15-20KB]          |                      |
   |--------------------------------->|                      |
   |                                  | (pass-through)       |
   |                                  |--------------------->|
   |                                  |                      | gunzip
   |                                  |                      | parse JSON
   |                                  |                      | process
```

## Implementation Steps

### Phase 1: Browser (ms-argus-web)

**File: `src/telemetry/index.ts`**

1. Add gzip compression helper using CompressionStream API
2. Modify `submitTelemetry()` to:
   - Send FULL payload (not trimmed) when compression enabled
   - Gzip the JSON string
   - Set `Content-Encoding: gzip` header
   - Fall back to trimmed payload if CompressionStream unavailable
3. Add config option: `useCompression?: boolean` (default: true for dev)

```typescript
// New helper
async function gzipData(data: string): Promise<Blob> {
  const stream = new Blob([data]).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  return new Response(compressed).blob()
}
```

### Phase 2: API (ms-argus-api)

**File: `src/handlers/ingestion.ts`**

1. Check for `Content-Encoding: gzip` header
2. Decompress payload using Node.js `zlib.gunzip()`
3. Parse decompressed JSON
4. Continue with normal processing

```typescript
import { gunzipSync } from 'zlib'

// In handler
const contentEncoding = event.headers['content-encoding']
let body = event.body

if (contentEncoding === 'gzip' && event.isBase64Encoded) {
  const buffer = Buffer.from(body, 'base64')
  body = gunzipSync(buffer).toString('utf-8')
}

const payload = JSON.parse(body)
```

**File: `lib/constructs/api-gateway.ts`** (if needed)

- Ensure HTTP API accepts binary payloads
- May need to configure binary media types

### Phase 3: Testing

1. Unit tests for compression/decompression
2. Integration test with full payload
3. Verify payload size in CloudWatch logs
4. Test browser fallback when CompressionStream unavailable

## Considerations

| Concern | Mitigation |
|---------|------------|
| Browser support | CompressionStream: Chrome 80+, Firefox 113+, Safari 16.4+ - fallback to trimmed for older |
| API Gateway limits | HTTP API: 10MB limit - we're well under |
| Lambda payload limit | 6MB sync invocation - compressed ~20KB is fine |
| CPU overhead | Minimal - gzip is fast, JSON compresses well |

## Config

```typescript
interface TelemetryConfig {
  // ... existing
  /** Use gzip compression for full payload (default: true in dev) */
  useCompression?: boolean
}
```

## Rollout

1. Implement in dev environment first
2. Monitor CloudWatch for payload sizes and errors
3. Analyze full payloads for new signal candidates
4. If stable, consider for production

## Files to Modify

| Repository | File | Changes |
|------------|------|---------|
| ms-argus-web | `src/telemetry/index.ts` | Add gzip helper, send full payload |
| ms-argus-api | `src/handlers/ingestion.ts` | Decompress gzipped payloads |
| ms-argus-api | `src/handlers/ingestion.test.ts` | Tests for gzip handling |

## Success Criteria

- [ ] Full payload (~156KB) compresses to <30KB
- [ ] API successfully decompresses and processes
- [ ] Fallback works for browsers without CompressionStream
- [ ] CloudWatch shows full fingerprint data for analysis
- [ ] No increase in error rates

## Future: Signal Discovery

With full payloads stored, we can analyze:
- Canvas rendering variations across devices
- WebGL parameter distributions
- Feature detection patterns
- Font enumeration (if added)
- Audio processing quirks
- Any other high-entropy candidates hiding in the data!
