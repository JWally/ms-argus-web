/**
 * Sigint Integration Module
 *
 * Integrates with ms-argus-sigint server-side fingerprinting services:
 * - TLS Fingerprint Edge (CloudFront): JA3/JA4, third-party cookies, geo/ASN
 * - TCP Probe: TCP RTT, VPN/proxy detection, HTTP/2 fingerprint
 * - STUN: WebRTC IP discovery
 *
 * All endpoints are configurable via domain configuration.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Configuration for sigint endpoints */
export interface SigintConfig {
  /** Base domain for sigint services (e.g., "argus.pw") */
  baseDomain: string
  /** Stage prefix for sub-production (e.g., "qa-", "uat-", or "" for prod) */
  stagePrefix?: string
  /** Timeout for requests in ms (default: 5000) */
  timeout?: number
  /** Enable third-party cookie endpoint (default: true) */
  enableCookie?: boolean
  /** Enable TCP probe endpoint (default: true) */
  enableTcpProbe?: boolean
  /** Enable STUN for WebRTC IP discovery (default: false - requires user gesture) */
  enableStun?: boolean
}

/** Response from TLS Fingerprint Edge (CloudFront) */
export interface TlsFingerprintResponse {
  /** Visitor ID (UUID format) */
  id: string
  /** Whether this is a new visitor (cookie was just set) */
  new: boolean
  /** Client IP address */
  ip: string | null
  /** Autonomous System Number */
  asn: string | null
  /** Country code (ISO 3166-1 alpha-2) */
  country: string | null
  /** JA3 TLS fingerprint hash */
  ja3: string | null
  /** JA4 TLS fingerprint (newer, more detailed) */
  ja4: string | null
}

/** TCP connection info from kernel */
export interface TcpInfo {
  state: number
  rtt: number
  rttvar: number
  snd_mss: number
  rcv_mss: number
  pmtu: number
  total_retrans: number
  snd_cwnd: number
  rcv_space: number
  [key: string]: number
}

/** RTT-based proxy/VPN detection */
export interface RttFingerprint {
  /** TCP RTT in microseconds (to immediate peer) */
  tcp_rtt_us: number
  /** TLS handshake duration in microseconds */
  tls_handshake_us: number
  /** Time from TLS complete to first HTTP byte */
  http_first_byte_us: number
  /** Total connection time */
  total_connection_us: number
  /** Send MSS (reduced by VPN tunnel overhead) */
  snd_mss: number
  /** Path MTU */
  pmtu: number
  /** TLS/TCP ratio (elevated for proxies) */
  tls_to_tcp_ratio: number
  /** Total/TCP ratio */
  total_to_tcp_ratio: number
  /** Proxy likelihood score (0.0-1.0) */
  proxy_score: number
  /** VPN likelihood score (0.0-1.0) */
  vpn_score: number
  /** Human-readable detection signals */
  proxy_signals: string[]
}

/** HTTP/2 protocol fingerprint */
export interface Http2Fingerprint {
  /** Protocol version (h2, http/1.1) */
  protocol: string
  /** Header order (sorted) */
  header_order: string[]
  /** Computed fingerprint string */
  fingerprint: string
  /** Protocol anomalies detected */
  anomalies: string[]
}

/** Client Hints captured by TCP Probe */
export interface ClientHints {
  ua?: string
  ua_mobile?: string
  ua_platform?: string
  ua_platform_version?: string
  ua_arch?: string
  ua_bitness?: string
  ua_model?: string
  device_memory?: string
  downlink?: string
  ect?: string
  network_rtt?: string
}

/** Response from TCP Probe service */
export interface TcpProbeResponse {
  tcp_info: TcpInfo | null
  rtt_fingerprint: RttFingerprint | null
  http2_fingerprint: Http2Fingerprint | null
  client_hints: ClientHints | null
  user_agent: string
  client_ip: string
  domain: string
}

/** WebRTC STUN result */
export interface StunResult {
  /** Local IP address (private) */
  localIp: string | null
  /** Reflexive IP address (public, as seen by STUN server) */
  reflexiveIp: string | null
  /** Whether NAT was detected */
  natDetected: boolean
  /** STUN server used */
  stunServer: string
}

/** Combined sigint data */
export interface SigintData {
  /** TLS fingerprint data from CloudFront edge */
  tlsFingerprint: TlsFingerprintResponse | null
  /** TCP probe data (RTT, proxy detection) */
  tcpProbe: TcpProbeResponse | null
  /** STUN/WebRTC data */
  stun: StunResult | null
  /** Collection timing */
  timing: {
    tlsFingerprintMs: number | null
    tcpProbeMs: number | null
    stunMs: number | null
    totalMs: number
  }
  /** Any errors that occurred */
  errors: string[]
}

/* ------------------------------------------------------------------ */
/*  Default Configuration                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_CONFIG: Required<SigintConfig> = {
  baseDomain: 'argus.pw',
  stagePrefix: '',
  timeout: 5000,
  enableCookie: true,
  enableTcpProbe: true,
  enableStun: false,
}

/* ------------------------------------------------------------------ */
/*  URL Builders                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build endpoint URL from config
 */
function buildEndpoint(
  config: Required<SigintConfig>,
  subdomain: string,
  path = '/'
): string {
  const fullSubdomain = `${config.stagePrefix}${subdomain}`
  return `https://${fullSubdomain}.${config.baseDomain}${path}`
}

/**
 * Get TLS fingerprint endpoint URL
 */
export function getTlsFingerprintEndpoint(config: SigintConfig): string {
  const merged = { ...DEFAULT_CONFIG, ...config }
  return buildEndpoint(merged, 'id')
}

/**
 * Get TCP probe endpoint URL
 */
export function getTcpProbeEndpoint(config: SigintConfig): string {
  const merged = { ...DEFAULT_CONFIG, ...config }
  return buildEndpoint(merged, 'tcp-probe')
}

/**
 * Get STUN server URI
 */
export function getStunServerUri(config: SigintConfig): string {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const subdomain = `${merged.stagePrefix}stun`
  return `stun:${subdomain}.${merged.baseDomain}:3478`
}

/* ------------------------------------------------------------------ */
/*  Fetch Helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Fetch with timeout and error handling
 */
async function fetchWithTimeout<T>(
  url: string,
  timeout: number,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; durationMs: number }> {
  const start = performance.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    // Note: credentials: 'include' requires server to return specific origin, not '*'
    // If server returns Access-Control-Allow-Origin: *, use 'same-origin' instead
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'omit', // Omit cookies to allow wildcard CORS (server fix needed for cookie support)
    })

    clearTimeout(timeoutId)
    const durationMs = performance.now() - start

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
        durationMs,
      }
    }

    const data = (await response.json()) as T
    return { data, error: null, durationMs }
  } catch (err) {
    clearTimeout(timeoutId)
    const durationMs = performance.now() - start

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { data: null, error: `Timeout after ${timeout}ms`, durationMs }
      }
      return { data: null, error: err.message, durationMs }
    }
    return { data: null, error: String(err), durationMs }
  }
}

/* ------------------------------------------------------------------ */
/*  Individual Collectors                                              */
/* ------------------------------------------------------------------ */

/**
 * Fetch TLS fingerprint from CloudFront edge
 */
export async function fetchTlsFingerprint(
  config: SigintConfig
): Promise<{ data: TlsFingerprintResponse | null; error: string | null; durationMs: number }> {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const url = getTlsFingerprintEndpoint(config)
  return fetchWithTimeout<TlsFingerprintResponse>(url, merged.timeout)
}

/**
 * Fetch TCP probe data
 */
export async function fetchTcpProbe(
  config: SigintConfig
): Promise<{ data: TcpProbeResponse | null; error: string | null; durationMs: number }> {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const url = getTcpProbeEndpoint(config)
  return fetchWithTimeout<TcpProbeResponse>(url, merged.timeout)
}

/**
 * Perform STUN binding request via WebRTC
 */
export async function performStunBinding(
  config: SigintConfig
): Promise<{ data: StunResult | null; error: string | null; durationMs: number }> {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const stunServer = getStunServerUri(config)
  const start = performance.now()

  if (typeof RTCPeerConnection === 'undefined') {
    return {
      data: null,
      error: 'WebRTC not available',
      durationMs: performance.now() - start,
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pc.close()
      resolve({
        data: null,
        error: `STUN timeout after ${merged.timeout}ms`,
        durationMs: performance.now() - start,
      })
    }, merged.timeout)

    const result: StunResult = {
      localIp: null,
      reflexiveIp: null,
      natDetected: false,
      stunServer,
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: stunServer }],
    })

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        // ICE gathering complete
        clearTimeout(timeout)
        pc.close()

        result.natDetected = result.localIp !== null && result.reflexiveIp !== null
          && result.localIp !== result.reflexiveIp

        resolve({
          data: result,
          error: null,
          durationMs: performance.now() - start,
        })
        return
      }

      const candidate = event.candidate.candidate
      // Parse ICE candidate to extract IPs
      // Format: candidate:... typ host/srflx ... address IP ...
      const parts = candidate.split(' ')
      const typeIndex = parts.indexOf('typ')
      if (typeIndex === -1) return

      const candidateType = parts[typeIndex + 1]
      const ipIndex = 4 // IP is typically at index 4

      if (parts[ipIndex]) {
        const ip = parts[ipIndex]
        // Skip IPv6 link-local and mDNS
        if (ip.includes(':') || ip.endsWith('.local')) return

        if (candidateType === 'host') {
          result.localIp = ip
        } else if (candidateType === 'srflx') {
          result.reflexiveIp = ip
        }
      }
    }

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout)
        pc.close()

        result.natDetected = result.localIp !== null && result.reflexiveIp !== null
          && result.localIp !== result.reflexiveIp

        resolve({
          data: result,
          error: null,
          durationMs: performance.now() - start,
        })
      }
    }

    // Create data channel to trigger ICE gathering
    pc.createDataChannel('stun-probe')

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((err) => {
        clearTimeout(timeout)
        pc.close()
        resolve({
          data: null,
          error: `WebRTC error: ${err.message}`,
          durationMs: performance.now() - start,
        })
      })
  })
}

/* ------------------------------------------------------------------ */
/*  Main Collector                                                     */
/* ------------------------------------------------------------------ */

/**
 * Collect all sigint data in parallel
 */
export async function collectSigintData(config: SigintConfig): Promise<SigintData> {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const start = performance.now()
  const errors: string[] = []

  // Build parallel requests based on config
  const requests: Promise<unknown>[] = []
  const requestTypes: string[] = []

  if (merged.enableCookie) {
    requests.push(fetchTlsFingerprint(config))
    requestTypes.push('tls')
  }

  if (merged.enableTcpProbe) {
    requests.push(fetchTcpProbe(config))
    requestTypes.push('tcp')
  }

  if (merged.enableStun) {
    requests.push(performStunBinding(config))
    requestTypes.push('stun')
  }

  // Execute in parallel
  const results = await Promise.all(requests)

  // Parse results
  let tlsFingerprint: TlsFingerprintResponse | null = null
  let tlsFingerprintMs: number | null = null
  let tcpProbe: TcpProbeResponse | null = null
  let tcpProbeMs: number | null = null
  let stun: StunResult | null = null
  let stunMs: number | null = null

  for (let i = 0; i < results.length; i++) {
    const type = requestTypes[i]
    const result = results[i] as { data: unknown; error: string | null; durationMs: number }

    if (result.error) {
      errors.push(`${type}: ${result.error}`)
    }

    switch (type) {
      case 'tls':
        tlsFingerprint = result.data as TlsFingerprintResponse | null
        tlsFingerprintMs = result.durationMs
        break
      case 'tcp':
        tcpProbe = result.data as TcpProbeResponse | null
        tcpProbeMs = result.durationMs
        break
      case 'stun':
        stun = result.data as StunResult | null
        stunMs = result.durationMs
        break
    }
  }

  return {
    tlsFingerprint,
    tcpProbe,
    stun,
    timing: {
      tlsFingerprintMs,
      tcpProbeMs,
      stunMs,
      totalMs: performance.now() - start,
    },
    errors,
  }
}

/* ------------------------------------------------------------------ */
/*  Config Parser                                                      */
/* ------------------------------------------------------------------ */

/**
 * Parse sigint config from URL search params
 *
 * Supported params:
 * - sigintDomain: Base domain (e.g., "argus.pw")
 * - sigintStage: Stage prefix (e.g., "qa-", "uat-")
 * - sigintTimeout: Request timeout in ms
 * - sigintCookie: Enable cookie endpoint ("true"/"false")
 * - sigintTcpProbe: Enable TCP probe ("true"/"false")
 * - sigintStun: Enable STUN ("true"/"false")
 */
export function parseSigintConfigFromUrl(url: string | URL): Partial<SigintConfig> {
  const searchParams = typeof url === 'string' ? new URL(url).searchParams : url.searchParams
  const config: Partial<SigintConfig> = {}

  const domain = searchParams.get('sigintDomain')
  if (domain) config.baseDomain = domain

  const stage = searchParams.get('sigintStage')
  if (stage !== null) config.stagePrefix = stage

  const timeout = searchParams.get('sigintTimeout')
  if (timeout) {
    const parsed = parseInt(timeout, 10)
    if (!isNaN(parsed)) config.timeout = parsed
  }

  const cookie = searchParams.get('sigintCookie')
  if (cookie !== null) config.enableCookie = cookie !== 'false'

  const tcpProbe = searchParams.get('sigintTcpProbe')
  if (tcpProbe !== null) config.enableTcpProbe = tcpProbe !== 'false'

  const stun = searchParams.get('sigintStun')
  if (stun !== null) config.enableStun = stun === 'true'

  return config
}

/* ------------------------------------------------------------------ */
/*  Convenience Exports                                                */
/* ------------------------------------------------------------------ */

/**
 * Quick check if we're likely behind a proxy/VPN
 * Returns score from 0.0 (unlikely) to 1.0 (very likely)
 */
export function getProxyScore(data: SigintData): number {
  if (!data.tcpProbe?.rtt_fingerprint) return 0
  return Math.max(
    data.tcpProbe.rtt_fingerprint.proxy_score,
    data.tcpProbe.rtt_fingerprint.vpn_score
  )
}

/**
 * Get TLS fingerprint hash (JA4 preferred, fallback to JA3)
 */
export function getTlsHash(data: SigintData): string | null {
  if (!data.tlsFingerprint) return null
  return data.tlsFingerprint.ja4 || data.tlsFingerprint.ja3
}

/**
 * Get third-party cookie ID
 */
export function getThirdPartyCookieId(data: SigintData): string | null {
  return data.tlsFingerprint?.id || null
}
