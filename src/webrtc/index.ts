/**
 * WebRTC Fingerprinting Module
 *
 * Extracts fingerprint data from WebRTC APIs including codec capabilities,
 * media devices, and network information. This module provides signals because:
 *
 * 1. **Codec Fingerprinting**: SDP (Session Description Protocol) contains
 *    detailed codec support info that varies by browser and OS.
 *
 * 2. **IP Address Discovery**: ICE candidates may reveal local/public IPs,
 *    VPN status, and network interface types.
 *
 * 3. **RTP Extensions**: Supported RTP header extensions vary by browser
 *    and reveal WebRTC implementation details.
 *
 * 4. **Media Devices**: Enumerated media devices (audio/video inputs) create
 *    a device-specific fingerprint.
 *
 * ## Privacy Considerations
 *
 * WebRTC can leak IP addresses even behind VPNs. Modern browsers and privacy
 * tools increasingly restrict this capability. The ability (or inability) to
 * gather candidates is itself a fingerprint signal.
 *
 * @see https://webrtchacks.com/sdp-anatomy/
 * @see https://tools.ietf.org/id/draft-ietf-rtcweb-sdp-08.html
 * @module webrtc
 */

import {
  getRtcConfig,
  KNOWN_FOUNDATIONS,
  ICE_GATHER_TIMEOUT,
  TEST_CODECS,
  VIDEO_TEST_CONFIG,
  AUDIO_TEST_CONFIG,
} from './constants';
import type {
  SDPCodecs,
  CodecCapability,
  WebRTCFingerprint,
  ParsedICECandidate,
  ICECandidateSummary,
} from './types';

/**
 * Private IP address patterns.
 *
 * RFC 1918 private ranges:
 * - 10.0.0.0/8 (Class A)
 * - 172.16.0.0/12 (Class B)
 * - 192.168.0.0/16 (Class C)
 *
 * Android commonly exposes 192.168.x.x addresses which is useful for profiling.
 */
const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;

/**
 * IPv6 pattern (simplified - catches most cases).
 */
const IPV6_PATTERN = /^[a-f0-9:]+$/i;

/**
 * mDNS obfuscation pattern (e.g., "abc123.local").
 * Modern browsers use this to hide real IPs.
 */
const MDNS_PATTERN = /\.local$/i;

/**
 * Categorizes an IP address for profiling.
 *
 * Categories:
 * - private: RFC 1918 private ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 * - public: Routable internet addresses
 * - ipv6: IPv6 addresses
 * - mdns: mDNS obfuscated addresses (xxx.local)
 * - unknown: Unable to categorize
 *
 * @param address - IP address or hostname to categorize
 * @returns Category string
 */
function categorizeIP(
  address: string,
): 'private' | 'public' | 'ipv6' | 'mdns' | 'unknown' {
  if (!address) return 'unknown';

  if (MDNS_PATTERN.test(address)) return 'mdns';
  if (PRIVATE_IP_PATTERN.test(address)) return 'private';
  if (IPV6_PATTERN.test(address)) return 'ipv6';

  // If it looks like an IPv4 address, assume public
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address)) return 'public';

  return 'unknown';
}

/**
 * Parses an ICE candidate string into structured data.
 *
 * ICE candidate format (RFC 5245):
 * candidate:foundation component-id transport priority address port typ type [raddr rport]
 *
 * Example:
 * "candidate:842163049 1 udp 1677729535 192.168.1.100 54321 typ host generation 0"
 *
 * @param candidateStr - Raw candidate string from RTCIceCandidate
 * @returns Parsed candidate data or null if invalid
 */
function parseICECandidate(candidateStr: string): ParsedICECandidate | null {
  if (!candidateStr) return null;

  // Match: candidate:foundation component protocol priority address port typ type
  const match = candidateStr.match(
    /candidate:(\S+)\s+\d+\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s+typ\s+(\S+)/i,
  );

  if (!match) return null;

  const [, foundation, protocol, priority, address, port, type] = match;

  return {
    foundation,
    protocol: protocol.toLowerCase() as 'udp' | 'tcp',
    priority: parseInt(priority, 10),
    address,
    port: parseInt(port, 10),
    type: type as 'host' | 'srflx' | 'prflx' | 'relay',
    category: categorizeIP(address),
    raw: candidateStr,
  };
}

/**
 * Summarizes collected ICE candidates for profiling.
 *
 * Provides aggregated analysis of all candidates:
 * - Type distribution (host/srflx/relay counts)
 * - IP category distribution (private/public/mdns)
 * - Android detection (exposes private IPs)
 * - Privacy tool detection (mDNS obfuscation)
 * - ALL collected IPs ordered by preference (public IPv4 > private > IPv6)
 *
 * @param candidates - Array of parsed ICE candidates
 * @returns Summary with counts, flags, and all IPs
 */
function summarizeICECandidates(
  candidates: ParsedICECandidate[],
): ICECandidateSummary {
  const typeCount: Record<string, number> = {};
  const categoryCount: Record<string, number> = {};
  const publicIPs: string[] = [];
  const privateIPs: string[] = [];
  const ipv6Addresses: string[] = [];
  let hasMDNS = false;

  for (const candidate of candidates) {
    // Count by type
    typeCount[candidate.type] = (typeCount[candidate.type] || 0) + 1;

    // Count by category
    categoryCount[candidate.category] =
      (categoryCount[candidate.category] || 0) + 1;

    // Track IPs by category (avoid duplicates)
    if (candidate.category === 'public') {
      if (!publicIPs.includes(candidate.address)) {
        publicIPs.push(candidate.address);
      }
    } else if (candidate.category === 'private') {
      if (!privateIPs.includes(candidate.address)) {
        privateIPs.push(candidate.address);
      }
    } else if (candidate.category === 'ipv6') {
      if (!ipv6Addresses.includes(candidate.address)) {
        ipv6Addresses.push(candidate.address);
      }
    } else if (candidate.category === 'mdns') {
      hasMDNS = true;
    }
  }

  // Build allIPs array ordered by preference: public IPv4 > private IPv4 > IPv6
  const allIPs = [...publicIPs, ...privateIPs, ...ipv6Addresses];

  // Primary IP is the "best" one for comparison with server-side
  // Prefer: public IPv4 > private IPv4 > IPv6
  const primaryIP = publicIPs[0] || privateIPs[0] || ipv6Addresses[0];

  // Note: Raw candidates array is intentionally excluded from output
  // to avoid bloating fingerprint with non-deterministic data
  return {
    typeCount,
    categoryCount,
    hasPrivateIP: privateIPs.length > 0,
    hasMDNS,
    publicIP: publicIPs[0],
    privateIPs,
    ipv6Addresses,
    allIPs,
    primaryIP,
  };
}

/**
 * Enumerates available media devices.
 *
 * Returns the kinds of media devices (audioinput, audiooutput, videoinput)
 * without exposing device labels (which require permission).
 *
 * @returns Sorted array of device kinds or null if unsupported
 */
export async function getWebRTCDevices(): Promise<MediaDeviceKind[] | null> {
  if (!navigator?.mediaDevices?.enumerateDevices) return null;
  return navigator.mediaDevices.enumerateDevices().then((devices) => {
    return devices.map((device) => device.kind).sort();
  });
}

/**
 * Builds media configuration for MediaCapabilities API test.
 */
function getMediaConfig(
  codec: string,
  video: typeof VIDEO_TEST_CONFIG,
  audio: typeof AUDIO_TEST_CONFIG,
): MediaDecodingConfiguration {
  return {
    type: 'file',
    video: !/^video/.test(codec)
      ? undefined
      : {
          contentType: codec,
          ...video,
        },
    audio: !/^audio/.test(codec)
      ? undefined
      : {
          contentType: codec,
          ...audio,
        },
  };
}

/**
 * Queries MediaCapabilities API for codec support.
 *
 * The MediaCapabilities API provides more detailed codec information than
 * canPlayType, including smooth playback and power efficiency hints.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities
 * @returns Map of codec to support features (smooth, efficient)
 */
export async function getMediaCapabilities(): Promise<Record<
  string,
  string[]
> | null> {
  const decodingInfo = TEST_CODECS.map((codec) => {
    const config = getMediaConfig(codec, VIDEO_TEST_CONFIG, AUDIO_TEST_CONFIG);
    // @ts-expect-error - mediaCapabilities may not be fully typed
    return navigator.mediaCapabilities
      .decodingInfo(config)
      .then(
        (support: {
          supported: boolean;
          smooth: boolean;
          powerEfficient: boolean;
        }) => ({
          codec,
          ...support,
        }),
      )
      .catch(() => null);
  });

  const capabilities = await Promise.all(decodingInfo).then((data) => {
    return data.reduce(
      (acc, support) => {
        const { codec, supported, smooth, powerEfficient } = support || {};
        if (!supported) return acc;
        return {
          ...acc,
          ['' + codec]: [
            ...(smooth ? ['smooth'] : []),
            ...(powerEfficient ? ['efficient'] : []),
          ],
        };
      },
      {} as Record<string, string[]>,
    );
  });

  return capabilities;
}

/**
 * Extracts RTP header extensions from SDP.
 *
 * RTP extensions reveal WebRTC implementation details:
 * - urn:ietf:params:rtp-hdrext:toffset (transmission time offset)
 * - http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
 * - etc.
 *
 * @param sdp - Session Description Protocol string
 * @returns Sorted unique extension URIs
 */
function getExtensions(sdp: string): string[] {
  const extensions = (('' + sdp).match(/extmap:\d+ [^\n|\r]+/g) || []).map(
    (x) => x.replace(/extmap:[^\s]+ /, ''),
  );
  return [...new Set(extensions)].sort();
}

/**
 * Creates a counter utility for tracking RTX codec occurrences.
 */
function createCounter(): { increment: () => number; getValue: () => number } {
  let counter = 0;
  return {
    increment: () => (counter += 1),
    getValue: () => counter,
  };
}

/**
 * Constructs codec descriptions from SDP media descriptors.
 *
 * Parses rtpmap, fmtp, and rtcp-fb lines to build structured codec info.
 *
 * @param params - Media type, SDP string, and descriptors
 * @returns Array of codec capabilities
 */
function constructDescriptions(params: {
  mediaType: 'audio' | 'video';
  sdp: string;
  sdpDescriptors: string[];
  rtxCounter: ReturnType<typeof createCounter>;
}): CodecCapability[] | undefined {
  const { mediaType, sdp, sdpDescriptors, rtxCounter } = params;

  if (!('' + sdpDescriptors)) {
    return undefined;
  }

  return sdpDescriptors.reduce(
    (descriptionAcc: CodecCapability[], descriptor) => {
      const matcher = `(rtpmap|fmtp|rtcp-fb):${descriptor} (.+)`;
      const formats = sdp.match(new RegExp(matcher, 'g')) || [];

      if (!('' + formats)) {
        return descriptionAcc;
      }

      // RTX (retransmission) codec - only include once
      const isRtxCodec = ('' + formats).includes(' rtx/');
      if (isRtxCodec) {
        if (rtxCounter.getValue()) {
          return descriptionAcc;
        }
        rtxCounter.increment();
      }

      const getLineData = (x: string) => x.replace(/[^\s]+ /, '');

      const description = formats.reduce((acc: Partial<CodecCapability>, x) => {
        const rawData = getLineData(x);
        const data = rawData.split('/');
        const codec = data[0];

        if (x.includes('rtpmap')) {
          if (mediaType === 'audio') {
            acc.channels = +data[2] || 1;
          }
          acc.mimeType = `${mediaType}/${codec}`;
          acc.clockRates = [+data[1]];
          return acc;
        } else if (x.includes('rtcp-fb')) {
          acc.feedbackSupport = [...(acc.feedbackSupport || []), rawData];
          return acc;
        } else if (isRtxCodec) {
          return acc; // no sdpFmtpLine
        }
        acc.sdpFmtpLine = [...rawData.split(';')];
        return acc;
      }, {});

      // Merge with existing description if same mimeType
      let shouldMerge = false;
      const mergerAcc = descriptionAcc.map((x) => {
        shouldMerge = x.mimeType === description.mimeType;
        if (shouldMerge) {
          if (x.feedbackSupport && description.feedbackSupport) {
            x.feedbackSupport = [
              ...new Set([
                ...x.feedbackSupport,
                ...description.feedbackSupport,
              ]),
            ];
          }
          if (x.sdpFmtpLine && description.sdpFmtpLine) {
            x.sdpFmtpLine = [
              ...new Set([...x.sdpFmtpLine, ...description.sdpFmtpLine]),
            ];
          }
          return {
            ...x,
            clockRates: [
              ...new Set([...x.clockRates, ...(description.clockRates || [])]),
            ],
          };
        }
        return x;
      });

      if (shouldMerge) {
        return mergerAcc;
      }
      return [...descriptionAcc, description as CodecCapability];
    },
    [],
  );
}

/**
 * Extracts audio and video codec capabilities from SDP.
 *
 * @param sdp - Session Description Protocol string
 * @returns Structured codec capabilities for audio and video
 */
function getCapabilities(sdp: string): SDPCodecs {
  const videoDescriptors = (
    (/m=video [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || ''
  ).split(' ');
  const audioDescriptors = (
    (/m=audio [^\s]+ [^\s]+ ([^\n|\r]+)/.exec(sdp) || [])[1] || ''
  ).split(' ');
  const rtxCounter = createCounter();

  return {
    audio: constructDescriptions({
      mediaType: 'audio',
      sdp,
      sdpDescriptors: audioDescriptors,
      rtxCounter,
    }),
    video: constructDescriptions({
      mediaType: 'video',
      sdp,
      sdpDescriptors: videoDescriptors,
      rtxCounter,
    }),
  };
}

/**
 * Extracts IP address from SDP.
 *
 * Attempts to find IP from:
 * 1. Connection line (c=IN IP4/IP6 address)
 * 2. ICE candidate encoding
 *
 * Returns undefined if blocked (0.0.0.0) or not found.
 *
 * @param sdp - Session Description Protocol string
 * @returns IP address or undefined
 */
function getIPAddress(sdp: string): string | undefined {
  const blocked = '0.0.0.0';

  // Try connection line first
  const connectionLineEncoding = /(c=IN\s)(.+)\s/gi;
  const connectionLineIpAddress = (
    (sdp.match(connectionLineEncoding) || [])[0] || ''
  )
    .trim()
    .split(' ')[2];

  if (connectionLineIpAddress && connectionLineIpAddress !== blocked) {
    return connectionLineIpAddress;
  }

  // Try ICE candidate
  const candidateEncoding =
    /((udp|tcp)\s)((\d|\w)+\s)((\d|\w|(\.|\:))+)(?=\s)/gi;
  const candidateIpAddress = (
    (sdp.match(candidateEncoding) || [])[0] || ''
  ).split(' ')[2];

  return candidateIpAddress && candidateIpAddress !== blocked
    ? candidateIpAddress
    : undefined;
}

/**
 * Collects WebRTC fingerprint data.
 *
 * Creates an RTCPeerConnection, generates an SDP offer, and extracts:
 * - Codec capabilities (audio/video)
 * - RTP extensions
 * - ICE candidate foundation (network interface identifier)
 * - IP address (if available through STUN)
 * - ALL ICE candidates with parsed analysis (for profiling)
 *
 * ## ICE Candidate Collection
 *
 * We collect ALL candidates (not just the first) because:
 * - Android exposes private IPs (192.168.x.x) which is a profiling signal
 * - Multiple candidates reveal network configuration
 * - mDNS obfuscation presence indicates privacy tools
 * - Candidate type distribution is a fingerprint
 *
 * @returns WebRTC fingerprint data or null if unsupported
 */
export default async function getWebRTCData(): Promise<WebRTCFingerprint | null> {
  return new Promise(async (resolve) => {
    if (!window.RTCPeerConnection) {
      return resolve(null);
    }

    const connection = new RTCPeerConnection(getRtcConfig());
    connection.createDataChannel('');

    const options = { offerToReceiveAudio: 1, offerToReceiveVideo: 1 };
    const offer = await connection.createOffer(
      options as unknown as RTCOfferOptions,
    );

    connection.setLocalDescription(offer);
    const { sdp } = offer || {};

    const extensions = getExtensions(sdp || '');
    const codecsSdp = getCapabilities(sdp || '');

    let firstCandidate = '';
    let foundation = '';
    let firstAddress = '';
    const collectedCandidates: ParsedICECandidate[] = [];

    /**
     * Finalizes collection and returns results.
     */
    const finalize = () => {
      connection.removeEventListener('icecandidate', computeCandidate);
      connection.close();

      if (!sdp) {
        return resolve(null);
      }

      const iceCandidates = summarizeICECandidates(collectedCandidates);

      // Use summary's public IP if we didn't get one from SDP
      const address = firstAddress || iceCandidates.publicIP;

      // Note: Raw iceCandidate/stunConnection strings are excluded
      // because they contain random session-specific data that shouldn't be hashed.
      // Only stable data (codecsSdp, extensions) should be used for fingerprint hashing.
      return resolve({
        codecsSdp,
        extensions,
        foundation: KNOWN_FOUNDATIONS[foundation] || foundation,
        foundationProp: foundation,
        address,
        iceCandidates,
      });
    };

    // Timeout for ICE candidate gathering
    const giveUpOnIPAddress = setTimeout(finalize, ICE_GATHER_TIMEOUT);

    // ICE candidate handler - collects ALL candidates
    const computeCandidate = (event: RTCPeerConnectionIceEvent) => {
      const { candidate } = event.candidate || {};

      // Null candidate signals gathering complete
      if (!candidate) {
        clearTimeout(giveUpOnIPAddress);
        finalize();
        return;
      }

      // Parse and collect this candidate
      const parsed = parseICECandidate(candidate);
      if (parsed) {
        collectedCandidates.push(parsed);
      }

      // Track first candidate for backward compatibility
      if (!firstCandidate) {
        firstCandidate = candidate;
        foundation = (/^candidate:([\w]+)/.exec(candidate) || [])[1] || '';
      }

      // Try to get address from SDP (for backward compatibility)
      if (!firstAddress) {
        const { sdp: localSdp } = connection.localDescription || {};
        firstAddress = getIPAddress(localSdp || '') || '';
      }
    };

    connection.addEventListener('icecandidate', computeCandidate);
  });
}
