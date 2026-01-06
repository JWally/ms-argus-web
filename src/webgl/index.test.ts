import { describe, it, expect } from 'vitest';
import {
  WEBGL_PARAMS,
  VERSION_PARAMS,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  TRIANGLE_VERTICES,
} from './constants';

describe('webgl constants', () => {
  describe('WEBGL_PARAMS', () => {
    it('is an array', () => {
      expect(Array.isArray(WEBGL_PARAMS)).toBe(true);
    });

    it('has multiple params', () => {
      expect(WEBGL_PARAMS.length).toBeGreaterThan(30);
    });

    it('all params are uppercase strings', () => {
      for (const param of WEBGL_PARAMS) {
        expect(typeof param).toBe('string');
        expect(param).toBe(param.toUpperCase());
      }
    });

    it('includes aliased geometry params', () => {
      expect(WEBGL_PARAMS).toContain('ALIASED_POINT_SIZE_RANGE');
      expect(WEBGL_PARAMS).toContain('ALIASED_LINE_WIDTH_RANGE');
    });

    it('includes stencil params', () => {
      expect(WEBGL_PARAMS).toContain('STENCIL_VALUE_MASK');
      expect(WEBGL_PARAMS).toContain('STENCIL_WRITEMASK');
      expect(WEBGL_PARAMS).toContain('STENCIL_BACK_VALUE_MASK');
      expect(WEBGL_PARAMS).toContain('STENCIL_BACK_WRITEMASK');
    });

    it('includes texture and viewport params', () => {
      expect(WEBGL_PARAMS).toContain('MAX_TEXTURE_SIZE');
      expect(WEBGL_PARAMS).toContain('MAX_VIEWPORT_DIMS');
      expect(WEBGL_PARAMS).toContain('SUBPIXEL_BITS');
    });

    it('includes shader limit params', () => {
      expect(WEBGL_PARAMS).toContain('MAX_VERTEX_ATTRIBS');
      expect(WEBGL_PARAMS).toContain('MAX_VERTEX_UNIFORM_VECTORS');
      expect(WEBGL_PARAMS).toContain('MAX_VARYING_VECTORS');
      expect(WEBGL_PARAMS).toContain('MAX_FRAGMENT_UNIFORM_VECTORS');
    });

    it('includes version and vendor params', () => {
      expect(WEBGL_PARAMS).toContain('SHADING_LANGUAGE_VERSION');
      expect(WEBGL_PARAMS).toContain('VENDOR');
      expect(WEBGL_PARAMS).toContain('RENDERER');
      expect(WEBGL_PARAMS).toContain('VERSION');
    });

    it('includes WebGL2-specific params', () => {
      expect(WEBGL_PARAMS).toContain('MAX_3D_TEXTURE_SIZE');
      expect(WEBGL_PARAMS).toContain('MAX_ELEMENTS_VERTICES');
      expect(WEBGL_PARAMS).toContain('MAX_DRAW_BUFFERS');
      expect(WEBGL_PARAMS).toContain('MAX_SAMPLES');
    });
  });

  describe('VERSION_PARAMS', () => {
    it('is an object', () => {
      expect(typeof VERSION_PARAMS).toBe('object');
    });

    it('marks ALIASED_LINE_WIDTH_RANGE as version-dependent', () => {
      expect(VERSION_PARAMS['ALIASED_LINE_WIDTH_RANGE']).toBe(true);
    });

    it('marks SHADING_LANGUAGE_VERSION as version-dependent', () => {
      expect(VERSION_PARAMS['SHADING_LANGUAGE_VERSION']).toBe(true);
    });

    it('marks VERSION as version-dependent', () => {
      expect(VERSION_PARAMS['VERSION']).toBe(true);
    });

    it('all values are true', () => {
      for (const value of Object.values(VERSION_PARAMS)) {
        expect(value).toBe(true);
      }
    });
  });

  // NOTE: KNOWN_GPU_BRAND_CAPABILITIES and KNOWN_CAPABILITIES moved server-side
  // See TODO-server-side-analysis.md for GPU validation requirements

  describe('VERTEX_SHADER_SOURCE', () => {
    it('is a non-empty string', () => {
      expect(typeof VERTEX_SHADER_SOURCE).toBe('string');
      expect(VERTEX_SHADER_SOURCE.length).toBeGreaterThan(0);
    });

    it('contains vertex shader code', () => {
      expect(VERTEX_SHADER_SOURCE).toContain('attribute');
      expect(VERTEX_SHADER_SOURCE).toContain('varying');
      expect(VERTEX_SHADER_SOURCE).toContain('uniform');
      expect(VERTEX_SHADER_SOURCE).toContain('gl_Position');
    });

    it('defines main function', () => {
      expect(VERTEX_SHADER_SOURCE).toContain('void main()');
    });

    it('uses vec2 for attributes and uniforms', () => {
      expect(VERTEX_SHADER_SOURCE).toContain('vec2 attrVertex');
      expect(VERTEX_SHADER_SOURCE).toContain('vec2 uniformOffset');
    });
  });

  describe('FRAGMENT_SHADER_SOURCE', () => {
    it('is a non-empty string', () => {
      expect(typeof FRAGMENT_SHADER_SOURCE).toBe('string');
      expect(FRAGMENT_SHADER_SOURCE.length).toBeGreaterThan(0);
    });

    it('contains fragment shader code', () => {
      expect(FRAGMENT_SHADER_SOURCE).toContain('precision');
      expect(FRAGMENT_SHADER_SOURCE).toContain('varying');
      expect(FRAGMENT_SHADER_SOURCE).toContain('gl_FragColor');
    });

    it('defines main function', () => {
      expect(FRAGMENT_SHADER_SOURCE).toContain('void main()');
    });

    it('uses mediump precision', () => {
      expect(FRAGMENT_SHADER_SOURCE).toContain('precision mediump float');
    });

    it('outputs vec4 color', () => {
      expect(FRAGMENT_SHADER_SOURCE).toContain('vec4(');
    });
  });

  describe('TRIANGLE_VERTICES', () => {
    it('is a Float32Array', () => {
      expect(TRIANGLE_VERTICES).toBeInstanceOf(Float32Array);
    });

    it('has 9 values (3 vertices x 3 coordinates)', () => {
      expect(TRIANGLE_VERTICES.length).toBe(9);
    });

    it('all values are in normalized device coordinates range', () => {
      for (const coord of TRIANGLE_VERTICES) {
        expect(coord).toBeGreaterThanOrEqual(-1);
        expect(coord).toBeLessThanOrEqual(1);
      }
    });

    it('z coordinates are 0', () => {
      // z coordinates are at index 2, 5, 8
      expect(TRIANGLE_VERTICES[2]).toBe(0);
      expect(TRIANGLE_VERTICES[5]).toBe(0);
      expect(TRIANGLE_VERTICES[8]).toBe(0);
    });

    it('vertices form asymmetric triangle', () => {
      // First vertex (bottom-left)
      expect(TRIANGLE_VERTICES[0]).toBeLessThan(0);
      expect(TRIANGLE_VERTICES[1]).toBeLessThan(0);

      // Second vertex (bottom-right)
      expect(TRIANGLE_VERTICES[3]).toBeGreaterThan(0);
      expect(TRIANGLE_VERTICES[4]).toBeLessThan(0);

      // Third vertex (top-center)
      expect(TRIANGLE_VERTICES[6]).toBe(0);
      expect(TRIANGLE_VERTICES[7]).toBeGreaterThan(0);
    });
  });
});

// Test pattern usage
describe('webgl pattern usage', () => {
  // NOTE: GPU validation tests moved server-side
  // See TODO-server-side-analysis.md for GPU validation requirements

  describe('version param filtering', () => {
    it('can filter out version-dependent params', () => {
      const nonVersionParams = WEBGL_PARAMS.filter((p) => !VERSION_PARAMS[p]);

      expect(nonVersionParams).not.toContain('VERSION');
      expect(nonVersionParams).not.toContain('SHADING_LANGUAGE_VERSION');
      expect(nonVersionParams).toContain('MAX_TEXTURE_SIZE');
    });
  });

  describe('XOR hash computation pattern', () => {
    it('demonstrates XOR hash computation', () => {
      const params = [1024, 2048, 4096, 8192];
      const xorHash = params.reduce((acc, val, i) => acc ^ (val + i), 0);

      expect(typeof xorHash).toBe('number');
      expect(Number.isInteger(xorHash)).toBe(true);
    });
  });
});
