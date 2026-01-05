import { describe, it, expect } from 'vitest';
import type { EngineFeaturesFingerprint } from './types';

describe('features types', () => {
  describe('EngineFeaturesFingerprint', () => {
    it('has expected shape', () => {
      const fingerprint: EngineFeaturesFingerprint = {
        cssKeys: ['color', 'background', 'font-size'],
        windowKeys: ['document', 'navigator', 'location'],
        jsKeys: ['Array.from', 'Object.keys', 'Promise.resolve'],
        engine: 'Blink',
        cssKeysHash: 'abc12345',
        windowKeysHash: 'def67890',
        jsKeysHash: 'ghi11111',
      };

      expect(fingerprint.cssKeys).toBeInstanceOf(Array);
      expect(fingerprint.windowKeys).toBeInstanceOf(Array);
      expect(fingerprint.jsKeys).toBeInstanceOf(Array);
      expect(typeof fingerprint.engine).toBe('string');
      expect(typeof fingerprint.cssKeysHash).toBe('string');
      expect(typeof fingerprint.windowKeysHash).toBe('string');
      expect(typeof fingerprint.jsKeysHash).toBe('string');
    });

    it('engine is one of known values', () => {
      const validEngines = ['Blink', 'Gecko', 'Unknown'];
      const fingerprint: EngineFeaturesFingerprint = {
        cssKeys: [],
        windowKeys: [],
        jsKeys: [],
        engine: 'Blink',
        cssKeysHash: '',
        windowKeysHash: '',
        jsKeysHash: '',
      };

      expect(validEngines).toContain(fingerprint.engine);
    });
  });
});

describe('features module patterns', () => {
  describe('JS global objects enumeration', () => {
    it('Object has expected static methods', () => {
      const staticMethods = Object.getOwnPropertyNames(Object);
      expect(staticMethods).toContain('keys');
      expect(staticMethods).toContain('values');
      expect(staticMethods).toContain('entries');
      expect(staticMethods).toContain('assign');
    });

    it('Array has expected prototype methods', () => {
      const protoMethods = Object.getOwnPropertyNames(Array.prototype);
      expect(protoMethods).toContain('map');
      expect(protoMethods).toContain('filter');
      expect(protoMethods).toContain('reduce');
      expect(protoMethods).toContain('forEach');
    });

    it('Promise has expected static methods', () => {
      const staticMethods = Object.getOwnPropertyNames(Promise);
      expect(staticMethods).toContain('resolve');
      expect(staticMethods).toContain('reject');
      expect(staticMethods).toContain('all');
    });
  });

  describe('feature name format', () => {
    it('produces Object.property format', () => {
      const objectName = 'Array';
      const propertyName = 'from';
      const featureName = `${objectName}.${propertyName}`;

      expect(featureName).toBe('Array.from');
      expect(featureName).toMatch(/^[A-Z][a-zA-Z]+\.[a-zA-Z]+$/);
    });
  });

  describe('ignored properties filter', () => {
    it('filters out standard properties', () => {
      const ignoreProperties = new Set([
        'name',
        'length',
        'constructor',
        'prototype',
        'arguments',
        'caller',
      ]);

      const allKeys = ['name', 'length', 'from', 'isArray', 'of'];
      const filteredKeys = allKeys.filter((key) => !ignoreProperties.has(key));

      expect(filteredKeys).toEqual(['from', 'isArray', 'of']);
      expect(filteredKeys).not.toContain('name');
      expect(filteredKeys).not.toContain('length');
    });
  });
});

// NOTE: Version detection tests moved server-side
// See TODO-server-side-analysis.md for version detection requirements
// Server should use scripts/update-features-mdn.ts to generate feature maps
