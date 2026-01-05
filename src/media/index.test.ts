import { describe, it, expect } from 'vitest';
import { MIME_TYPE_TEST_LIST } from './constants';

describe('media constants', () => {
  describe('MIME_TYPE_TEST_LIST', () => {
    it('is an array', () => {
      expect(Array.isArray(MIME_TYPE_TEST_LIST)).toBe(true);
    });

    it('has 12 MIME types', () => {
      expect(MIME_TYPE_TEST_LIST.length).toBe(12);
    });

    it('all entries are strings', () => {
      for (const mimeType of MIME_TYPE_TEST_LIST) {
        expect(typeof mimeType).toBe('string');
      }
    });

    it('includes audio MIME types', () => {
      const audioTypes = MIME_TYPE_TEST_LIST.filter((t) =>
        t.startsWith('audio/'),
      );
      expect(audioTypes.length).toBeGreaterThan(0);
    });

    it('includes video MIME types', () => {
      const videoTypes = MIME_TYPE_TEST_LIST.filter((t) =>
        t.startsWith('video/'),
      );
      expect(videoTypes.length).toBeGreaterThan(0);
    });

    it('includes Vorbis audio codec', () => {
      expect(MIME_TYPE_TEST_LIST).toContain('audio/ogg; codecs="vorbis"');
    });

    it('includes VP8 video codec', () => {
      expect(MIME_TYPE_TEST_LIST).toContain('video/webm; codecs="vp8"');
    });

    it('includes VP9 video codec', () => {
      expect(MIME_TYPE_TEST_LIST).toContain('video/webm; codecs="vp9"');
    });

    it('includes H.264 video codec', () => {
      expect(MIME_TYPE_TEST_LIST).toContain('video/mp4; codecs="avc1.42E01E"');
    });

    it('includes common container formats', () => {
      expect(MIME_TYPE_TEST_LIST).toContain('audio/mpeg');
      expect(MIME_TYPE_TEST_LIST).toContain('video/quicktime');
      expect(MIME_TYPE_TEST_LIST).toContain('video/x-matroska');
    });
  });
});
