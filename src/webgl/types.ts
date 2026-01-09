/**
 * WebGL Fingerprinting Types
 *
 * Type definitions for WebGL-based GPU fingerprinting data.
 */

/**
 * Shader precision format returned by gl.getShaderPrecisionFormat().
 *
 * Different GPUs support different precision levels for floating-point
 * and integer operations in shaders. These values are highly hardware-specific.
 */
export interface ShaderPrecisionFormat {
  /** Minimum representable value (log2) */
  rangeMin: number;
  /** Maximum representable value (log2) */
  rangeMax: number;
  /** Number of bits of precision */
  precision: number;
}

/**
 * Shader precision data for a shader type (vertex or fragment).
 *
 * WebGL requires reporting precision for different numeric types.
 * The actual precision varies by GPU and is a strong fingerprinting signal.
 */
export interface ShaderPrecisionData {
  /** Low precision float (lowp) */
  LOW_FLOAT?: ShaderPrecisionFormat;
  /** Medium precision float (mediump) */
  MEDIUM_FLOAT?: ShaderPrecisionFormat;
  /** High precision float (highp) */
  HIGH_FLOAT?: ShaderPrecisionFormat;
  /** High precision integer (highp int) */
  HIGH_INT?: ShaderPrecisionFormat;
}

/**
 * Flattened shader precision data for fingerprinting.
 *
 * The precision data is flattened to individual properties for easier
 * comparison and hashing. Format: "SHADER_TYPE.PRECISION_TYPE.property"
 */
export interface FlattenedShaderData {
  [
    key: `${'VERTEX_SHADER' | 'FRAGMENT_SHADER'}.${string}.${
      | 'precision'
      | 'rangeMin'
      | 'rangeMax'}`
  ]: number | undefined;
}

/**
 * Unmasked GPU information from WEBGL_debug_renderer_info extension.
 *
 * This extension exposes the actual GPU vendor and renderer strings,
 * bypassing browser privacy protections. Not available in all browsers.
 *
 * Examples:
 * - UNMASKED_VENDOR_WEBGL: "Google Inc. (NVIDIA Corporation)"
 * - UNMASKED_RENDERER_WEBGL: "ANGLE (NVIDIA GeForce RTX 3080 Direct3D11)"
 */
export interface UnmaskedGpuInfo {
  /** GPU vendor string (e.g., "Google Inc. (NVIDIA)") */
  UNMASKED_VENDOR_WEBGL?: string;
  /** GPU renderer string with model details */
  UNMASKED_RENDERER_WEBGL?: string;
}

/**
 * All WebGL parameters collected for fingerprinting.
 *
 * This combines the standard WebGL/WebGL2 parameters with shader precision
 * data and unmasked GPU information. The complete set provides a highly
 * unique GPU fingerprint.
 */
export interface WebGLParameters extends FlattenedShaderData, UnmaskedGpuInfo {
  /** Whether antialiasing is enabled */
  antialias?: boolean;
  /** Maximum viewport dimensions [width, height] */
  MAX_VIEWPORT_DIMS?: number[];
  /** Maximum texture anisotropy level */
  MAX_TEXTURE_MAX_ANISOTROPY_EXT?: number;
  /** Maximum draw buffers (from WEBGL_draw_buffers extension) */
  MAX_DRAW_BUFFERS_WEBGL?: number;
  /** All other WebGL parameters as key-value pairs */
  [key: string]: unknown;
}

/**
 * GPU confidence analysis result.
 *
 * Analyzes the UNMASKED_RENDERER_WEBGL string to determine confidence
 * in the reported GPU identity and detect potential spoofing.
 */
export interface GpuConfidence {
  /** GPU brand extracted from renderer string */
  gpu?: string;
  /** Confidence level in the reported GPU */
  confidence?: string;
  /** Reasons for reduced confidence */
  warnings?: string[];
}

/**
 * Result of pixel data extraction from WebGL canvas.
 */
export interface WebGLPixelData {
  /** Data URI of the rendered canvas (base64 PNG) */
  dataURI?: string;
  /** Raw pixel values from gl.readPixels() */
  pixels?: number[];
}

/**
 * Complete WebGL fingerprint result.
 *
 * Contains all data extracted from WebGL/WebGL2 contexts including
 * GPU parameters, rendered pixels, extensions, and lie detection status.
 *
 * Note: pixels and dataURI fields are hashed (not raw arrays/base64) to
 * reduce fingerprint size while maintaining uniqueness.
 */
export interface WebGLFingerprint {
  /** Supported WebGL extensions (combined WebGL + WebGL2) */
  extensions: string[];

  /** Hash of pixel data from WebGL context */
  pixels?: string;

  /** Hash of pixel data from WebGL2 context */
  pixels2?: string;

  /** Hash of data URI from WebGL canvas */
  dataURI?: string;

  /** Hash of data URI from WebGL2 canvas */
  dataURI2?: string;

  /** All collected WebGL parameters */
  parameters: WebGLParameters;

  /** Whether parameter/extension APIs show signs of tampering */
  parameterOrExtensionLie: string[] | false;

  /** Whether any WebGL API shows signs of tampering */
  lied: string[] | false;

  /** GPU analysis (confidence, compressed name) */
  gpu: GpuConfidence & {
    /** Normalized/compressed GPU renderer name */
    compressedGPU?: string;
  };
}
