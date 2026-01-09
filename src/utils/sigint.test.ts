import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  collectSigintData,
  fetchTlsFingerprint,
  fetchTcpProbe,
  performStunBinding,
  parseSigintConfigFromUrl,
  getTlsFingerprintEndpoint,
  getTcpProbeEndpoint,
  getStunServerUri,
  getProxyScore,
  getTlsHash,
  getThirdPartyCookieId,
  type SigintConfig,
  type SigintData,
} from './sigint'

describe('sigint URL builders', () => {
  it('builds TLS fingerprint endpoint with default config', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw' }
    const url = getTlsFingerprintEndpoint(config)
    expect(url).toBe('https://id.argus.pw/')
  })

  it('builds TLS fingerprint endpoint with stage prefix', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw', stagePrefix: 'qa-' }
    const url = getTlsFingerprintEndpoint(config)
    expect(url).toBe('https://qa-id.argus.pw/')
  })

  it('builds TCP probe endpoint with default config', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw' }
    const url = getTcpProbeEndpoint(config)
    expect(url).toBe('https://tcp-probe.argus.pw/')
  })

  it('builds TCP probe endpoint with stage prefix', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw', stagePrefix: 'uat-' }
    const url = getTcpProbeEndpoint(config)
    expect(url).toBe('https://uat-tcp-probe.argus.pw/')
  })

  it('builds STUN server URI with default config', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw' }
    const uri = getStunServerUri(config)
    expect(uri).toBe('stun:stun.argus.pw:3478')
  })

  it('builds STUN server URI with stage prefix', () => {
    const config: SigintConfig = { baseDomain: 'argus.pw', stagePrefix: 'qa-' }
    const uri = getStunServerUri(config)
    expect(uri).toBe('stun:qa-stun.argus.pw:3478')
  })
})

describe('parseSigintConfigFromUrl', () => {
  it('parses sigintDomain from URL', () => {
    const url = new URL('https://example.com/script.js?sigintDomain=custom.io')
    const config = parseSigintConfigFromUrl(url)
    expect(config.baseDomain).toBe('custom.io')
  })

  it('parses sigintStage from URL', () => {
    const url = new URL('https://example.com/script.js?sigintStage=qa-')
    const config = parseSigintConfigFromUrl(url)
    expect(config.stagePrefix).toBe('qa-')
  })

  it('parses empty stage prefix', () => {
    const url = new URL('https://example.com/script.js?sigintStage=')
    const config = parseSigintConfigFromUrl(url)
    expect(config.stagePrefix).toBe('')
  })

  it('parses sigintTimeout from URL', () => {
    const url = new URL('https://example.com/script.js?sigintTimeout=3000')
    const config = parseSigintConfigFromUrl(url)
    expect(config.timeout).toBe(3000)
  })

  it('parses sigintCookie=false from URL', () => {
    const url = new URL('https://example.com/script.js?sigintCookie=false')
    const config = parseSigintConfigFromUrl(url)
    expect(config.enableCookie).toBe(false)
  })

  it('parses sigintCookie=true from URL', () => {
    const url = new URL('https://example.com/script.js?sigintCookie=true')
    const config = parseSigintConfigFromUrl(url)
    expect(config.enableCookie).toBe(true)
  })

  it('parses sigintTcpProbe=false from URL', () => {
    const url = new URL('https://example.com/script.js?sigintTcpProbe=false')
    const config = parseSigintConfigFromUrl(url)
    expect(config.enableTcpProbe).toBe(false)
  })

  it('parses sigintStun=true from URL', () => {
    const url = new URL('https://example.com/script.js?sigintStun=true')
    const config = parseSigintConfigFromUrl(url)
    expect(config.enableStun).toBe(true)
  })

  it('parses multiple params from URL', () => {
    const url = new URL('https://example.com/script.js?sigintDomain=foo.io&sigintStage=uat-&sigintTimeout=8000&sigintStun=true')
    const config = parseSigintConfigFromUrl(url)
    expect(config.baseDomain).toBe('foo.io')
    expect(config.stagePrefix).toBe('uat-')
    expect(config.timeout).toBe(8000)
    expect(config.enableStun).toBe(true)
  })

  it('works with string URL', () => {
    const config = parseSigintConfigFromUrl('https://example.com/script.js?sigintDomain=test.io')
    expect(config.baseDomain).toBe('test.io')
  })
})

describe('helper functions', () => {
  describe('getProxyScore', () => {
    it('returns 0 when no tcp probe data', () => {
      const data: SigintData = {
        tlsFingerprint: null,
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: null, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getProxyScore(data)).toBe(0)
    })

    it('returns 0 when no rtt fingerprint', () => {
      const data: SigintData = {
        tlsFingerprint: null,
        tcpProbe: {
          tcp_info: null,
          rtt_fingerprint: null,
          http2_fingerprint: null,
          client_hints: null,
          user_agent: 'test',
          client_ip: '1.2.3.4',
          domain: 'test.io',
        },
        stun: null,
        timing: { tlsFingerprintMs: null, tcpProbeMs: 100, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getProxyScore(data)).toBe(0)
    })

    it('returns max of proxy and vpn score', () => {
      const data: SigintData = {
        tlsFingerprint: null,
        tcpProbe: {
          tcp_info: null,
          rtt_fingerprint: {
            tcp_rtt_us: 10000,
            tls_handshake_us: 50000,
            http_first_byte_us: 5000,
            total_connection_us: 65000,
            snd_mss: 1400,
            pmtu: 1500,
            tls_to_tcp_ratio: 5.0,
            total_to_tcp_ratio: 6.5,
            proxy_score: 0.3,
            vpn_score: 0.6,
            proxy_signals: ['elevated_tls_ratio:5.0'],
          },
          http2_fingerprint: null,
          client_hints: null,
          user_agent: 'test',
          client_ip: '1.2.3.4',
          domain: 'test.io',
        },
        stun: null,
        timing: { tlsFingerprintMs: null, tcpProbeMs: 100, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getProxyScore(data)).toBe(0.6)
    })
  })

  describe('getTlsHash', () => {
    it('returns null when no tls fingerprint', () => {
      const data: SigintData = {
        tlsFingerprint: null,
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: null, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getTlsHash(data)).toBe(null)
    })

    it('prefers JA4 over JA3', () => {
      const data: SigintData = {
        tlsFingerprint: {
          id: 'test-id',
          new: false,
          ip: '1.2.3.4',
          asn: '12345',
          country: 'US',
          ja3: 'ja3-hash',
          ja4: 'ja4-hash',
        },
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: 50, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getTlsHash(data)).toBe('ja4-hash')
    })

    it('falls back to JA3 when no JA4', () => {
      const data: SigintData = {
        tlsFingerprint: {
          id: 'test-id',
          new: false,
          ip: '1.2.3.4',
          asn: '12345',
          country: 'US',
          ja3: 'ja3-hash',
          ja4: null,
        },
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: 50, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getTlsHash(data)).toBe('ja3-hash')
    })
  })

  describe('getThirdPartyCookieId', () => {
    it('returns null when no tls fingerprint', () => {
      const data: SigintData = {
        tlsFingerprint: null,
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: null, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getThirdPartyCookieId(data)).toBe(null)
    })

    it('returns cookie ID when available', () => {
      const data: SigintData = {
        tlsFingerprint: {
          id: 'cookie-uuid-12345',
          new: false,
          ip: '1.2.3.4',
          asn: '12345',
          country: 'US',
          ja3: 'ja3-hash',
          ja4: 'ja4-hash',
        },
        tcpProbe: null,
        stun: null,
        timing: { tlsFingerprintMs: 50, tcpProbeMs: null, stunMs: null, totalMs: 100 },
        errors: [],
      }
      expect(getThirdPartyCookieId(data)).toBe('cookie-uuid-12345')
    })
  })
})

describe('collectSigintData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty data when all endpoints disabled', async () => {
    const config: SigintConfig = {
      baseDomain: 'test.io',
      enableCookie: false,
      enableTcpProbe: false,
      enableStun: false,
    }

    const result = await collectSigintData(config)

    expect(result.tlsFingerprint).toBe(null)
    expect(result.tcpProbe).toBe(null)
    expect(result.stun).toBe(null)
    expect(result.errors).toHaveLength(0)
  })

  it('handles fetch errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const config: SigintConfig = {
      baseDomain: 'test.io',
      enableCookie: true,
      enableTcpProbe: true,
      enableStun: false,
      timeout: 1000,
    }

    const result = await collectSigintData(config)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.includes('Network error'))).toBe(true)
  })

  it('handles successful TLS fingerprint response', async () => {
    const mockResponse = {
      id: 'test-uuid',
      new: false,
      ip: '1.2.3.4',
      asn: '12345',
      country: 'US',
      ja3: 'ja3-hash',
      ja4: 'ja4-hash',
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })
    vi.stubGlobal('fetch', mockFetch)

    const config: SigintConfig = {
      baseDomain: 'test.io',
      enableCookie: true,
      enableTcpProbe: false,
      enableStun: false,
      timeout: 1000,
    }

    const result = await collectSigintData(config)

    expect(result.tlsFingerprint).toEqual(mockResponse)
    expect(result.timing.tlsFingerprintMs).toBeDefined()
    expect(result.errors).toHaveLength(0)
  })

  it('records timing for all requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const config: SigintConfig = {
      baseDomain: 'test.io',
      enableCookie: true,
      enableTcpProbe: true,
      enableStun: false,
      timeout: 1000,
    }

    const result = await collectSigintData(config)

    expect(result.timing.totalMs).toBeGreaterThan(0)
  })
})

describe('performStunBinding', () => {
  it('returns error when RTCPeerConnection not available', async () => {
    // In test environment, RTCPeerConnection is not available
    const config: SigintConfig = { baseDomain: 'test.io' }
    const result = await performStunBinding(config)

    // Should handle gracefully
    expect(result.error).toContain('WebRTC not available')
    expect(result.data).toBe(null)
  })
})
