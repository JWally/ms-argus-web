/**
 * WebRTC Fingerprinting Types
 *
 * Type definitions for WebRTC-based fingerprinting.
 */

/**
 * Media codec capability information.
 */
export interface CodecCapability {
  /** MIME type (e.g., 'audio/opus', 'video/H264') */
  mimeType: string;
  /** Supported clock rates */
  clockRates: number[];
  /** Number of audio channels (audio only) */
  channels?: number;
  /** SDP format parameters */
  sdpFmtpLine?: string[];
  /** Feedback mechanisms supported */
  feedbackSupport?: string[];
}

/**
 * SDP-extracted codec capabilities.
 */
export interface SDPCodecs {
  /** Audio codecs extracted from SDP */
  audio: CodecCapability[] | undefined;
  /** Video codecs extracted from SDP */
  video: CodecCapability[] | undefined;
}

/**
 * Media decoding capability information.
 */
export interface MediaCapabilityResult {
  /** Whether the codec is supported for decoding */
  supported: boolean;
  /** Whether decoding will be smooth (no dropped frames) */
  smooth: boolean;
  /** Whether decoding is power efficient */
  powerEfficient: boolean;
}

/**
 * Parsed ICE candidate information.
 *
 * ICE candidates reveal network interface details:
 * - host: Local interface (can expose private IPs on Android)
 * - srflx: Server reflexive (public IP via STUN)
 * - prflx: Peer reflexive (discovered during connectivity checks)
 * - relay: TURN server relay (indicates TURN usage)
 */
export interface ParsedICECandidate {
  /** Candidate type: host, srflx, prflx, or relay */
  type: 'host' | 'srflx' | 'prflx' | 'relay' | string;
  /** IP address (may be mDNS obfuscated like xxx.local) */
  address: string;
  /** Port number */
  port: number;
  /** Transport protocol */
  protocol: 'udp' | 'tcp' | string;
  /** Candidate foundation (hash of type+base+protocol) */
  foundation: string;
  /** Priority value (higher = preferred) */
  priority: number;
  /** IP address category for profiling */
  category: 'private' | 'public' | 'ipv6' | 'mdns' | 'unknown';
  /** Raw candidate string */
  raw: string;
}

/**
 * Summary of collected ICE candidates for profiling.
 */
export interface ICECandidateSummary {
  /** All parsed candidates */
  candidates: ParsedICECandidate[];
  /** Count by candidate type */
  typeCount: Record<string, number>;
  /** Count by IP category */
  categoryCount: Record<string, number>;
  /** Whether any private IPs were exposed (Android behavior) */
  hasPrivateIP: boolean;
  /** Whether mDNS obfuscation is active */
  hasMDNS: boolean;
  /** Public IPv4 if discovered via STUN (first one found) */
  publicIP?: string;
  /** Private IPs if exposed (useful for profiling) */
  privateIPs: string[];
  /** IPv6 addresses collected */
  ipv6Addresses: string[];
  /**
   * ALL unique IPs collected, ordered by preference:
   * 1. Public IPv4 (most useful for comparison)
   * 2. Private IPv4 (192.168.x, 10.x, 172.16-31.x)
   * 3. IPv6 addresses
   */
  allIPs: string[];
  /**
   * Primary IP for comparison with server-side IP.
   * Prefers public IPv4 > private IPv4 > IPv6.
   * Use this to compare against sigint tlsFingerprint.ip or tcpProbe.client_ip
   */
  primaryIP?: string;
}

/**
 * WebRTC fingerprint result.
 */
export interface WebRTCFingerprint {
  /** Codec capabilities extracted from SDP */
  codecsSdp: SDPCodecs;
  /** RTP header extensions */
  extensions: string[];
  /** ICE candidate foundation (interface identifier) */
  foundation: string;
  /** Foundation property from candidate event */
  foundationProp?: string;
  /** Raw ICE candidate string */
  iceCandidate: string;
  /** Resolved IP address (if available) */
  address?: string;
  /** STUN connection candidate string */
  stunConnection?: string;
  /** All collected ICE candidates with analysis */
  iceCandidates?: ICECandidateSummary;
}
