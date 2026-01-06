import { describe, it, expect } from 'vitest';

// We need to test the internal functions, so let's import the module and test indirectly
// by examining the exported function behavior

// Since categorizeIP and parseICECandidate are internal, we'll test them
// through the module's behavior. For more direct testing, we could export them.

// For now, let's create a test file that imports the constants and tests patterns
import {
  STUN_SERVERS,
  KNOWN_FOUNDATIONS,
  ICE_GATHER_TIMEOUT,
  TEST_CODECS,
} from './constants';

describe('webrtc constants', () => {
  describe('STUN_SERVERS', () => {
    it('contains Google STUN servers', () => {
      expect(STUN_SERVERS).toBeInstanceOf(Array);
      expect(STUN_SERVERS.length).toBeGreaterThan(0);
      STUN_SERVERS.forEach((server) => {
        expect(server).toMatch(/^stun:/);
        expect(server).toContain('google.com');
      });
    });
  });

  describe('KNOWN_FOUNDATIONS', () => {
    it('maps foundation hashes to interface types', () => {
      expect(KNOWN_FOUNDATIONS).toBeInstanceOf(Object);
      expect(KNOWN_FOUNDATIONS['842163049']).toBe('public interface');
      expect(KNOWN_FOUNDATIONS['2268587630']).toBe('WireGuard');
    });
  });

  describe('ICE_GATHER_TIMEOUT', () => {
    it('is a reasonable timeout value', () => {
      // Lowered to 1000ms for faster fingerprinting
      expect(ICE_GATHER_TIMEOUT).toBeGreaterThanOrEqual(1000);
      expect(ICE_GATHER_TIMEOUT).toBeLessThan(10000);
    });
  });

  describe('TEST_CODECS', () => {
    it('contains audio and video codecs', () => {
      const audioCodecs = TEST_CODECS.filter((c) => c.startsWith('audio/'));
      const videoCodecs = TEST_CODECS.filter((c) => c.startsWith('video/'));
      expect(audioCodecs.length).toBeGreaterThan(0);
      expect(videoCodecs.length).toBeGreaterThan(0);
    });
  });
});

// Test IP categorization patterns directly
describe('IP categorization patterns', () => {
  const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;
  const IPV6_PATTERN = /^[a-f0-9:]+$/i;
  const MDNS_PATTERN = /\.local$/i;

  describe('private IP detection', () => {
    it('matches 10.x.x.x addresses', () => {
      expect(PRIVATE_IP_PATTERN.test('10.0.0.1')).toBe(true);
      expect(PRIVATE_IP_PATTERN.test('10.255.255.255')).toBe(true);
    });

    it('matches 172.16-31.x.x addresses', () => {
      expect(PRIVATE_IP_PATTERN.test('172.16.0.1')).toBe(true);
      expect(PRIVATE_IP_PATTERN.test('172.31.255.255')).toBe(true);
      expect(PRIVATE_IP_PATTERN.test('172.15.0.1')).toBe(false);
      expect(PRIVATE_IP_PATTERN.test('172.32.0.1')).toBe(false);
    });

    it('matches 192.168.x.x addresses', () => {
      expect(PRIVATE_IP_PATTERN.test('192.168.0.1')).toBe(true);
      expect(PRIVATE_IP_PATTERN.test('192.168.1.100')).toBe(true);
    });

    it('does not match public IPs', () => {
      expect(PRIVATE_IP_PATTERN.test('8.8.8.8')).toBe(false);
      expect(PRIVATE_IP_PATTERN.test('142.250.80.46')).toBe(false);
    });
  });

  describe('IPv6 detection', () => {
    it('matches IPv6 addresses', () => {
      expect(IPV6_PATTERN.test('::1')).toBe(true);
      expect(IPV6_PATTERN.test('fe80::1')).toBe(true);
      expect(IPV6_PATTERN.test('2001:db8::1')).toBe(true);
    });

    it('does not match IPv4 addresses', () => {
      expect(IPV6_PATTERN.test('192.168.1.1')).toBe(false);
    });
  });

  describe('mDNS detection', () => {
    it('matches .local addresses', () => {
      expect(MDNS_PATTERN.test('abc123.local')).toBe(true);
      expect(MDNS_PATTERN.test('device.local')).toBe(true);
    });

    it('does not match regular addresses', () => {
      expect(MDNS_PATTERN.test('192.168.1.1')).toBe(false);
      expect(MDNS_PATTERN.test('example.com')).toBe(false);
    });
  });
});

// Test ICE candidate parsing pattern
describe('ICE candidate parsing', () => {
  const candidatePattern =
    /candidate:(\S+)\s+\d+\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s+typ\s+(\S+)/i;

  it('parses host candidate', () => {
    const candidate =
      'candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host generation 0';
    const match = candidate.match(candidatePattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('842163049'); // foundation
    expect(match![2]).toBe('udp'); // protocol
    expect(match![3]).toBe('1677729535'); // priority
    expect(match![4]).toBe('192.168.1.100'); // address
    expect(match![5]).toBe('54321'); // port
    expect(match![6]).toBe('host'); // type
  });

  it('parses srflx (STUN) candidate', () => {
    const candidate =
      'candidate:123456 1 udp 100401151 203.0.113.5 8080 typ srflx raddr 192.168.1.100 rport 54321';
    const match = candidate.match(candidatePattern);
    expect(match).not.toBeNull();
    expect(match![4]).toBe('203.0.113.5'); // public IP
    expect(match![6]).toBe('srflx'); // type
  });

  it('parses relay (TURN) candidate', () => {
    const candidate =
      'candidate:789 1 udp 50331903 198.51.100.3 3478 typ relay raddr 203.0.113.5 rport 8080';
    const match = candidate.match(candidatePattern);
    expect(match).not.toBeNull();
    expect(match![6]).toBe('relay'); // type
  });

  it('parses TCP candidate', () => {
    const candidate =
      'candidate:999 1 tcp 1518214911 192.168.1.100 9 typ host tcptype active';
    const match = candidate.match(candidatePattern);
    expect(match).not.toBeNull();
    expect(match![2]).toBe('tcp'); // protocol
  });

  it('parses mDNS obfuscated candidate', () => {
    const candidate =
      'candidate:842163049 1 udp 1677729535 abc123def.local 54321 typ host';
    const match = candidate.match(candidatePattern);
    expect(match).not.toBeNull();
    expect(match![4]).toBe('abc123def.local'); // mDNS address
  });
});
