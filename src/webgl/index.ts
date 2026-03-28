/**
 * WebGL Fingerprinting Module
 *
 * Extracts GPU and graphics driver information via the WebGL API.
 * WebGL fingerprinting is one of the most reliable and high-entropy
 * fingerprinting methods because:
 *
 * 1. **GPU Parameters**: Each GPU model has unique limits (MAX_TEXTURE_SIZE,
 *    MAX_VIEWPORT_DIMS, etc.) that are hardware-dependent and rarely spoofed.
 *
 * 2. **Shader Precision**: Floating-point precision varies between GPU vendors
 *    (NVIDIA vs AMD vs Intel) and even between GPU generations.
 *
 * 3. **Rendered Pixels**: Drawing operations produce subtly different results
 *    due to GPU-specific rasterization, anti-aliasing, and color handling.
 *
 * 4. **Extensions**: The set of supported extensions reveals driver version
 *    and GPU capabilities.
 *
 * 5. **Unmasked Renderer**: The WEBGL_debug_renderer_info extension exposes
 *    the actual GPU model string (when available).
 *
 * @module webgl
 */

import { attempt, captureError } from '../errors';
import { lieProps, PHANTOM_DARKNESS } from '../lies';
import {
  sendToTrash,
  getWebGLRendererConfidence,
  compressWebGLRenderer,
} from '../trash';
import { hashMini } from '../utils/crypto';
import {
  IS_WEBKIT,
  createTimer,
  queueEvent,
  LIKE_BRAVE,
  logTestResult,
  getGpuBrand,
  Analysis,
} from '../utils/helpers';
import { expectFailure } from '../utils/expected-failure';

import {
  WEBGL_PARAMS,
  VERSION_PARAMS,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  TRIANGLE_VERTICES,
} from './constants';
import type {
  WebGLFingerprint,
  WebGLParameters,
  ShaderPrecisionData,
  ShaderPrecisionFormat,
  WebGLPixelData,
  UnmaskedGpuInfo,
} from './types';

/**
 * Gets the sorted list of WebGL parameters to query.
 *
 * The list is sorted alphabetically to ensure consistent ordering
 * when computing hashes across different browsers and sessions.
 *
 * @returns Sorted array of WebGL parameter names
 */
function getParamNames(): string[] {
  return [...WEBGL_PARAMS].sort();
}

/**
 * Checks if we should skip drawing for Safari 15+.
 *
 * Safari 15+ with BigInt64Array support has rendering issues with
 * the WebGL fingerprinting triangle. Skipping avoids errors while
 * still collecting parameter data.
 *
 * @returns True if drawing should be skipped
 */
function shouldSkipDrawing(): boolean {
  return (
    'BigInt64Array' in window &&
    IS_WEBKIT &&
    !/(Cr|Fx)iOS/.test(navigator.userAgent)
  );
}

/**
 * Draws a triangle on the WebGL canvas for pixel fingerprinting.
 *
 * This function renders a simple colored triangle using custom shaders.
 * The exact pixel values vary by GPU due to:
 * - Floating-point precision differences in shaders
 * - Rasterization algorithm variations
 * - Anti-aliasing implementation differences
 * - Color interpolation methods
 *
 * Based on the fingerprintjs2 WebGL drawing technique.
 *
 * @param gl - WebGL rendering context
 * @returns The context after drawing, or undefined if skipped
 */
function drawTriangle(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): WebGLRenderingContext | WebGL2RenderingContext | undefined {
  if (!gl || shouldSkipDrawing()) {
    return undefined;
  }

  // Clear the canvas
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Create and bind vertex buffer
  const vertexPosBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, TRIANGLE_VERTICES, gl.STATIC_DRAW);

  // Create shader program
  const program = gl.createProgram();
  if (!program) return undefined;

  // Compile and attach vertex shader
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  if (!vertexShader) return undefined;
  gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
  gl.compileShader(vertexShader);
  gl.attachShader(program, vertexShader);

  // Compile and attach fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) return undefined;
  gl.shaderSource(fragmentShader, FRAGMENT_SHADER_SOURCE);
  gl.compileShader(fragmentShader);
  gl.attachShader(program, fragmentShader);

  // Link and use the program
  gl.linkProgram(program);
  gl.useProgram(program);

  // Set up vertex attributes
  const vertexPosAttrib = gl.getAttribLocation(program, 'attrVertex');
  const offsetUniform = gl.getUniformLocation(program, 'uniformOffset');

  gl.enableVertexAttribArray(vertexPosAttrib);
  gl.vertexAttribPointer(vertexPosAttrib, 3, gl.FLOAT, false, 0, 0);
  gl.uniform2f(offsetUniform, 1, 1);

  // Draw the triangle
  gl.drawArrays(gl.LINE_LOOP, 0, 3);

  return gl;
}

/**
 * Gets a WebGL context with fallbacks for older browsers.
 *
 * Tries multiple context types in order of preference:
 * - webgl2/experimental-webgl2 for WebGL 2.0
 * - webgl/experimental-webgl/moz-webgl/webkit-3d for WebGL 1.0
 *
 * @param canvas - Canvas element or OffscreenCanvas
 * @param contextType - Either 'webgl' or 'webgl2'
 * @returns WebGL context or undefined if unavailable
 */
function getContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  contextType: 'webgl' | 'webgl2',
): WebGLRenderingContext | WebGL2RenderingContext | undefined {
  try {
    if (contextType === 'webgl2') {
      return (
        (canvas.getContext('webgl2') as WebGL2RenderingContext) ||
        (canvas.getContext(
          'experimental-webgl2' as any,
        ) as WebGL2RenderingContext)
      );
    }
    return (
      (canvas.getContext('webgl') as WebGLRenderingContext) ||
      (canvas.getContext(
        'experimental-webgl' as any,
      ) as WebGLRenderingContext) ||
      (canvas.getContext('moz-webgl' as any) as WebGLRenderingContext) ||
      (canvas.getContext('webkit-3d' as any) as WebGLRenderingContext)
    );
  } catch {
    expectFailure('getContext', 'WebGL context creation failed');
    return undefined;
  }
}

/**
 * Gets shader precision format for a specific shader and precision type.
 *
 * WebGL provides precision information for different numeric types in
 * vertex and fragment shaders. The actual precision varies by GPU and
 * is a strong fingerprinting signal.
 *
 * @param gl - WebGL context
 * @param shaderType - 'VERTEX_SHADER' or 'FRAGMENT_SHADER'
 * @returns Precision data for all precision levels
 */
function getShaderPrecisionFormat(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
  shaderType: 'VERTEX_SHADER' | 'FRAGMENT_SHADER',
): ShaderPrecisionData | undefined {
  if (!gl) return undefined;

  const shaderEnum = gl[shaderType] as number;

  return {
    LOW_FLOAT: attempt(
      () => gl.getShaderPrecisionFormat(shaderEnum, gl.LOW_FLOAT) ?? undefined,
    ) as ShaderPrecisionFormat | undefined,
    MEDIUM_FLOAT: attempt(
      () =>
        gl.getShaderPrecisionFormat(shaderEnum, gl.MEDIUM_FLOAT) ?? undefined,
    ) as ShaderPrecisionFormat | undefined,
    HIGH_FLOAT: attempt(
      () => gl.getShaderPrecisionFormat(shaderEnum, gl.HIGH_FLOAT) ?? undefined,
    ) as ShaderPrecisionFormat | undefined,
    HIGH_INT: attempt(
      () => gl.getShaderPrecisionFormat(shaderEnum, gl.HIGH_INT) ?? undefined,
    ) as ShaderPrecisionFormat | undefined,
  };
}

/**
 * Flattens shader precision data into individual properties.
 *
 * Converts the nested structure into flat keys like:
 * "VERTEX_SHADER.LOW_FLOAT.precision", "VERTEX_SHADER.LOW_FLOAT.rangeMax", etc.
 *
 * @param name - Shader type name prefix
 * @param shader - Shader precision data
 * @returns Flattened key-value pairs
 */
function getShaderData(
  name: string,
  shader: ShaderPrecisionData | undefined,
): Record<string, number | undefined> {
  const data: Record<string, number | undefined> = {};
  if (!shader) return data;

  for (const prop in shader) {
    const obj = shader[prop as keyof ShaderPrecisionData];
    data[`${name}.${prop}.precision`] = obj
      ? attempt(() => obj.precision)
      : undefined;
    data[`${name}.${prop}.rangeMax`] = obj
      ? attempt(() => obj.rangeMax)
      : undefined;
    data[`${name}.${prop}.rangeMin`] = obj
      ? attempt(() => obj.rangeMin)
      : undefined;
  }
  return data;
}

/**
 * Gets the maximum anisotropic filtering level.
 *
 * Anisotropic filtering improves texture quality at oblique angles.
 * The maximum level is GPU-dependent and varies from 2 to 16+.
 *
 * @param gl - WebGL context
 * @returns Maximum anisotropy value or undefined
 */
function getMaxAnisotropy(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): number | undefined {
  if (!gl) return undefined;

  // Try vendor-prefixed extensions for broader compatibility
  const ext =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');

  if (!ext) return undefined;

  // The constant is defined on the extension object
  const maxAnisotropyConst = (ext as { MAX_TEXTURE_MAX_ANISOTROPY_EXT: number })
    .MAX_TEXTURE_MAX_ANISOTROPY_EXT;
  return gl.getParameter(maxAnisotropyConst);
}

/**
 * Collects all WebGL parameters from the context.
 *
 * Iterates through the predefined parameter list and extracts values.
 * Array-like values (Float32Array, Int32Array) are converted to regular
 * arrays for consistent serialization.
 *
 * @param gl - WebGL context
 * @returns Object mapping parameter names to values
 */
function getParams(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): Record<string, unknown> {
  if (!gl) return {};

  const pnamesShortList = new Set(getParamNames());
  const pnames = Object.getOwnPropertyNames(Object.getPrototypeOf(gl)).filter(
    (name) => pnamesShortList.has(name),
  );

  return pnames.reduce(
    (acc, name) => {
      const val = gl.getParameter(
        (gl as unknown as Record<string, number>)[name],
      );
      // Convert typed arrays to regular arrays
      if (
        val &&
        typeof val === 'object' &&
        'buffer' in Object.getPrototypeOf(val)
      ) {
        acc[name] = Array.from(val as ArrayLike<number>);
      } else {
        acc[name] = val;
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );
}

/**
 * Gets unmasked GPU vendor and renderer strings.
 *
 * The WEBGL_debug_renderer_info extension exposes the actual GPU
 * identity, bypassing browser privacy protections. This is the most
 * direct way to identify the GPU hardware.
 *
 * Note: Some browsers (Firefox with privacy.resistFingerprinting)
 * block this extension entirely.
 *
 * @param gl - WebGL context
 * @returns Unmasked vendor and renderer or empty object
 */
function getUnmasked(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): UnmaskedGpuInfo {
  if (!gl) return {};

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return {};

  return {
    UNMASKED_VENDOR_WEBGL: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
    UNMASKED_RENDERER_WEBGL: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
  };
}

/**
 * Gets the list of supported WebGL extensions.
 *
 * Extensions reveal driver capabilities and version. The set of
 * extensions varies by:
 * - GPU vendor and model
 * - Driver version
 * - Browser and OS
 *
 * @param gl - WebGL context
 * @returns Array of extension names
 */
function getSupportedExtensions(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): string[] {
  if (!gl) return [];
  const ext = attempt(() => gl.getSupportedExtensions());
  return ext || [];
}

/**
 * Extracts pixel data from a WebGL canvas.
 *
 * Draws the fingerprinting triangle and reads back pixel values.
 * The pixel data varies by GPU due to rendering differences.
 *
 * To reduce data size and improve performance, only a portion of
 * the framebuffer is read (1/15 width, 1/6 height).
 *
 * @param gl - WebGL context
 * @param contextType - Context type for OffscreenCanvas handling
 * @returns Data URI and raw pixel array
 */
function getWebGLData(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
  contextType: 'webgl' | 'webgl2',
): WebGLPixelData | undefined {
  if (!gl) {
    return { dataURI: undefined, pixels: undefined };
  }

  try {
    drawTriangle(gl);
    const { drawingBufferWidth, drawingBufferHeight } = gl;

    // Get data URI (handle OffscreenCanvas differently)
    let dataURI = '';
    if (gl.canvas.constructor.name === 'OffscreenCanvas') {
      // OffscreenCanvas doesn't have toDataURL, use regular canvas
      const canvas = document.createElement('canvas');
      const ctx = getContext(canvas, contextType);
      if (ctx) {
        drawTriangle(ctx);
        dataURI = canvas.toDataURL();
      }
    } else {
      dataURI = (gl.canvas as HTMLCanvasElement).toDataURL();
    }

    // Read a reduced portion of pixels for performance
    // Full buffer would be 256*256*4 = 262144 bytes
    const width = Math.floor(drawingBufferWidth / 15);
    const height = Math.floor(drawingBufferHeight / 6);
    const pixels = new Uint8Array(width * height * 4);

    try {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } catch {
      expectFailure('getWebGLData', 'gl.readPixels failed');
      return { dataURI, pixels: undefined };
    }

    return {
      dataURI,
      pixels: [...pixels],
    };
  } catch (error) {
    captureError(error as Error);
    return undefined;
  }
}

/**
 * Checks for lie detection on WebGL-related APIs.
 *
 * Returns the lie array if any tampering was detected on:
 * - HTMLCanvasElement.toDataURL
 * - HTMLCanvasElement.getContext
 * - WebGLRenderingContext.getParameter/getExtension
 * - WebGL2RenderingContext.getParameter/getExtension
 * - getSupportedExtensions
 *
 * @returns Lie array or false if no tampering detected
 */
function detectWebGLLies(): {
  lied: number | false;
  parameterOrExtensionLie: number | false;
} {
  const dataLie = lieProps['HTMLCanvasElement.toDataURL'];
  const contextLie = lieProps['HTMLCanvasElement.getContext'];
  const parameterOrExtensionLie =
    lieProps['WebGLRenderingContext.getParameter'] ||
    lieProps['WebGL2RenderingContext.getParameter'] ||
    lieProps['WebGLRenderingContext.getExtension'] ||
    lieProps['WebGL2RenderingContext.getExtension'];

  const lied =
    dataLie ||
    contextLie ||
    parameterOrExtensionLie ||
    lieProps['WebGLRenderingContext.getSupportedExtensions'] ||
    lieProps['WebGL2RenderingContext.getSupportedExtensions'] ||
    false;

  return {
    lied,
    parameterOrExtensionLie: parameterOrExtensionLie || false,
  };
}

/**
 * Computes capability hashes for GPU firewall checking.
 *
 * Two hashes are computed:
 * 1. Brand capabilities: hashMini([gpuBrand, paramsString])
 * 2. XOR capabilities: params.reduce((acc, val, i) => acc ^ (val + i), 0)
 *
 * These are compared against known good values to detect:
 * - VM/emulator GPUs
 * - Spoofed GPU parameters
 * - Rare or unusual configurations
 *
 * @param params - WebGL parameters including UNMASKED_RENDERER_WEBGL
 * @returns Capability hashes
 */
function computeCapabilityHashes(params: WebGLParameters): {
  webglParams: number[] | undefined;
  webglBrandCapabilities: string | undefined;
  webglCapabilities: number | undefined;
} {
  // Extract all numeric parameter values
  const webglParams = !params
    ? undefined
    : [
        ...new Set(
          Object.values(params)
            .filter((val) => val && typeof val !== 'string')
            .flat()
            .map((val) => Number(val)),
        ),
      ].sort((a, b) => a - b);

  const gpuBrand = getGpuBrand(params?.UNMASKED_RENDERER_WEBGL as string);
  const webglParamsStr = '' + webglParams;

  // Brand + params hash for vendor-specific validation
  const webglBrandCapabilities =
    !gpuBrand || !webglParamsStr
      ? undefined
      : hashMini([gpuBrand, webglParamsStr]);

  // XOR hash of all numeric params
  const webglCapabilities = !webglParams
    ? undefined
    : webglParams.reduce((acc, val, i) => acc ^ (+val + i), 0);

  return { webglParams, webglBrandCapabilities, webglCapabilities };
}

/**
 * Creates a canvas for WebGL context creation.
 *
 * Uses OffscreenCanvas when available for better performance,
 * falls back to regular canvas element.
 *
 * @param win - Window context to use
 * @returns Canvas suitable for WebGL
 */
function createWebGLCanvas(
  win: Window & typeof globalThis,
): HTMLCanvasElement | OffscreenCanvas {
  if ('OffscreenCanvas' in window) {
    return new (win as any).OffscreenCanvas(256, 256);
  }
  return win.document.createElement('canvas');
}

/**
 * Collects WebGL fingerprint data.
 *
 * This is the main entry point for WebGL fingerprinting. It:
 * 1. Creates WebGL and WebGL2 contexts
 * 2. Collects all GPU parameters from both contexts
 * 3. Draws a triangle and extracts pixel data
 * 4. Gathers supported extensions
 * 5. Validates against known GPU configurations
 * 6. Checks for API tampering
 *
 * @returns Complete WebGL fingerprint or undefined if unavailable
 */
export default async function getCanvasWebgl(): Promise<
  WebGLFingerprint | undefined
> {
  try {
    const timer = createTimer();
    await queueEvent(timer);

    // Check for API tampering
    const { lied, parameterOrExtensionLie } = detectWebGLLies();

    // Use phantom darkness iframe for isolation (except in Brave)
    let win: Window & typeof globalThis = window;
    if (!LIKE_BRAVE && PHANTOM_DARKNESS) {
      win = PHANTOM_DARKNESS;
    }

    // Create canvases for WebGL and WebGL2
    const canvas = createWebGLCanvas(win);
    const canvas2 = createWebGLCanvas(win);

    // Get contexts
    const gl = getContext(canvas, 'webgl');
    const gl2 = getContext(canvas2, 'webgl2');

    if (!gl) {
      logTestResult({ test: 'webgl', passed: false });
      return undefined;
    }

    // Collect parameters from both contexts
    await queueEvent(timer);
    const params = { ...getParams(gl ?? null), ...getUnmasked(gl ?? null) };
    const params2 = { ...getParams(gl2 ?? null), ...getUnmasked(gl2 ?? null) };

    // Check for parameter mismatches between WebGL and WebGL2
    // (excluding parameters that legitimately differ)
    const mismatch = Object.keys(params2).filter((key) => {
      const p = params as Record<string, unknown>;
      const p2 = params2 as Record<string, unknown>;
      return !!p[key] && !VERSION_PARAMS[key] && '' + p[key] !== '' + p2[key];
    });

    if (mismatch.length) {
      sendToTrash('webgl/webgl2 mirrored params mismatch', mismatch.toString());
    }

    // Extract pixel data from both contexts
    await queueEvent(timer);
    const { dataURI, pixels } = getWebGLData(gl ?? null, 'webgl') || {};
    const { dataURI: dataURI2, pixels: pixels2 } =
      getWebGLData(gl2 ?? null, 'webgl2') || {};

    // Combine all parameters and additional data
    const combinedParams: WebGLParameters = {
      ...params,
      ...params2,
      antialias: gl.getContextAttributes()?.antialias,
      MAX_VIEWPORT_DIMS: attempt(() => [
        ...gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      ]),
      MAX_TEXTURE_MAX_ANISOTROPY_EXT: getMaxAnisotropy(gl),
      ...getShaderData(
        'VERTEX_SHADER',
        getShaderPrecisionFormat(gl, 'VERTEX_SHADER'),
      ),
      ...getShaderData(
        'FRAGMENT_SHADER',
        getShaderPrecisionFormat(gl, 'FRAGMENT_SHADER'),
      ),
      MAX_DRAW_BUFFERS_WEBGL: attempt(() => {
        const buffers = gl.getExtension('WEBGL_draw_buffers');
        return buffers
          ? gl.getParameter(
              (buffers as { MAX_DRAW_BUFFERS_WEBGL: number })
                .MAX_DRAW_BUFFERS_WEBGL,
            )
          : undefined;
      }),
    };

    // Hash pixel arrays and data URIs to reduce fingerprint size
    const data = {
      extensions: [
        ...getSupportedExtensions(gl ?? null),
        ...getSupportedExtensions(gl2 ?? null),
      ],
      pixels: pixels ? hashMini(pixels) : undefined,
      pixels2: pixels2 ? hashMini(pixels2) : undefined,
      dataURI: dataURI ? hashMini(dataURI) : undefined,
      dataURI2: dataURI2 ? hashMini(dataURI2) : undefined,
      parameters: combinedParams,
      parameterOrExtensionLie,
      lied,
    };

    // Compute and validate capability hashes
    const { webglParams, webglBrandCapabilities, webglCapabilities } =
      computeCapabilityHashes(combinedParams);

    // Store for global analysis
    Analysis.webglParams = '' + webglParams;
    Analysis.webglBrandCapabilities = webglBrandCapabilities;
    Analysis.webglCapabilities = webglCapabilities;

    // NOTE: GPU validation moved server-side. See TODO-server-side-analysis.md
    // Server validates webglBrandCapabilities and webglCapabilities against known configs.

    logTestResult({ time: timer.stop(), test: 'webgl', passed: true });

    return {
      ...data,
      gpu: {
        ...(getWebGLRendererConfidence(
          combinedParams.UNMASKED_RENDERER_WEBGL ?? '',
        ) || {}),
        compressedGPU: compressWebGLRenderer(
          combinedParams.UNMASKED_RENDERER_WEBGL ?? '',
        ),
      },
    };
  } catch (error) {
    logTestResult({ test: 'webgl', passed: false });
    captureError(error as Error);
    return undefined;
  }
}
