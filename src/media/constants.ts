/**
 * Media Fingerprinting Constants
 *
 * MIME types to probe for codec support detection.
 */

/**
 * MIME types to test for media codec support.
 *
 * Different browsers/platforms support different codecs:
 * - Chrome supports VP8, VP9, H.264, Vorbis, Opus
 * - Firefox supports VP8, VP9, Theora, Vorbis, Opus
 * - Safari supports H.264, AAC, MP3 (limited VP9 support)
 *
 * The combination of supported codecs reveals the browser/OS.
 *
 * @see https://privacycheck.sec.lrz.de/active/fp_cpt/fp_can_play_type.html
 * @see https://arkenfox.github.io/TZP
 */
export const MIME_TYPE_TEST_LIST = [
  'audio/ogg; codecs="vorbis"',
  'audio/mpeg',
  'audio/mpegurl',
  'audio/wav; codecs="1"',
  'audio/x-m4a',
  'audio/aac',
  'video/ogg; codecs="theora"',
  'video/quicktime',
  'video/mp4; codecs="avc1.42E01E"',
  'video/webm; codecs="vp8"',
  'video/webm; codecs="vp9"',
  'video/x-matroska',
] as const;
