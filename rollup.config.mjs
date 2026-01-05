import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const terserOptions = {
  compress: {
    passes: 2,
  },
  mangle: true,
  format: {
    comments: false,
  },
};

/**
 * Custom plugin to inline WASM files as base64 strings.
 * Handles imports like: import wasmBase64 from './file.wasm?base64'
 */
function wasmBase64Plugin() {
  return {
    name: 'wasm-base64',
    resolveId(source, importer) {
      if (source.endsWith('.wasm?base64')) {
        // Resolve the actual file path
        const cleanPath = source.replace('?base64', '');
        const resolved = resolve(dirname(importer), cleanPath);
        return resolved + '?base64';
      }
      return null;
    },
    load(id) {
      if (id.endsWith('.wasm?base64')) {
        const filePath = id.replace('?base64', '');
        try {
          const wasmBuffer = readFileSync(filePath);
          const base64 = wasmBuffer.toString('base64');
          return `export default "${base64}";`;
        } catch (err) {
          this.error(`Failed to load WASM file: ${filePath}`);
        }
      }
      return null;
    }
  };
}

/**
 * Custom plugin to strip inline data for lite builds.
 * Removes large data arrays and replaces them with empty stubs.
 */
function stripInlineData() {
  return {
    name: 'strip-inline-data',
    transform(code, id) {
      // Only process specific files
      if (id.includes('features/index.ts')) {
        // Replace getStableFeatures function with empty stub
        code = code.replace(
          /const getStableFeatures = \(\) => \(\{[\s\S]*?\}\);/,
          `const getStableFeatures = () => ({
  Chrome: { version: 0, windowKeys: '', cssKeys: '' },
  Firefox: { version: 0, windowKeys: '', cssKeys: '' },
});`
        );

        // Replace getEngineMaps function with empty stub
        code = code.replace(
          /const getEngineMaps = \(browser\) => \{[\s\S]*?return engineMap;[\s\S]*?\};/,
          `const getEngineMaps = (browser) => ({ js: {}, css: {}, win: {} });`
        );
      }

      if (id.includes('timezone/constants.ts')) {
        // Replace TIMEZONE_CITIES_INLINE with empty array
        code = code.replace(
          /export const TIMEZONE_CITIES_INLINE = \[[\s\S]*?\] as const;/,
          `export const TIMEZONE_CITIES_INLINE = [] as const;`
        );
      }

      if (id.includes('webgl/constants.ts')) {
        // Replace KNOWN_GPU_BRAND_CAPABILITIES with empty array
        code = code.replace(
          /export const KNOWN_GPU_BRAND_CAPABILITIES = \[[\s\S]*?\] as const;/,
          `export const KNOWN_GPU_BRAND_CAPABILITIES = [] as const;`
        );

        // Replace KNOWN_CAPABILITIES with empty array
        code = code.replace(
          /export const KNOWN_CAPABILITIES = \[[\s\S]*?\] as const;/,
          `export const KNOWN_CAPABILITIES = [] as const;`
        );
      }

      return { code, map: null };
    },
  };
}

export default [
  // ESM build for modern bundlers
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
    ],
  },
  // ESM minified build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.esm.min.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
      terser(terserOptions),
    ],
  },
  // IIFE build for direct browser use
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.iife.js',
      format: 'iife',
      name: 'Argus',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
    ],
  },
  // IIFE minified build for CDN
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.iife.min.js',
      format: 'iife',
      name: 'Argus',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
      terser(terserOptions),
    ],
  },
  // ============================================================================
  // LITE BUILDS - External data loading, smaller bundle
  // Requires /data/*.json files to be served alongside the script
  // ============================================================================
  // ESM lite minified build (primary CDN target)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.lite.esm.min.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      stripInlineData(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
      terser(terserOptions),
    ],
  },
  // IIFE lite minified build for CDN
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/argus.lite.iife.min.js',
      format: 'iife',
      name: 'Argus',
      sourcemap: true,
    },
    plugins: [
      wasmBase64Plugin(),
      stripInlineData(),
      typescript({
        tsconfig: './tsconfig.json',
        noEmitOnError: false,
        outDir: 'dist',
      }),
      terser(terserOptions),
    ],
  },
];
