/**
 * WebRTC Fingerprinting Constants
 *
 * Configuration for WebRTC data collection.
 */

/**
 * STUN servers for ICE candidate gathering.
 *
 * Google's public STUN servers are widely available and reliable.
 * STUN (Session Traversal Utilities for NAT) helps discover public IP.
 */
export const STUN_SERVERS = [
  'stun:stun4.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
];

/**
 * RTCPeerConnection configuration for fingerprinting.
 */
export const RTC_CONFIG = {
  iceCandidatePoolSize: 1,
  iceServers: [{ urls: STUN_SERVERS }],
};

/**
 * Known ICE candidate foundation values mapped to interface types.
 *
 * The foundation is a hash of the candidate's properties. Certain values
 * consistently map to specific network interface types.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8445#section-5.1.1.3
 */
export const KNOWN_FOUNDATIONS: Record<string, string> = {
  '842163049': 'public interface',
  '2268587630': 'WireGuard',
};

/**
 * Timeout for ICE candidate gathering (ms).
 * If no candidates are gathered within this time, we give up on IP discovery.
 */
export const ICE_GATHER_TIMEOUT = 1000;

/**
 * Media codecs to test for MediaCapabilities API.
 */
export const TEST_CODECS = [
  'audio/ogg; codecs=vorbis',
  'audio/ogg; codecs=flac',
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/mpeg; codecs="mp3"',
  'video/ogg; codecs="theora"',
  'video/mp4; codecs="avc1.42E01E"',
];

/**
 * Video test parameters for MediaCapabilities.
 */
export const VIDEO_TEST_CONFIG = {
  width: 1920,
  height: 1080,
  bitrate: 120000,
  framerate: 60,
};

/**
 * Audio test parameters for MediaCapabilities.
 */
export const AUDIO_TEST_CONFIG = {
  channels: 2,
  bitrate: 300000,
  samplerate: 5200,
};
